const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
async function main() {
    const {createInspectionDossier:build} = await import(pathToFileURL(path.join(root,'utils/InspectionDossier.js')));
    const catalog = JSON.parse(fs.readFileSync(path.join(root,'data/exploration-catalog.json')));
    const stars = JSON.parse(fs.readFileSync(path.join(root,'stars.json')));
    const cases=[];
    const test=(name,fn)=>{try{fn();cases.push({name,status:'passed'});}catch(error){cases.push({name,status:'failed',error:error.stack});}};
    const allFields = d => d.groups.flatMap(g=>g.fields);
    test('Canonical Sun dossier agrees across atlas/nearby/solar entry points',()=>{
        const sun=stars.find(s=>s.id==='sol');
        const a=build(sun,{catalog,canonicalStar:sun});
        const b=build({...catalog.solar.objects[0],space:'nearby'},{catalog,canonicalStar:sun});
        assert.deepEqual(a,b); assert.equal(a.visualKind,'sun');
        assert.equal(allFields(a).find(f=>f.label.startsWith('Body-center')).value,'0 AU');
    });
    test('Only exact Sun and Moon IDs dispatch visuals; Earth stays paused',()=>{
        for(const body of catalog.solar.objects){
            const d=build(body,{catalog});
            assert.equal(d.visualKind,body.id==='sol'?'sun':body.id==='solar:moon'?'moon':null);
            if(body.id==='solar:earth')assert.match(d.visualNote,/paused/);
        }
        assert.equal(build({id:'unknown',name:'Moon'}).visualKind,null);
    });
    test('Unresolved distance never becomes a real distance in speech or coordinates',()=>{
        const d=build({id:'hyg:test',name:'Unresolved',dist:100000,x:90000,y:1,z:1,spect:'K2'});
        assert.match(d.narrationText,/distance is unresolved/);
        assert.ok(!d.narrationText.includes('100,000'));
        assert.match(allFields(d).find(f=>f.label.startsWith('Coordinates')).value,/placeholder/);
        assert.match(build({id:'hyg:test',name:'Unresolved',distancePc:100000}).narrationText,/distance is unresolved/);
    });
    test('Missing or nonfinite values stay missing; zero is preserved',()=>{
        const d=build({id:'hyg:test',name:'Unknown',dist:NaN,mag:0,ci:null,spect:''});
        assert.equal(allFields(d).find(f=>f.label==='Apparent magnitude').value,'0 mag');
        for(const key of ['Effective temperature','Mass','Color index B−V'])assert.match(allFields(d).find(f=>f.label===key).value,/Not available/);
        assert.ok(!/NaN|Infinity/.test(JSON.stringify(d)));
    });
    test('Legacy unsourced description is never promoted to verified narration',()=>{
        const d=build({id:'hyg:test',name:'Sample',description:'This world has confirmed unicorns.',dist:4,spect:'M3'});
        assert.ok(!d.narrationText.includes('unicorns'));assert.match(d.narrationText,/M3/);
    });
    test('Duplicate names preserve separate identities and values',()=>{
        const pair=stars.filter(s=>s.name==='61 Cyg');assert.equal(pair.length,2);
        const dossiers=pair.map(s=>build(s));assert.notEqual(dossiers[0].id,dossiers[1].id);
        for(let i=0;i<pair.length;i++)assert.equal(allFields(dossiers[i]).find(f=>f.label==='Catalog ID').value,pair[i].id);
    });
    test('Only HTTPS sources accepted, duplicates collapsed',()=>{
        const d=build({id:'x',sources:[{url:'javascript:alert(1)'},{url:'http://bad.test'},{url:'https://good.test',label:'A'},{url:'https://good.test',label:'B'}]});
        assert.equal(d.sources.filter(s=>s.url==='https://good.test').length,1);
        assert.ok(d.sources.every(s=>s.url.startsWith('https:')));
    });
    test('Retained objects and nested catalog positions are not mutated',()=>{
        const source=JSON.stringify(catalog);for(const body of catalog.solar.objects)build(body,{catalog});assert.equal(JSON.stringify(catalog),source);
    });
    test('Narration conversions match independently stated parsec conversion',()=>{
        const d=build({id:'hyg:test',name:'One parsec',dist:1,spect:'G2',x:1,y:0,z:0});
        assert.match(d.narrationText,/3\.2616 light-years/);
        assert.match(allFields(d).find(f=>f.label==='Coordinate frame').value,/\[X, Z, -Y\]/);
    });
    test('Missing stable identity is rejected',()=>{assert.throws(()=>build({name:'Sun'}),/stable object ID/);});
    const report={scope:'Production catalog-to-inspector projection; no rendering or audible speech claim',cases,status:cases.every(c=>c.status==='passed')?'passed':'failed'};
    fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.writeFileSync(path.join(root,'.runtime/inspection-dossier-results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
