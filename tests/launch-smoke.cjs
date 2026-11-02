// Runs the real Electron entry point and inspects its actual renderer/catalog.
// This is a launch check only; it does not certify routing or scientific quality.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(__dirname, '../.runtime');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const evidence = { runId, electron: process.versions.electron, node: process.versions.node, messages: [], checks: {}, status: 'running' };
let finished = false;
const finish = (error) => {
  if (finished) return;
  finished = true;
  evidence.status = error ? 'failed' : 'passed';
  if (error) evidence.error = error.stack || String(error);
  const file = path.join(output, `launch-${runId}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: evidence.status, file, checks: evidence.checks, error: evidence.error }));
  app.exit(error ? 1 : 0);
};
const timeout = setTimeout(() => finish(new Error('Real application did not initialize within 60 seconds')), 60000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    evidence.messages.push({ level, message, line, source });
    if (message === '3D Star Map Explorer initialized successfully') {
      setTimeout(async () => {
        try {
          evidence.checks = await win.webContents.executeJavaScript(`(() => {
            const r = window.starRenderer;
            return {
              title: document.title,
              url: location.href,
              fullCatalogCount: r?.fullStarData?.length,
              geometryCount: r?.starsMesh?.geometry?.attributes?.position?.count,
              instanceCount: r?.starsMesh?.count,
              webgl: !!r?.renderer?.getContext(),
              frameCount: r?.renderer?.info?.render?.frame,
              canvasWidth: r?.canvas?.width,
              canvasHeight: r?.canvas?.height,
              loadingHidden: getComputedStyle(document.getElementById('loading-indicator')).display === 'none',
              errorNotification: document.querySelector('.app-notification.error')?.textContent || null,
              searchInput: !!document.getElementById('search-input'),
              starCountText: document.getElementById('star-count-display')?.textContent,
              hasSol: r?.fullStarData?.some(s => s.name === 'Sol')
            };
          })()`);
          assert.equal(evidence.checks.fullCatalogCount, 117735);
          assert.equal(evidence.checks.webgl, true);
          assert.ok(evidence.checks.geometryCount > 0);
          assert.ok(evidence.checks.frameCount > 0);
          assert.equal(evidence.checks.loadingHidden, true);
          assert.equal(evidence.checks.errorNotification, null);
          assert.equal(evidence.checks.searchInput, true);
          assert.equal(evidence.checks.hasSol, true);
          const screenshot = await win.webContents.capturePage();
          const image = path.join(output, `launch-${runId}.png`);
          fs.writeFileSync(image, screenshot.toPNG());
          evidence.screenshot = image;
          clearTimeout(timeout);
          finish();
        } catch (error) { finish(error); }
      }, 1500);
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => finish(new Error(JSON.stringify(details))));
  win.webContents.on('did-fail-load', (_e, code, description, url, main) => {
    if (main) finish(new Error(`Main document failed: ${code} ${description} ${url}`));
  });
});
process.on('uncaughtException', finish);
process.on('unhandledRejection', finish);
require('../main.js');
