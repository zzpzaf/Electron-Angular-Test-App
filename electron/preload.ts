// const { contextBridge, ipcRenderer } = require('electron');
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';


// Log outputs for debugging purposes.
console.log('>====>> PRELOAD.TS is running rom Electron');
// console.log(
//   '>====>> [preload] __dirname=',
//   __dirname,
//   ' __filename=',
//   __filename
// );
// console.log('>====>> [preload] CWD=', process.cwd());







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
  try {
    disposeScopedSelectAll?.();
  } catch {}
});
// ===================== END: install scoped Select All ===================== //

contextBridge.exposeInMainWorld('electronAPI', {
  // One-way message
  send: (channel: string, data: unknown) => ipcRenderer.send(channel, data),

  // Listen for message from main
  on: (channel: string, callback: (data: any) => void) =>
    ipcRenderer.on(channel, (_event: IpcRendererEvent, data: any) =>
    {
      // console.log('>===>> [preload] Received data from main process:', JSON.stringify(data));
      callback(data)
    }     
   ),

  // Generic invoker for all channels, returns Promise<unknown> e.g.: window.electronAPI.invoke('collect-posts', urls);
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),

  // 250822
  // Opens a new window from Angular and passes data
  openWindow: (data: any) => ipcRenderer.invoke('open-new-window', data),


});
