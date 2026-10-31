const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const verificationArg = process.argv.find(arg => arg.startsWith('--verify-offline='));
const verificationDirectory = verificationArg ? path.resolve(verificationArg.slice('--verify-offline='.length)) : null;
const offline = process.argv.includes('--offline') || !!verificationDirectory;
if (verificationDirectory) {
  fs.mkdirSync(path.join(verificationDirectory, 'profile'), { recursive: true });
  app.setPath('userData', path.join(verificationDirectory, 'profile'));
}

function checkForUpdates() {
  // Updating is optional; a missing network or update service must never prevent exploration.
  if (!app.isPackaged || offline) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.on('error', error => console.warn('Update check unavailable:', error.message));
    Promise.resolve(autoUpdater.checkForUpdates()).catch(error => {
      console.warn('Continuing without updates:', error.message);
    });
  } catch (error) {
    console.warn('Optional updater unavailable:', error.message);
  }
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    // icon: path.join(__dirname, 'build/galaxy_map_icon.ico'), // Optional: set window icon when asset is available
    webPreferences: {
      // It's best practice to enable contextIsolation and use a preload script.
      // Since this app doesn't need Node.js in the renderer, we can just enable it.
      contextIsolation: true,
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Optional: Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  if (offline) {
    session.defaultSession.enableNetworkEmulation({ offline: true });
    if (verificationDirectory) {
      require('./tests/offline-runtime.cjs').attach(app, session.defaultSession, verificationDirectory);
    } else {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
        (_details, callback) => callback({ cancel: true })
      );
    }
  }
  createWindow();
  checkForUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
