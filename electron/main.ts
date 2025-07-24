import { type IpcMainInvokeEvent, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  scrapeArticleBasic,
  scrapeList,
  collectPostsFromUrlTabs,
} from './processes/scrappers/scrape-functions';
import { handleSaveScrappedData } from './helpers/electron-utils';
import { listURLData } from '../shared/projectObjects/varObjects';
import { handleOpenFile } from './helpers/electron-utils';
// import { handleOpenFile, handleDroppedFile } from './helpers/electron-utils';

const isDev = require('electron-is-dev');

const { app, BrowserWindow, ipcMain } = require('electron');

// const fs = require('fs');
// const path = require('path');
// const {
//   scrapeArticleBasic,
// } = require('./processes/scrappers/scrape-article-basic');

let mainAppWin: any;

function createWindow() {
  console.log('>====>> App ready, creating window');

  mainAppWin = new BrowserWindow({
    width: 1000,
    height: 700,
    // icon: path.join(__dirname, 'assets/icon.png'),
    // title: 'MEDIUM Scrapper',
    show: false, // show only when ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // nodeIntegration: false,  // ✅ Recommended
      // enableRemoteModule: false,
      // sandbox: false,          // ✅ Must be false to expose `file.path`
    },
  });

  const angularDistPath = path.join(
    process.cwd(),
    'dist/electronang1/browser/index.html'
  );

  console.log('process.cwd():', process.cwd());
  console.log('__dirname:', __dirname);
  console.log('Loading Angular app from:', angularDistPath);

  mainAppWin
    .loadFile(angularDistPath)
    .then(() => {
      console.log('Angular app loaded successfully');
    })
    .catch((err: unknown) => {
      console.error('Failed to load Angular app:', err);
    });

  // Open DevTools only if in development mode
  if (isDev) {
    mainAppWin.webContents.openDevTools();
  }

  mainAppWin.once('ready-to-show', () => {
    console.log('Main window ready to show');
    mainAppWin.show();
  });

  mainAppWin.on('closed', () => {
    console.log('Main window closed');
  });
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('Re-activating app, creating window');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('All windows closed, quitting app');
    app.quit();
  }
});

// Custom IPC handlers
// -----------------------------------------------------------------

ipcMain.handle(
  'scrape-article',
  async (event: IpcMainInvokeEvent, url: string) => {
    console.log(`Received scrape-article request for URL: ${url}`);
    try {
      const result = await scrapeArticleBasic(url);
      console.log('Scraping successful');
      return { success: true, data: result };
    } catch (error: unknown) {
      console.error('Scraping error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

// ipcMain.handle(
//   'scrape-multi-articles',
//   async (event: IpcMainInvokeEvent, urls: string[]) => {
//     console.log(`Received scrape-article request for URLs: ${urls}`);
//     try {
//       const result = await scrapeMultiArticesleBasic(urls);
//       console.log('Scraping successful');
//       return { success: true, data: result };
//     } catch (error: unknown) {
//       console.error('Scraping error:', error);
//       return {
//         success: false,
//         error: error instanceof Error ? error.message : String(error),
//       };
//     }
//   }
// );

ipcMain.handle(
  'read-markdown',
  async (event: IpcMainInvokeEvent, fileName: string) => {
    const filePath = path.join(__dirname, 'resources', 'markdown', fileName);
    return await fs.promises.readFile(filePath, 'utf8');
  }
);

ipcMain.handle(
  'save-scrapped-data',
  async (
    _event: IpcMainInvokeEvent,
    scrappedData: string,
    urlObj?: listURLData
  ) => {
    return await handleSaveScrappedData(scrappedData, urlObj);
  }
);

ipcMain.handle(
  'scrape-list',
  async (event: IpcMainInvokeEvent, url: string) => {
    console.log(`Received scrape-list request for URL: ${url}`);
    try {
      const result = await scrapeList(url);
      console.log('Scraping successful');
      return { success: true, data: result };
    } catch (error: unknown) {
      console.error('Scraping (scrape-list) error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

ipcMain.handle(
  'scrape-tabs',
  async (event: IpcMainInvokeEvent, urls: string[]) => {
    console.log(`Received scrape-tabs request for  ${urls.length}  URLs`);
    try {
      const result = await collectPostsFromUrlTabs(urls);
      console.log('Scraping successful');
      return { success: true, data: result };
    } catch (error: unknown) {
      console.error('Scraping (scrape-tabs) error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

// ipcMain.handle('open-file-dialog', async () => {
//   const result = await handleOpenFile(mainAppWin);
//   return result;
// });
// ipcMain.handle('open-file-dialog', async () => {
//   if (mainAppWin) {
//     return await handleOpenFile(mainAppWin);
//   }
//   return { success: false, message: 'Main window not available' };
// });
ipcMain.handle('open-file-dialog', () => {
  if (mainAppWin) {
    return handleOpenFile(mainAppWin); // return the promise directly
  }
  return { success: false, message: 'Main window not available' };
});

// ipcMain.handle('file-dropped', async (_event: any, filePath: string) => {
//   console.log('Received dropped file path:', filePath);
//   if (mainAppWin) {
//     return handleDroppedFile(filePath);
//   }
//   return { success: false, message: 'Main window not available' };

// });
