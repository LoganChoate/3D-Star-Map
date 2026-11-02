// Test shipped files and the real animation library, not a copied implementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
// Source citations are user-activated navigation, not startup resources. Keep
// checking every src and every non-anchor href (including styles and preloads).
const refs = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)].flatMap(tag =>
  [...tag[0].matchAll(/(src|href)="([^"]+)"/g)]
    .filter(attribute => !(tag[1].toLowerCase()==='a' && attribute[1]==='href'))
    .map(attribute => attribute[2]));
refs.push(...[...css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)].map(m => m[1]));
for (const ref of refs) {
  assert.ok(!/^(?:https?:)?\/\//i.test(ref), `Network dependency: ${ref}`);
  assert.ok(fs.existsSync(path.resolve(root, ref)), `Missing runtime asset: ${ref}`);
}
const assets = JSON.parse(fs.readFileSync(path.join(root, 'vendor/offline-assets.json'), 'utf8'));
for (const asset of assets.files) {
  const bytes = fs.readFileSync(path.join(root, asset.path));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256.toLowerCase(), `Asset changed: ${asset.path}`);
  if (asset.path.endsWith('.ttf')) assert.equal(bytes.readUInt32BE(0), 0x00010000, 'Expected a real TrueType font');
}
const { gsap } = require('../vendor/gsap/gsap-3.12.5.min.js');
assert.equal(gsap.version, '3.12.5');
const point = { x: 0 };
const tween = gsap.to(point, { x: 10, duration: 1, ease: 'none', paused: true });
tween.progress(0.5);
assert.equal(point.x, 5);
tween.progress(1);
assert.equal(point.x, 10);
tween.kill();
gsap.ticker.sleep();
console.log(JSON.stringify({status:'passed', localAssetReferences:refs.length, hashedFiles:assets.files.length, gsapVersion:gsap.version, interpolation:'passed'}));
