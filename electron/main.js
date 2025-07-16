const { app, BrowserWindow } = require('electron');
const path = require('path');

// Function to create the main application window
function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,  // recommended security for safe IPC
    },
  });

  // Load the Angular application
  win.loadFile(path.join(__dirname, '../dist/electronang1/browser/index.html'));


}

// This will be called when the app is ready to create windows
app.whenReady().then(createWindow);

// Quit the app when all windows are closed, except on macOS where it's common to keep the app running
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle the 'activate' event on macOS to recreate a window if none are open
const { ipcMain } = require('electron');
// This listens for messages from the renderer process
ipcMain.on('test-channel', (event, arg) => {
  console.log('Received from Angular:', arg);
});

