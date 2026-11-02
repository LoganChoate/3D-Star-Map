// Imports the production distance code and independently parses the retained
// JPL response. No application or ephemeris implementation is copied here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const cases = [];
const point = (space, position) => ({ space, position });
const close = (actual, expected, tolerance = 1e-12) => {
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
};
const test = async (name, fn) => {
    try { await fn(); cases.push({ name, status: 'passed' }); }
    catch (error) { cases.push({ name, status: 'failed', error: error.stack || String(error) }); }
};

async function main() {
    const math = await import(pathToFileURL(path.join(root, 'utils/ExplorationMath.js')).href);
    const { AU_KM, AU_PER_PC, PC_KM, LY_KM, LY_PER_PC, measureDistance, formatDistance } = math;
    await test('Production unit constants match independent astronomical definitions', () => {
        assert.equal(AU_KM, 149597870.7);
        close(AU_PER_PC, 206264.80624709636, 1e-14);
        close(PC_KM, 30856775814913.673, 1e-14);
        close(LY_KM, 9460730472580.8, 1e-14);
        close(LY_PER_PC, 3.2615637771674333, 1e-14);
    });
    await test('One AU has exact kilometre conversion and correct parsec/light-year units', () => {
        const d = measureDistance(point('solar', [0, 0, 0]), point('solar', [1, 0, 0]));
        assert.equal(d.nativeDistance, 1);
        assert.equal(d.au, 1);
        assert.equal(d.unit, 'AU');
        assert.equal(d.km, 149597870.7);
        close(d.pc, 0.00000484813681109536, 1e-16);
        close(d.ly, 0.00001581250740982066, 1e-16);
        assert.ok(Object.isFrozen(d));
    });
    await test('A 3-4-12 parsec displacement measures 13 parsecs in the nearby frame', () => {
        const d = measureDistance(point('nearby', [8, -3, 2]), point('nearby', [11, 1, 14]));
        assert.equal(d.pc, 13);
        assert.equal(d.nativeDistance, 13);
        assert.equal(d.unit, 'pc');
        close(d.ly, 42.40032910317663, 1e-14);
        close(d.au, 2681442.4812122527, 1e-14);
    });
    await test('Distance is symmetric and coincident objects remain zero apart', () => {
        const a = point('solar', [-4, 6, -2]), b = point('solar', [7, -1, 9]);
        assert.deepEqual(measureDistance(a, b), measureDistance(b, a));
        for (const key of ['nativeDistance', 'km', 'au', 'pc', 'ly']) assert.equal(measureDistance(a, { ...a })[key], 0);
    });
    await test('Different coordinate spaces cannot be combined by overriding context', () => {
        const a = point('solar', [0, 0, 0]), b = point('nearby', [0, 0, 0]);
        assert.throws(() => measureDistance(a, b), /same coordinate space/);
        assert.throws(() => measureDistance(a, b, 'nearby'), /same coordinate space/);
        assert.throws(() => measureDistance(a, a, 'galaxy'), /Unknown/);
        assert.throws(() => measureDistance(a, a, 'constructor'), /Unknown/);
        assert.throws(() => measureDistance({position:[0,0,0]}, {position:[0,0,0]}), /Unknown/);
    });
    await test('Malformed, nonnumeric and overflowing coordinates fail explicitly', () => {
        const valid = point('solar', [0, 0, 0]);
        for (const coords of [null, [0,0], [0,0,0,0], [NaN,0,0], [Infinity,0,0], ['1',0,0]]) {
            assert.throws(() => measureDistance(valid, point('solar', coords)), /three finite/);
        }
        assert.throws(() => measureDistance(point('solar', [-Number.MAX_VALUE,0,0]), point('solar',[Number.MAX_VALUE,0,0])), /numeric range/);
    });
    await test('Distance labels use the correct scale and do not round tiny distances to zero', () => {
        assert.deepEqual(formatDistance(measureDistance(point('solar',[0,0,0]),point('solar',[1,0,0]))), {primary:'1 AU',secondary:'149,597,871 km'});
        assert.deepEqual(formatDistance(measureDistance(point('nearby',[0,0,0]),point('nearby',[1,0,0]))), {primary:'1 pc',secondary:'3.2616 light-years'});
        const small = formatDistance(measureDistance(point('solar',[0,0,0]),point('solar',[1e-9,0,0])));
        assert.match(small.primary, /e-9 AU$/);
        assert.notEqual(small.secondary, '0 km');
        assert.throws(() => formatDistance({space:'unknown'}), /unknown/);
    });

    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/exploration-catalog.json'), 'utf8'));
    const stars = JSON.parse(fs.readFileSync(path.join(root, 'stars.json'), 'utf8'));
    const starIndex = new Map(stars.map(star => [star.id, star]));
    const solar = catalog.solar.objects;
    await test('Catalog contains exactly the Sun, eight planets and Moon with distinct identities', () => {
        assert.equal(solar.length, 10);
        assert.deepEqual(solar.map(body=>body.name).sort(), ['Sun','Mercury','Venus','Earth','Moon','Mars','Jupiter','Saturn','Uranus','Neptune'].sort());
        assert.equal(new Set(solar.map(body=>body.id)).size, 10);
        assert.equal(solar.find(body=>body.name==='Sun').id, 'sol');
        for (const body of solar) {
            assert.ok(body.id && body.description);
            assert.ok(Number.isFinite(body.radiusKm) && body.radiusKm > 0, `${body.name} requires a physical radius`);
            assert.ok(body.sources?.length && body.sources.every(source=>new URL(source.url).protocol==='https:'), `${body.name} requires source links`);
            assert.ok(body.position.length === 3 && body.position.every(Number.isFinite));
        }
    });
    await test('Solar snapshot records its actual epoch, coordinate frame and units', () => {
        assert.equal(catalog.solar.epochJD, 2451545);
        assert.equal(catalog.solar.timeScale, 'TDB');
        assert.equal(catalog.solar.units, 'AU');
        assert.match(catalog.solar.frame, /ecliptic/i);
        assert.match(catalog.solar.frame, /J2000/i);
        assert.match(catalog.solar.epochLabel, /2000/);
    });
    await test('Every planet and Moon position matches the independent raw JPL vector row', () => {
        for (const body of solar.filter(body=>body.name!=='Sun')) {
            const raw = fs.readFileSync(path.join(root, 'data/horizons', body.name.toLowerCase()+'.txt'), 'utf8');
            const section = raw.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/);
            assert.ok(section, `${body.name} response must contain a vector section`);
            const rows = section[1].trim().split(/\r?\n/).filter(line=>line.trim());
            assert.equal(rows.length, 1, `${body.name} should have one snapshot row`);
            const row = rows[0].split(',').map(field=>field.trim());
            assert.equal(Number(row[0]), 2451545);
            assert.deepEqual(body.position, row.slice(2,5).map(Number), `${body.name} coordinates differ from JPL`);
            assert.match(raw, /Center body name:\s*Sun/i);
        }
        assert.deepEqual(solar.find(body=>body.name==='Sun').position, [0,0,0]);
    });
    await test('Actual Sun/Earth and Earth/Moon measurements retain plausible AU/km scale', () => {
        const get = name => ({...solar.find(body=>body.name===name),space:'solar'});
        const sunEarth = measureDistance(get('Sun'),get('Earth'));
        const earthMoon = measureDistance(get('Earth'),get('Moon'));
        assert.ok(sunEarth.au > 0.98 && sunEarth.au < 1.02);
        assert.ok(sunEarth.km > 146e6 && sunEarth.km < 153e6);
        assert.ok(earthMoon.km > 350000 && earthMoon.km < 410000);
        assert.ok(earthMoon.au > 0.002 && earthMoon.au < 0.003);
        // A marker radius or screen coordinate cannot substitute for physical distance.
        assert.ok(earthMoon.km > get('Earth').radiusKm * 50);
    });
    await test('Curated nearby objects resolve to unique existing HYG identities', () => {
        const nearby = catalog.nearby.objects;
        assert.ok(nearby.length >= 8 && nearby.length <= 12);
        assert.equal(new Set(nearby.map(body=>body.id)).size, nearby.length);
        for (const entry of nearby) {
            const source = starIndex.get(entry.id);
            assert.ok(source, `Unknown nearby ID ${entry.id}`);
            assert.ok(source.dist > 0 && source.dist <= 6, `${entry.id} is outside the bounded nearby set`);
            assert.ok(entry.description);
            assert.ok(entry.sources?.length);
            if (entry.position) assert.deepEqual(entry.position, [source.x,source.y,source.z]);
        }
    });
    await test('Sun-origin to Proxima uses actual retained coordinates, not its different catalog distance field', () => {
        const proxima = starIndex.get('hyg:70666');
        assert.ok(proxima && proxima.name === 'Proxima Centauri');
        const d = measureDistance(point('nearby',[0,0,0]), {...proxima,space:'nearby',position:[proxima.x,proxima.y,proxima.z]});
        // Independent high-precision Decimal square root of the retained XYZ.
        close(d.pc, 1.2957566504008381897, 1e-14);
        close(d.ly, 4.22619295497118, 1e-14);
        assert.equal(proxima.dist, 1.2959);
        assert.notEqual(d.pc, proxima.dist, 'Do not silently rescale positions to another catalog field');
    });
    await test('Nearby star separation uses preserved source coordinates, independently of display name', () => {
        const a = starIndex.get('hyg:103879'), b = starIndex.get('hyg:103883');
        assert.ok(a && b && a.name === b.name && a.id !== b.id);
        const d = measureDistance({...a,space:'nearby',position:[a.x,a.y,a.z]}, {...b,space:'nearby',position:[b.x,b.y,b.z]});
        close(d.pc, 0.01151637086933203, 1e-14);
        assert.ok(d.ly > 0 && d.ly < 0.04);
    });
}

main().catch(error=>cases.push({name:'Test setup',status:'failed',error:error.stack||String(error)})).finally(()=>{
    const failed = cases.filter(item=>item.status==='failed').length;
    const result = {status:!failed&&cases.length?'passed':'failed',scope:'Actual production distance module, retained JPL vectors and stable nearby catalog identities',total:cases.length,passed:cases.length-failed,failed,cases,mathSourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'utils/ExplorationMath.js'))).digest('hex')};
    const output = path.join(root,'.runtime/exploration-math-results.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(result,null,2));
    console.log(JSON.stringify({evidence:output,...result}));
    if(failed||!cases.length)process.exitCode=1;
});
