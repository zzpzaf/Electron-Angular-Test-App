// const { contextBridge, ipcRenderer } = require('electron');
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';


console.log('>====>> Running PRELOAD.JS from Electron');
console.log('>====>> [preload] __dirname=', __dirname, ' __filename=', __filename);

// ⛔ Prevent default browser file load behavior
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
});


// ===================== START: install scoped Select All ===================== //
import { installScopedSelectAll } from './context-select-all-support';
const disposeScopedSelectAll = installScopedSelectAll(); // optional: keep ref for cleanup
// ========================================================================= //

// (Optional) Clean up on unload (usually not necessary, but harmless)
window.addEventListener('beforeunload', () => {
  try { disposeScopedSelectAll?.(); } catch {}
});
// ===================== END: install scoped Select All ===================== //



contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),
  // on: (channel: string, callback: (...args: unknown[]) => void) => ipcRenderer.on(channel, callback),
  on: (channel: string, callback: (data: any) => void) =>
    ipcRenderer.on(channel, (_event: IpcRendererEvent, data: any) =>
      callback(data)
    ),
  // Generic invoker for all channels, returns Promise<unknown> e.g.: window.electronAPI.invoke('collect-posts', urls);
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
});

