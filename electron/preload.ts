// const { contextBridge, ipcRenderer } = require('electron');
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('Running PRELOAD.JS from Electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  // on: (channel: string, callback: (...args: unknown[]) => void) => ipcRenderer.on(channel, callback),
  on: (channel: string, callback: (data: any) => void) => ipcRenderer.on(channel, (_event: IpcRendererEvent, data: any) => callback(data)),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

});
