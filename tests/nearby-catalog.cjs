// Exercises the production collection builder against independently read source
// CSV and boundary/identity fixtures. Does not copy the production selector.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const cases = [];
const test = async (name, fn) => {
    try { await fn(); cases.push({ name, status: 'passed' }); }
    catch (error) { cases.push({ name, status: 'failed', error: error.stack || String(error) }); }
};
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const fixture = (id, dist, extra = {}) => ({
    id: `hyg:${id}`, name: `Example ${id}`, dist, mag: 8, spect: 'M3', x: dist, y: 0, z: 0,
    catalogMetadata: { id: `hyg:${id}`, sourceId: id, identifiers: {}, quality: { distanceStatus: 'catalog-distance', flags: ['uncertainty-not-provided'] }, uncertainty: null },
    ...extra
});
const sun = { id: 'sol', name: 'Sun', space: 'nearby', position: [0, 0, 0], radiusKm: 695700, description: 'Canonical solar origin', sources: [{label:'Solar source',url:'https://example.invalid/source'}] };
const freezeDeep = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freezeDeep); }
    return value;
};

async function main() {
    const { buildNearbyCollection, nearbyDisplayLabel, NEARBY_COLLECTIONS } = await import(pathToFileURL(path.join(root, 'utils/NearbyCatalog.js')).href);
    const stars = read('stars.json');
    const metadata = new Map(read('data/pipeline/runtime-metadata.json').records.map(row => [row.id, row]));
    stars.forEach(star => star.catalogMetadata = metadata.get(star.id));
    const index = new Map(stars.map(star => [star.id, star]));
    const exploration = read('data/exploration-catalog.json');
    const curated = [{ ...exploration.solar.objects.find(body => body.id === 'sol'), space:'nearby', position:[0,0,0] }, ...exploration.nearby.objects.map(entry => {
        const source = index.get(entry.id);
        return { ...source, ...entry, space:'nearby', kind:'Star', position:[source.x,source.y,source.z], catalogName:source.name };
    })];
    let independent;
    await test('Independent Python CSV reader derives the exact retained 5 pc population', () => {
        const code = `import csv,json,math,sys
rows=[];omitted=[]
with open(sys.argv[1],encoding='utf-8',newline='') as f:
 for r in csv.DictReader(f):
  if r['id']=='0' or not r['dist']: continue
  d=float(r['dist'])
  if not math.isfinite(d) or not 0<d<=5: continue
  if any(r[k]=='' for k in ['dist','mag','ci','x','y','z']): omitted.append(int(r['id']));continue
  rows.append({'id':'hyg:'+r['id'],'dist':d,'position':[float(r['x']),float(r['z']),-float(r['y'])]})
print(json.dumps({'rows':sorted(rows,key=lambda r:(r['dist'],r['id'])),'omitted':omitted}))`;
        const result = spawnSync('python', ['-I', '-S', '-c', code, path.join(root, 'hyg_v42.csv')], { encoding:'utf8', windowsHide:true, timeout:15000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        independent = JSON.parse(result.stdout);
        assert.equal(independent.rows.length, 56);
        assert.equal(independent.omitted.length, 5);
        assert.deepEqual(independent.omitted, [82473,118080,118428,118493,118831]);
        const resultCollection = buildNearbyCollection(stars, curated, '5pc');
        assert.deepEqual(resultCollection.objects.slice(1).map(body => body.id), independent.rows.map(row => row.id));
        assert.equal(resultCollection.objects.length, 57);
        assert.equal(resultCollection.starCount, 56);
        resultCollection.objects.slice(1).forEach((body,i) => assert.deepEqual(body.position, independent.rows[i].position));
    });
    await test('Default highlights preserve all 13 existing identities, descriptions, positions and source metadata', () => {
        const noScan = new Proxy(stars, { get(target, key, receiver) { if (key === Symbol.iterator) throw new Error('Highlights must not scan the full catalog'); return Reflect.get(target,key,receiver); } });
        const result = buildNearbyCollection(noScan, curated);
        assert.equal(result.collection, 'highlights');
        assert.equal(result.objects.length, 13);
        assert.deepEqual(result.objects.map(body=>body.id), curated.map(body=>body.id));
        result.objects.forEach((body,i) => {
            const expected = curated[i];
            assert.deepEqual(body, { ...expected, position:expected.position.slice(), displayLabel:expected.name });
            assert.equal(body.catalogMetadata, expected.catalogMetadata);
            assert.equal(body.sources, expected.sources);
            assert.notEqual(body, expected);
            assert.notEqual(body.position, expected.position);
        });
    });
    await test('Expanded records preserve verified metadata, curated descriptions and raw values', () => {
        const result = buildNearbyCollection(stars, curated, '5pc');
        const curatedIndex = new Map(curated.map(body=>[body.id,body]));
        assert.deepEqual(result.objects[0], { ...curated[0], position:[0,0,0], displayLabel:'Sun' });
        for (const body of result.objects.slice(1)) {
            const source = index.get(body.id);
            assert.equal(body.catalogMetadata, source.catalogMetadata);
            assert.equal(body.distancePc, source.dist);
            assert.equal(body.spectralType, source.spect);
            assert.equal(body.apparentMagnitude, source.mag);
            assert.equal(body.catalogName, source.name);
            assert.equal(body.catalogMetadata.uncertainty, null);
            if (curatedIndex.has(body.id)) {
                assert.equal(body.name, curatedIndex.get(body.id).name);
                assert.equal(body.description, curatedIndex.get(body.id).description);
            }
        }
        assert.equal(result.objects.filter(body=>body.catalogMetadata?.quality.flags.includes('spherical-cartesian-mismatch')).length,46);
    });
    await test('61 Cyg components have distinct captions while names, IDs and source objects remain unchanged', () => {
        const result = buildNearbyCollection(stars, curated, '5pc');
        const pair = result.objects.filter(body=>body.name==='61 Cyg');
        assert.equal(pair.length,2);
        assert.deepEqual(pair.map(body=>nearbyDisplayLabel(body)).sort(), ['61 Cyg · HYG 103879','61 Cyg · HYG 103883']);
        assert.equal(new Set(result.objects.map(nearbyDisplayLabel)).size,result.objects.length);
        pair.forEach(body=>{assert.equal(index.get(body.id).name,'61 Cyg');assert.equal(index.get(body.id).displayLabel,undefined);});
    });
    await test('5 pc uses the inclusive source-distance boundary, independently of Cartesian norm', () => {
        const rows=[fixture(1,5,{x:5.00001}),fixture(2,5+Number.EPSILON*4,{x:1}),fixture(3,4.999999),fixture(4,0),fixture(5,-1),fixture(6,NaN),fixture(7,Infinity),fixture(8,'4')];
        const result=buildNearbyCollection(rows,[sun],'5pc');
        assert.deepEqual(result.objects.map(body=>body.id),['sol','hyg:3','hyg:1']);
        assert.equal(result.objects[2].position[0],5.00001);
        assert.equal(result.objects[2].distancePc,5);
    });
    await test('Unknown and unresolved distance statuses are excluded without inventing positions or uncertainty', () => {
        const ordinary=fixture(1,2),unresolved=fixture(2,3),unknown=fixture(3,4);
        unresolved.catalogMetadata.quality.distanceStatus='missing-or-dubious-parallax';
        unknown.catalogMetadata.quality.distanceStatus='unknown';
        const result=buildNearbyCollection([ordinary,unresolved,unknown],[sun],'5pc');
        assert.deepEqual(result.objects.map(body=>body.id),['sol','hyg:1']);
        assert.equal(result.objects[1].catalogMetadata.uncertainty,null);
    });
    await test('Frozen source and curated inputs are not mutated, including coordinate arrays', () => {
        const source=fixture(1,2),entry={...source,name:'Curated name',description:'Keep me',space:'nearby',position:[2,0,0]};
        const rows=freezeDeep([source]),curation=freezeDeep([{...sun,position:[0,0,0]},entry]);
        const before=JSON.stringify({rows,curation});
        const result=buildNearbyCollection(rows,curation,'5pc');
        assert.equal(JSON.stringify({rows,curation}),before);
        result.objects[1].position[0]=999;
        assert.equal(source.x,2);
        assert.equal(entry.position[0],2);
        assert.equal(result.objects[1].description,'Keep me');
    });
    await test('Equal distances sort deterministically by stable identity, regardless of source order', () => {
        const rows=[fixture(8,3),fixture(12,3),fixture(2,3)];
        const a=buildNearbyCollection(rows,[sun],'5pc'),b=buildNearbyCollection(rows.slice().reverse(),[sun],'5pc');
        assert.deepEqual(a.objects.map(body=>body.id),['sol','hyg:12','hyg:2','hyg:8']);
        assert.deepEqual(a.objects,b.objects);
    });
    await test('Selected and curated duplicate identities fail explicitly rather than merging stars', () => {
        const source=fixture(1,3);
        assert.throws(()=>buildNearbyCollection([source,{...source}],[sun],'5pc'),/Duplicate nearby identity/);
        assert.throws(()=>buildNearbyCollection([source],[sun,{...sun}]),/Duplicate nearby identity/);
    });
    await test('Missing source metadata, mismatched source identity and invented uncertainty are rejected', () => {
        const missing=fixture(1,3);delete missing.catalogMetadata;
        const mismatched=fixture(2,3);mismatched.catalogMetadata.sourceId=999;
        const uncertainty=fixture(3,3);uncertainty.catalogMetadata.uncertainty=0;
        for (const row of [missing,mismatched,uncertainty]) assert.throws(()=>buildNearbyCollection([row],[sun],'5pc'),/metadata/);
    });
    await test('Malformed options, identities, selected coordinates and Sun origins fail with clear errors', () => {
        for (const option of ['10pc','constructor','__proto__','']) assert.throws(()=>buildNearbyCollection([],[sun],option),/Unknown nearby collection/);
        assert.throws(()=>buildNearbyCollection(null,[sun]),/arrays/);
        assert.throws(()=>buildNearbyCollection([],[{...sun,id:''}]),/stable string IDs/);
        assert.throws(()=>buildNearbyCollection([fixture(1,3,{x:Infinity})],[sun],'5pc'),/nonfinite/);
        assert.throws(()=>buildNearbyCollection([],[{...sun,position:[0,1,0]}]),/exact origin/);
        assert.throws(()=>buildNearbyCollection([],[]),/canonical Sun/);
    });
    await test('Caption disambiguation handles normalized duplicates without changing searchable names', () => {
        const rows=[fixture(1,1,{name:'Same star'}),fixture(2,2,{name:' SAME   STAR '})];
        const result=buildNearbyCollection(rows,[sun],'5pc');
        assert.equal(result.objects[1].name,'Same star');
        assert.equal(result.objects[2].name,' SAME   STAR ');
        assert.match(result.objects[1].displayLabel,/HYG 1$/);
        assert.match(result.objects[2].displayLabel,/HYG 2$/);
        assert.equal(nearbyDisplayLabel({id:'hyg:99'}),'hyg:99');
    });
    await test('Collection descriptions explicitly disclose fixed epoch, incomplete selection and unknown uncertainty', () => {
        assert.ok(Object.isFrozen(NEARBY_COLLECTIONS));
        const note=buildNearbyCollection(stars,curated,'5pc').selectionNote;
        for (const phrase of ['catalog distance','5 pc','Five source rows','not a complete census','J2000.0','uncertainties are unknown']) assert.ok(note.includes(phrase),phrase);
    });
    const result={status:cases.every(item=>item.status==='passed')?'passed':'failed',checks:cases,metrics:{selectedStars:56,displayObjects:57,legacyMissingColorExclusions:5,independentSource:'hyg_v42.csv read with isolated Python standard-library csv'}};
    const output=path.join(root,'.runtime','nearby-catalog-results.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(result,null,2));
    for(const item of cases)console.log(`${item.status.toUpperCase()}: ${item.name}`);
    console.log(JSON.stringify({status:result.status,checks:cases.length,evidence:output}));
    if(result.status!=='passed'){cases.filter(item=>item.status!=='passed').forEach(item=>console.error(item.error));process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
