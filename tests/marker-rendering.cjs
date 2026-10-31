const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../.runtime');
fs.mkdirSync(output, {recursive:true});
app.setPath('userData', path.join(output, 'marker-test-profile'));
const timeout = setTimeout(() => { console.error('Marker regression timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
    const win = new BrowserWindow({show:false, webPreferences:{contextIsolation:true}});
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) console.error(message); });
    await win.loadFile(path.join(__dirname, 'marker-rendering.html'));
    const result = await win.webContents.executeJavaScript(`new Promise(resolve => {
        const poll = setInterval(() => { if (window.testResult) { clearInterval(poll); resolve(window.testResult); } }, 50);
    })`);
    const file = path.join(output, 'marker-rendering-results.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({file, ...result}));
    clearTimeout(timeout);
    app.exit(result.status === 'passed' ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
