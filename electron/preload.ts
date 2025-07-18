const { contextBridge, ipcRenderer } = require('electron');


console.log('Running PRELOAD.JS from Electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (...args: unknown[]) => void) => ipcRenderer.on(channel, callback),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

});
