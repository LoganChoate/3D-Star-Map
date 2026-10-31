// Exercises the real Electron entry point and a real second Electron process.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../.runtime');
const profileArgument = process.argv.find(arg => arg.startsWith('--launcher-profile='));
const profile = profileArgument ? profileArgument.slice('--launcher-profile='.length) : path.join(output, `launcher-profile-${Date.now()}`);
app.setPath('userData', profile);

if (!process.argv.includes('--secondary')) {
  fs.mkdirSync(output, { recursive:true });
  const evidence = { status:'running', scope:'Real main.js and second process; existing window restores without duplicate', windowsCreated:0 };
  let finished = false;
  let child;
  const finish = error => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (child && child.exitCode === null) child.kill();
    evidence.status = error ? 'failed' : 'passed';
    if (error) evidence.error = error.stack || String(error);
    fs.writeFileSync(path.join(output,'launcher-runtime-results.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
    app.exit(error ? 1 : 0);
  };
  const timeout = setTimeout(() => finish(new Error('Launcher verification timed out')), 40000);
  app.on('browser-window-created', (_event, win) => {
    evidence.windowsCreated++;
    win.webContents.on('console-message', async (_event,_level,message) => {
      if (message !== '3D Star Map Explorer initialized successfully' || child) return;
      try {
        evidence.catalogCount = await win.webContents.executeJavaScript('window.starRenderer.fullStarData.length');
        assert.equal(evidence.catalogCount,117735);
        const firstId = win.id;
        win.minimize();
        await new Promise(resolve => setTimeout(resolve,300));
        assert.equal(win.isMinimized(),true,'Window must first be minimized');
        const notified = new Promise(resolve => app.once('second-instance',resolve));
        child = spawn(process.execPath,[__filename,`--launcher-profile=${profile}`,'--secondary','galaxymap://launch'],{windowsHide:true,stdio:'ignore'});
        const exit = new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
        await notified;
        evidence.secondaryExitCode = await exit;
        await new Promise(resolve => setTimeout(resolve,300));
        assert.equal(evidence.secondaryExitCode,0);
        assert.equal(BrowserWindow.getAllWindows().length,1);
        assert.equal(BrowserWindow.getAllWindows()[0].id,firstId);
        assert.equal(evidence.windowsCreated,1);
        assert.equal(win.isMinimized(),false);
        assert.equal(win.isVisible(),true);
        evidence.restored = true;
        evidence.sameWindow = true;
        finish();
      } catch (error) { finish(error); }
    });
  });
  process.on('uncaughtException',finish);
  process.on('unhandledRejection',finish);
}
require('../main.js');
