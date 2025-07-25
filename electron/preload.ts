// const { contextBridge, ipcRenderer } = require('electron');
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('>====>> Running PRELOAD.JS from Electron');

// ⛔ Prevent default browser file load behavior
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
});

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

  // registerFileDrop: () => {
  //   window.addEventListener('dragover', (e) => e.preventDefault());
  //   window.addEventListener('drop', (event) => {
  //     event.preventDefault();
  //     const files = event.dataTransfer?.files;
  //     const file = files?.[0] as any;
  //     if (file?.path) {
  //       console.log('📥 Dropped file:', file.path);
  //       window.dispatchEvent(
  //         new CustomEvent('file-dropped', { detail: file.path })
  //       );
  //     } else {
  //       console.warn('⚠️ Dropped file has no path:', file);
  //     }
  //   });
  // },
});


// window.addEventListener('drop', (event) => {
//   event.preventDefault();

//   const files = event.dataTransfer?.files;
//   const file = files?.[0] as any;

//   if (file?.path) {
//     console.log('📂 Dropped file path (from preload):', file.path);

//     // Send to renderer via a custom event
//     window.dispatchEvent(
//       new CustomEvent('file-dropped', { detail: file.path })
//     );
//   } else {
//     console.warn('⚠️ Dropped file has no path:', file);
//   }
// });