const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    icon: path.join(__dirname, 'build/galaxy_map_icon.ico'), // Add this line to set the window icon
    webPreferences: {
      // It's good practice to preload scripts, but for this simple case,
      // we can keep it straightforward.
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Optional: Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});