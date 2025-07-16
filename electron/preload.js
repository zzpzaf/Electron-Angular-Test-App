const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC methods to the renderer process
// This allows the Angular app to communicate with the main process securely
// using context isolation
// Note: Ensure that contextIsolation is enabled in the BrowserWindow options
// in main.js for this to work properly.
// This is a security measure to prevent direct access to Node.js APIs from the renderer process.
// It allows you to expose only specific APIs that you want the renderer process to access.
// In this case, we expose a simple API for sending and receiving messages.
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, callback),
});
