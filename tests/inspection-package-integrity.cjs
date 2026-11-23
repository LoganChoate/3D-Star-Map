// Compare the actual packaged payload with this checkout, including Earth textures.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const arg = key => process.argv.find(v => v.startsWith(`--${key}=`))?.slice(key.length + 3);
assert(arg('archive') && arg('output'), 'Specify --archive=<app.asar> and --output=<new evidence file>');
const archive = path.resolve(arg('archive')), output = path.resolve(arg('output'));
assert(!fs.existsSync(output), 'Use a new evidence file to preserve prior verification');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const checks = [];
for (const raw of asar.listPackage(archive)) {
    const file = raw.replace(/^[\\/]+/, '').replaceAll('\\', '/');
    const native = file.split('/').join(path.sep);
    if (file.startsWith('node_modules/') || file === 'package.json' || asar.statFile(archive, native).files) continue;
    const local = path.join(root, file), bytes = asar.extractFile(archive, native);
    checks.push({path:file, sha256:sha(bytes), matches:fs.existsSync(local) && sha(fs.readFileSync(local)) === sha(bytes)});
}
for (const file of ['modules/UnifiedInspector.js','modules/EarthAssetTrial.js','modules/NarrationController.js','utils/InspectionDossier.js','earth-trial.css','inspection.css','assets/earth/appearance.json','assets/earth/runtime-manifest.json','assets/moon/moon.glb','assets/sol/appearance.json']) {
    assert(checks.some(c => c.path === file), 'Missing runtime file: ' + file);
}
assert(checks.some(c => /^assets\/earth\/.*\.(png|jpg|jpeg)$/.test(c.path)), 'Earth runtime textures must be bundled');
assert(checks.every(c => c.matches), 'Packaged source differs from the checkout');
const packaged = JSON.parse(asar.extractFile(archive, 'package.json'));
const source = JSON.parse(fs.readFileSync(path.join(root,'package.json')));
assert.equal(packaged.version, source.version);
assert.equal(packaged.dependencies['electron-updater'], source.dependencies['electron-updater']);
assert.equal(JSON.parse(asar.extractFile(archive,path.join('node_modules','electron-updater','package.json'))).name,'electron-updater');
const result = {status:'passed', version:packaged.version, archive, archiveSha256:sha(fs.readFileSync(archive)), files:checks.length,
    scope:'All bundled project files match source; package metadata and dependencies excluded from byte comparison, version/updater checked separately. Packaged preview, not installed acceptance.', checks};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,version:result.version,files:result.files,archiveSha256:result.archiveSha256,output}));
