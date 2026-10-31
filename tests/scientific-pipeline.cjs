// Independent checks of the production exporter and coordinate helpers. Expected
// data is read with a separate CSV reader; no exporter functions are imported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.runtime');
const cases = [];
const metrics = {};
const started = Date.now();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const close = (actual, expected, tolerance=1e-12) => assert.ok(Number.isFinite(actual) && Math.abs(actual-expected)<=tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
const vectorClose = (actual, expected, tolerance=1e-12) => {assert.equal(actual.length, expected.length);actual.forEach((value,i)=>close(value,expected[i],tolerance));};
const test = async (name, fn) => {
    try {await fn();cases.push({name,status:'passed'});}
    catch(error) {cases.push({name,status:'failed',error:error.stack || String(error)});}
};
function parseCsv(text) {
    const records=[];let fields=[],field='',quoted=false;
    for(let i=0;i<text.length;i++) {
        const c=text[i];
        if(c==='"') {
            if(quoted && text[i+1]==='"'){field+='"';i++;}
            else quoted=!quoted;
        } else if(c===',' && !quoted){fields.push(field);field='';}
        else if((c==='\r'||c==='\n') && !quoted){
            if(c==='\r'&&text[i+1]==='\n')i++;
            fields.push(field);if(fields.some(value=>value!==''))records.push(fields);
            fields=[];field='';
        } else field+=c;
    }
    assert.equal(quoted,false,'Raw CSV must end outside a quoted field');
    if(field || fields.length){fields.push(field);records.push(fields);}
    const header=records.shift();
    return {header,rows:records.map((row,i)=>{assert.equal(row.length,header.length,`CSV row ${i+2} width`);return Object.fromEntries(header.map((key,j)=>[key,row[j]]));})};
}
const numberOrNull = value => value.trim()==='' ? null : Number(value);
const textOrNull = value => value==='' ? null : value;
function decimalHalfStep(value) {
    const [mantissa,exponent='0']=value.trim().toLowerCase().split('e');
    const decimals=(mantissa.split('.')[1] || '').length;
    return 0.5 * 10 ** (Number(exponent)-decimals);
}
function independentDiagnostics(row) {
    const distance=Number(row.dist),alpha=Number(row.ra)*Math.PI/12,delta=Number(row.dec)*Math.PI/180;
    const calculated=[distance*Math.cos(delta)*Math.cos(alpha),distance*Math.cos(delta)*Math.sin(alpha),distance*Math.sin(delta)];
    const actual=[Number(row.x),Number(row.y),Number(row.z)];
    const residual=Math.hypot(...calculated.map((value,i)=>value-actual[i]));
    // Policy bound from the literal serialized decimal places. This diagnoses
    // internal consistency; it is not an astrometric error bar or confidence.
    const bound=decimalHalfStep(row.dist)+Math.abs(distance)*(decimalHalfStep(row.ra)*Math.PI/12+decimalHalfStep(row.dec)*Math.PI/180)+Math.hypot(...['x','y','z'].map(key=>decimalHalfStep(row[key])))+16*Number.EPSILON*Math.max(1,distance);
    return {residual,bound};
}
function generate(args) {
    const result=spawnSync('python',[path.join(root,'scripts/build_scientific_catalog.py'),...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:70000,maxBuffer:2*1024*1024});
    return {status:result.status,error:result.error?.message,stdout:result.stdout || '',stderr:result.stderr || ''};
}
function successful(result) {assert.equal(result.error,undefined);assert.equal(result.status,0,`${result.stderr}\n${result.stdout}`);}
function rejected(result, pattern) {assert.equal(result.error,undefined);assert.notEqual(result.status,0,'Bad data must fail with nonzero exit');assert.match(result.stderr+result.stdout,pattern);}
let temp;

async function main() {
    fs.mkdirSync(runtime,{recursive:true});
    temp=fs.mkdtempSync(path.join(runtime,'scientific-pipeline-'));
    const coordinates=await import(pathToFileURL(path.join(root,'utils/CatalogCoordinates.js')).href);
    const {equatorialToApp,appToEquatorial,sphericalToEquatorial}=coordinates;
    await test('Production frame remapping has the stated axes and preserves handedness',()=>{
        vectorClose(equatorialToApp([1,0,0]),[1,0,0]);
        vectorClose(equatorialToApp([0,1,0]),[0,0,-1]);
        vectorClose(equatorialToApp([0,0,1]),[0,1,0]);
        const a=equatorialToApp([1,0,0]),b=equatorialToApp([0,1,0]);
        vectorClose([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],equatorialToApp([0,0,1]));
    });
    await test('Production forward/inverse transforms preserve positions and Euclidean distances',()=>{
        for(const xyz of [[0,0,0],[1,2,3],[-5.4,7.2,-9.1],[99999.9,-0.000001,12.5]]) {
            const before=xyz.slice(),mapped=equatorialToApp(xyz);
            vectorClose(appToEquatorial(mapped),xyz,0);
            close(Math.hypot(...mapped),Math.hypot(...xyz),1e-10);
            assert.deepEqual(xyz,before,'The helper must not mutate source coordinates');
        }
        const a=[4,5,6],b=[-7,8,-9],ma=equatorialToApp(a),mb=equatorialToApp(b);
        close(Math.hypot(...a.map((v,i)=>v-b[i])),Math.hypot(...ma.map((v,i)=>v-mb[i])),1e-12);
    });
    await test('RA hours and declination degrees produce independently known cardinal and oblique positions',()=>{
        const get=(raHours,decDegrees,distancePc=1)=>sphericalToEquatorial({raHours,decDegrees,distancePc});
        vectorClose(get(0,0),[1,0,0]);vectorClose(get(6,0),[0,1,0]);vectorClose(get(12,0),[-1,0,0]);vectorClose(get(18,0),[0,-1,0]);
        vectorClose(get(3,45,2),[1,1,Math.SQRT2]);vectorClose(get(17,90,4),[0,0,4]);vectorClose(get(23,-90,4),[0,0,-4]);
        vectorClose(get(4,30,0),[0,0,0]);
    });
    await test('Coordinate helpers reject malformed vectors and ambiguous or nonphysical spherical inputs',()=>{
        for(const value of [null,[1,2],[1,2,3,4],['1',2,3],[Infinity,2,3],[NaN,0,0]]) {
            assert.throws(()=>equatorialToApp(value));assert.throws(()=>appToEquatorial(value));
        }
        for(const fields of [{raHours:24},{raHours:-1},{decDegrees:91},{decDegrees:-91},{distancePc:-1},{raHours:'6'},{distancePc:Infinity},{decDegrees:NaN}])assert.throws(()=>sphericalToEquatorial({raHours:0,decDegrees:0,distancePc:1,...fields}));
        assert.throws(()=>sphericalToEquatorial());
    });
    const sourcePath=path.join(root,'hyg_v42.csv'),runtimePath=path.join(root,'stars.json');
    const sourceBytes=fs.readFileSync(sourcePath),runtimeBytes=fs.readFileSync(runtimePath);
    const sourceText=sourceBytes.toString('utf8'),csv=parseCsv(sourceText),sourceIndex=new Map(csv.rows.map(row=>[Number(row.id),row]));
    const sourceLines=new Map(csv.rows.map((row,i)=>[Number(row.id),i+2]));
    const runtimeStars=JSON.parse(runtimeBytes),exportsPath=path.join(root,'data/pipeline');
    const outputA=path.join(temp,'first'),outputB=path.join(temp,'second');
    await test('Two independent offline exports are byte-identical and leave retained inputs untouched',()=>{
        successful(generate(['--output-dir',outputA]));successful(generate(['--output-dir',outputB]));
        const files=fs.readdirSync(outputA).filter(name=>name.endsWith('.json')).sort();
        assert.deepEqual(files,['manifest.json','quality-summary.json','records.json','runtime-metadata.json']);
        for(const name of files)assert.ok(fs.readFileSync(path.join(outputA,name)).equals(fs.readFileSync(path.join(outputB,name))),`${name} changes across output folders/runs`);
        assert.ok(sourceBytes.equals(fs.readFileSync(sourcePath)));assert.ok(runtimeBytes.equals(fs.readFileSync(runtimePath)));
        metrics.deterministicFiles=files;
    });
    // Assertions use the exported contract rather than imported exporter internals.
    const full=read(path.join(outputA,'records.json'));
    const manifest=read(path.join(outputA,'manifest.json'));
    const quality=read(path.join(outputA,'quality-summary.json'));
    const slim=read(path.join(outputA,'runtime-metadata.json'));
    await test('Manifest binds exact source, runtime, generator and output bytes with explicit conventions',()=>{
        assert.equal(manifest.schemaVersion,1);
        assert.equal(manifest.source.sha256,hash(sourceBytes));assert.equal(manifest.source.bytes,sourceBytes.length);
        assert.equal(manifest.runtimeCatalog.sha256,hash(runtimeBytes));assert.equal(manifest.runtimeCatalog.records,runtimeStars.length);
        assert.equal(manifest.generator.sha256,hash(fs.readFileSync(path.join(root,'scripts/build_scientific_catalog.py'))));
        assert.equal(manifest.source.version,'4.2');assert.equal(manifest.source.versionVerification.status,'verified-byte-match');
        assert.equal(manifest.source.license.spdx,'CC-BY-SA-4.0');assert.match(manifest.source.license.attribution,/Nash|Astronexus/);
        assert.equal(manifest.coordinates.frame,'equatorial');assert.equal(manifest.coordinates.origin,'Sun');
        assert.equal(manifest.coordinates.epoch,'J2000.0');assert.equal(manifest.coordinates.equinox,'J2000.0');
        assert.deepEqual(manifest.coordinates.appAxisMap,['X','Z','-Y']);
        assert.deepEqual(manifest.coordinates.appRotationMatrix,[[1,0,0],[0,0,1],[0,-1,0]]);
        assert.equal(manifest.coordinates.units.position,'pc');assert.equal(manifest.coordinates.units.ra,'hours');assert.equal(manifest.coordinates.units.dec,'degrees');
        assert.equal(manifest.coordinates.properMotionApplied,false);assert.equal(manifest.coordinates.currentPositions,false);
        assert.match(manifest.qualityPolicy.coordinateMismatch,/not|Neither/);
        for(const [name,record] of Object.entries(manifest.outputs)) {
            const bytes=fs.readFileSync(path.join(outputA,name));
            assert.equal(record.sha256,hash(bytes),name);assert.equal(record.bytes,bytes.length,name);
        }
    });
    await test('Every retained runtime ID resolves once to an independently parsed source row',()=>{
        assert.equal(full.schemaVersion,1);assert.equal(full.records.length,117735);
        assert.equal(new Set(full.records.map(record=>record.id)).size,full.records.length);
        assert.deepEqual(full.records.map(record=>record.id),runtimeStars.map(star=>star.id));
        full.records.forEach((record,index)=>{
            const star=runtimeStars[index];
            assert.equal(record.name,star.name);
            if(record.id==='sol')return;
            const source=sourceIndex.get(record.sourceId);assert.ok(source,record.id);
            assert.equal(record.id,`hyg:${source.id}`);
            assert.equal(record.sourceLine,sourceLines.get(record.sourceId));
            vectorClose(record.coordinates.equatorialPc,['x','y','z'].map(key=>Number(source[key])),0);
            vectorClose(record.coordinates.appPc,[star.x,star.y,star.z],1e-9);
            vectorClose(equatorialToApp(record.coordinates.equatorialPc),record.coordinates.appPc,0);
            close(record.coordinates.catalogDistancePc,Number(source.dist),0);
        });
    });
    await test('All cross-identifications and available observables are preserved without invented catalog matches',()=>{
        for(const record of full.records.filter(record=>record.sourceId!==null)) {
            const source=sourceIndex.get(record.sourceId),ids=record.identifiers;
            for(const key of ['hip','hd','hr'])assert.equal(ids[key],numberOrNull(source[key]),`${record.id} ${key}`);
            for(const key of ['gl','bf','bayer','flam','base'])assert.equal(ids[key],textOrNull(source[key]),`${record.id} ${key}`);
            assert.equal(ids.constellation,textOrNull(source.con));
            assert.equal(ids.component,numberOrNull(source.comp));assert.equal(ids.componentPrimary,numberOrNull(source.comp_primary));
            const {photometry:photo,motion}=record;
            for(const [field,raw] of [['apparentMagnitude','mag'],['absoluteMagnitude','absmag'],['colorIndex','ci'],['luminositySolar','lum']])assert.equal(photo[field],numberOrNull(source[raw]),`${record.id} ${field}`);
            assert.equal(photo.spectralType,textOrNull(source.spect));
            for(const [field,raw] of [['properMotionRaMasYr','pmra'],['properMotionDecMasYr','pmdec'],['radialVelocityKmS','rv']])assert.equal(motion[field],numberOrNull(source[raw]));
            assert.equal(record.coordinates.raHours,numberOrNull(source.ra));assert.equal(record.coordinates.decDegrees,numberOrNull(source.dec));
            assert.ok(!Object.hasOwn(ids,'gaia'),'No unsupported Gaia cross-match may appear');
        }
    });
    await test('The source distance sentinel is explicit and unavailable uncertainties stay unknown',()=>{
        assert.ok(!csv.header.some(key=>/(?:err|sigma|covar)/i.test(key)));
        let sentinel=0;
        for(const record of full.records) {
            assert.equal(record.uncertainty,null,record.id);
            if(record.id==='sol'){assert.equal(record.quality.distanceStatus,'origin');continue;}
            const expected=Number(sourceIndex.get(record.sourceId).dist)>=100000;
            assert.equal(record.quality.distanceStatus,expected?'missing-or-dubious-parallax':'catalog-distance',record.id);
            if(expected)sentinel++;
        }
        assert.equal(sentinel,9875);metrics.retainedSentinelCount=sentinel;
    });
    await test('The canonical Sun is an explicit synthetic origin rather than a silently edited HYG measurement',()=>{
        const sun=full.records.find(record=>record.id==='sol');
        assert.equal(sun.sourceId,null);assert.equal(sun.relatedSourceId,0);assert.equal(sun.sourceLine,null);
        vectorClose(sun.coordinates.equatorialPc,[0,0,0],0);vectorClose(sun.coordinates.appPc,[0,0,0],0);
        assert.equal(sun.coordinates.catalogDistancePc,0);assert.equal(sun.quality.distanceStatus,'origin');
        assert.equal(runtimeStars[0].dist,0.0000048481,'Legacy display distance remains intact and must not be treated as the coordinate origin distance');
        assert.notEqual(Number(sourceIndex.get(0).x),sun.coordinates.equatorialPc[0],'Raw HYG solar row must remain distinct from the canonical origin');
    });
    await test('The compact shipped metadata agrees with every full scientific record',()=>{
        assert.equal(slim.schemaVersion,1);assert.equal(slim.records.length,full.records.length);
        slim.records.forEach((item,i)=>{
            const record=full.records[i];
            assert.deepEqual(item,{id:record.id,sourceId:record.sourceId,identifiers:record.identifiers,quality:record.quality,uncertainty:null});
        });
    });
    await test('Every excluded row and reason matches the retained legacy selection policy',()=>{
        const expected=[];
        for(const source of csv.rows) {
            const missing=['dist','mag','ci','x','y','z'].filter(key=>source[key]==='');
            if(missing.length || source.proper==='Sol')expected.push({sourceId:Number(source.id),sourceLine:sourceLines.get(Number(source.id)),reasons:[...(missing.length?['missing-required-values']:[]),...(source.proper==='Sol'?['replaced-by-canonical-sun']:[])],missingFields:missing});
        }
        assert.deepEqual(quality.selection.excluded,expected);
        assert.equal(quality.selection.sourceRows,119626);assert.equal(quality.selection.excludedRows,1892);
        assert.equal(quality.selection.retainedSourceRows,117734);assert.equal(quality.selection.canonicalOriginRecords,1);
        assert.deepEqual(quality.selection.missingRequiredFieldCounts,{ci:1891});
        assert.equal(quality.uncertainty.recordsWithUnknownUncertainty,117735);assert.equal(quality.uncertainty.inventedErrorBars,0);
        for(const field of Object.keys(full.records[0].identifiers)) {
            const counts=new Map();
            for(const record of full.records){const value=record.identifiers[field];if(value!==null)counts.set(value,(counts.get(value)||0)+1);}
            const duplicated=[...counts.values()].filter(count=>count>1);
            assert.deepEqual(quality.duplicateCrossIdentifiers[field],{duplicateValues:duplicated.length,recordsWithRepeatedValues:duplicated.reduce((sum,value)=>sum+value,0)});
        }
        assert.ok(quality.duplicateCrossIdentifiers.hd.duplicateValues>0,'External identifiers are not universally unique');
    });
    await test('Independent spherical diagnostics preserve source discrepancies instead of fabricating precision',()=>{
        let mismatches=0,maxResidual=0,maxId=null;
        for(const record of full.records.filter(record=>record.sourceId!==null)) {
            const source=sourceIndex.get(record.sourceId),expected=independentDiagnostics(source);
            close(record.coordinates.sphericalResidualPc,expected.residual,1e-8);
            close(record.coordinates.roundingBoundPc,expected.bound,1e-12*Math.max(1,expected.bound));
            const mismatch=expected.residual>expected.bound;
            assert.equal(record.quality.flags.includes('spherical-cartesian-mismatch'),mismatch,record.id);
            if(mismatch)mismatches++;
            if(expected.residual>maxResidual){maxResidual=expected.residual;maxId=record.id;}
        }
        assert.ok(mismatches>0,'Observed source inconsistencies should remain visible');
        assert.equal(quality.retainedQualityFlags['spherical-cartesian-mismatch'],mismatches);
        assert.equal(quality.coordinateDiagnostics.retainedMaximum.sourceId,Number(maxId.slice(4)));
        close(quality.coordinateDiagnostics.retainedMaximum.residualPc,maxResidual,1e-8);
        const all=csv.rows.map(source=>({id:Number(source.id),...independentDiagnostics(source)}));
        assert.equal(quality.sourceQuality.sphericalCartesianMismatchRows,all.filter(item=>item.residual>item.bound).length);
        assert.equal(quality.sourceQuality.sentinelDistanceRows,csv.rows.filter(source=>Number(source.dist)>=100000).length);
        metrics.coordinateDiagnostics={mismatches,maxResidualPc:maxResidual,maxId};
    });
    await test('Check mode proves committed outputs match a fresh offline regeneration',()=>{
        successful(generate(['--check']));
        for(const name of metrics.deterministicFiles)assert.ok(fs.readFileSync(path.join(outputA,name)).equals(fs.readFileSync(path.join(exportsPath,name))),`Committed ${name} differs from independent fresh export`);
    });
    const metadata=await import(pathToFileURL(path.join(root,'utils/CatalogMetadata.js')).href);
    await test('Production runtime metadata joins by stable ID and applies the source distance policy',()=>{
        const chosen=[0,runtimeStars.findIndex(star=>star.id==='hyg:32263'),runtimeStars.findIndex(star=>star.dist>=100000)];
        const stars=chosen.map(i=>({...runtimeStars[i]}));
        const payload={schemaVersion:1,records:chosen.map(i=>slim.records[i]).reverse()};
        const localManifest={...manifest,runtimeCatalog:{...manifest.runtimeCatalog,records:stars.length}};
        const result=metadata.attachCatalogMetadata(stars,payload,localManifest);
        assert.equal(result.records,3);assert.equal(result.unresolvedDistances,1);
        for(const star of stars)assert.equal(star.catalogMetadata.id,star.id);
        assert.equal(metadata.hasUnresolvedDistance(stars[1]),false);assert.equal(metadata.hasUnresolvedDistance(stars[2]),true);
        assert.match(metadata.catalogQualityLabel(stars[2]),/placeholder|unresolved/i);
        assert.match(metadata.catalogQualityLabel(stars[1]),/uncertainty.*not supplied/i);
    });
    await test('Production metadata attachment fails atomically for duplicate, mismatched and missing identities',()=>{
        const chosen=[1,2,3],initial=chosen.map(i=>({...runtimeStars[i]}));
        const localManifest={...manifest,runtimeCatalog:{...manifest.runtimeCatalog,records:initial.length}};
        const base=chosen.map(i=>slim.records[i]);
        for(const badRecords of [[base[0],base[0],base[2]],base.slice(0,2),base.map((item,i)=>i===2?{...item,sourceId:999999}:item),base.map((item,i)=>i===2?{...item,quality:{...item.quality,distanceStatus:'origin'}}:item)]) {
            const stars=initial.map(star=>({...star}));
            assert.throws(()=>metadata.attachCatalogMetadata(stars,{schemaVersion:1,records:badRecords},localManifest));
            assert.ok(stars.every(star=>!Object.hasOwn(star,'catalogMetadata')),'Rejected sidecar must not partially attach');
        }
        for(const changed of [{coordinates:{...manifest.coordinates,units:{...manifest.coordinates.units,position:'AU'}}},{coordinates:{...manifest.coordinates,epoch:'current'}},{schemaVersion:999}])assert.throws(()=>metadata.attachCatalogMetadata(initial,{schemaVersion:1,records:base},{...localManifest,...changed}));
    });
    await test('Production byte verification detects tampering rather than trusting a manifest label',async()=>{
        const bytes=Buffer.from('retained scientific metadata');
        await metadata.verifyCatalogBytes(bytes,hash(bytes),'fixture');
        await assert.rejects(metadata.verifyCatalogBytes(Buffer.from('altered scientific metadata'),hash(bytes),'fixture'),/does not match/);
        await assert.rejects(metadata.verifyCatalogBytes(bytes,'not-a-sha256','fixture'),/does not match/);
    });
    await test('A missing spectral classification stays unknown in the production filter',async()=>{
        const {filterStars}=await import(pathToFileURL(path.join(root,'utils/StarFilters.js')).href);
        const unknown={id:'unknown',spect:null,dist:1,relativeRadiusScale:1};
        const known={id:'known-g',spect:'G2V',dist:1,relativeRadiusScale:1};
        assert.deepEqual(filterStars([unknown,known]),[unknown,known]);
        assert.deepEqual(filterStars([unknown,known],{spectralClasses:['G']}),[known]);
        assert.deepEqual(filterStars([unknown],{spectralClasses:['M']}),[]);
    });
    const mutationFolder=path.join(temp,'mutations');fs.mkdirSync(mutationFolder);
    const fixture=(name,contents)=>{const file=path.join(mutationFolder,name);fs.writeFileSync(file,contents);return file;};
    const rejectedOutput=path.join(temp,'rejected');fs.mkdirSync(rejectedOutput);
    const sentinelFile=path.join(rejectedOutput,'manifest.json');fs.writeFileSync(sentinelFile,'leave existing outputs intact');
    const sourceLinesText=sourceText.trimEnd().split(/\r?\n/);
    await test('A duplicate raw source identity is rejected before any output is replaced',()=>{
        const file=fixture('duplicate-source.csv',sourceText+'\n'+sourceLinesText[2]+'\n');
        rejected(generate(['--source',file,'--output-dir',rejectedOutput]),/duplicate source ID/);
        assert.equal(fs.readFileSync(sentinelFile,'utf8'),'leave existing outputs intact');
        assert.deepEqual(fs.readdirSync(rejectedOutput),['manifest.json']);
    });
    await test('Nonfinite source coordinates and unsupported source columns fail closed',()=>{
        const changed={...csv.rows[1],x:'Infinity'};
        const row=csv.header.map(key=>'"'+changed[key].replace(/"/g,'""')+'"').join(',');
        const nonfinite=fixture('nonfinite-source.csv',[sourceLinesText[0],sourceLinesText[1],row,...sourceLinesText.slice(3)].join('\n'));
        rejected(generate(['--source',nonfinite,'--output-dir',rejectedOutput]),/Nonfinite x/);
        const schema=fixture('unknown-columns.csv',sourceText.replace('"pmra"','"pmra_error"'));
        rejected(generate(['--source',schema,'--output-dir',rejectedOutput]),/Unsupported HYG schema/);
    });
    await test('Valid but unverified source bytes cannot claim the pinned scientific release',()=>{
        const file=fixture('unverified-source.csv',sourceText+'\n');
        rejected(generate(['--source',file,'--output-dir',rejectedOutput]),/Unsupported source bytes/);
    });
    await test('Duplicate runtime IDs and altered runtime positions cannot be silently reconciled',()=>{
        const duplicate=runtimeStars.slice();duplicate[2]={...duplicate[2],id:duplicate[1].id};
        rejected(generate(['--catalog',fixture('duplicate-runtime.json',JSON.stringify(duplicate)),'--output-dir',rejectedOutput]),/duplicate runtime ID/);
        const changed=runtimeStars.slice();changed[1]={...changed[1],x:changed[1].x+0.1};
        rejected(generate(['--catalog',fixture('changed-runtime.json',JSON.stringify(changed)),'--output-dir',rejectedOutput]),/numeric mismatch/);
        assert.equal(fs.readFileSync(sentinelFile,'utf8'),'leave existing outputs intact');
    });
    await test('Check mode rejects modified exports without rewriting or repairing them',()=>{
        const file=path.join(outputB,'runtime-metadata.json');
        fs.appendFileSync(file,' ');const before=hash(fs.readFileSync(file));
        rejected(generate(['--check','--output-dir',outputB]),/Non-reproducible or missing export/);
        assert.equal(hash(fs.readFileSync(file)),before,'Check mode must not rewrite a mismatching export');
    });
    metrics.sourceRows=csv.rows.length;
    metrics.runtimeRecords=runtimeStars.length;
    metrics.sourceSha256=hash(sourceBytes);
    metrics.runtimeSha256=hash(runtimeBytes);
}

main().catch(error=>cases.push({name:'Test setup',status:'failed',error:error.stack||String(error)})).finally(()=>{
    const failed=cases.filter(item=>item.status==='failed').length;
    const result={status:!failed&&cases.length?'passed':'failed',scope:'Actual deterministic scientific exporter, independent raw CSV comparison and production coordinate transforms',total:cases.length,passed:cases.length-failed,failed,elapsedMs:Date.now()-started,cases,metrics};
    fs.mkdirSync(runtime,{recursive:true});
    const output=path.join(runtime,'scientific-pipeline-results.json');
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    // Only test-owned descendants of the fixed runtime directory are removable.
    if(temp && path.resolve(temp).startsWith(path.resolve(runtime)+path.sep) && path.basename(temp).startsWith('scientific-pipeline-'))fs.rmSync(temp,{recursive:true,force:true});
    console.log(JSON.stringify({evidence:output,...result}));
    if(failed||!cases.length)process.exitCode=1;
});
