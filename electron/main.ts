import { type IpcMainInvokeEvent, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  scrapeArticleBasic,
  scrapeList,
  collectPostsFromUrlTabs,
} from './processes/scrappers/scrape-functions';
import { getFileData, getPropertyValueBySubstring, handleSaveScrappedData } from './helpers/electron-utils';
import { listURLData } from '../shared/projectObjects/varObjects';
import { getFileFullPathName } from './helpers/electron-utils';
import { getSubfoldersByParentFolderName, getFolderContentsByParentFolderName, findFoldersByTitle, getFolderContentsByParentFolderNameAndOccurence, getFolderContentsById, countUniqueLinksByFolderId } from './dbs/sqlite/queries';
// import { handleOpenFile, handleDroppedFile } from './helpers/electron-utils';

const isDev = require('electron-is-dev');

const { app, BrowserWindow, ipcMain } = require('electron');


let mainAppWin: any;

function createWindow() {
  console.log('>====>> App ready, creating window');

  mainAppWin = new BrowserWindow({
    width: 1000,
    height: 800,
    // icon: path.join(__dirname, 'assets/icon.png'),
    // title: 'MEDIUM Scrapper',
    show: false, // show only when ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // nodeIntegration: false,  // Recommended
      // enableRemoteModule: false,
      // sandbox: false,          // Must be false to expose `file.path`
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

// ipcMain.handle('open-file-dialog', () => {
//   if (mainAppWin) {
//     return handleOpenFile(mainAppWin); // return the promise directly
//   }
//   return { success: false, message: 'Main window not available' };
// });
ipcMain.handle('open-file-dialog', (_event: any, options: any) => {
  if (mainAppWin) {
    return getFileFullPathName(mainAppWin, options); // pass options to the handler
  }
  return { success: false, message: 'Main window not available' };
});

ipcMain.handle('read-file-data', async (event: any, filePathName: string) => {
  console.log('>===>> (read-file-data) - Reading Data from File: filePathName', filePathName);
  // return getFileData(filePathName); // pass options to the handler
  const data = await getFileData(filePathName);
  // console.log('>===>> (read-file-data) - Data obtained from File: ', data);
  return data; // return value sent back to renderer
});




// ipcMain.handle('sqlite:open-connection1', (event: any, filePath: string) => {
//   return getConnection1(filePath);
// });


ipcMain.handle(
  'sqlite:get-subfolders-tree',
  (event: any, sqliteFilePatName: string, field1Name: string,  ) => {
    const qryResult = getSubfoldersByParentFolderName(sqliteFilePatName, field1Name);
    return qryResult;
  }
);


ipcMain.handle(
  'sqlite:get-folder-contents',
  (event: any, sqliteFilePatName: string, rootFolder1Name: string) => {
    const qryResult = getFolderContentsByParentFolderName(sqliteFilePatName, rootFolder1Name);
    return qryResult;
  }  
);

ipcMain.handle(
  'sqlite:get-folder-contents-by-id',
  (event: any, sqliteFilePatName: string, id: number) => {
    const qryResult = getFolderContentsById(sqliteFilePatName, id);
    return qryResult;
  }  
);


ipcMain.handle(
  'sqlite:get-number-unique-links-from-folder-by-id',
  (event: any, sqliteFilePatName: string, id: number) => {
    const qryResult = countUniqueLinksByFolderId(sqliteFilePatName, id);
    return qryResult;
  }  
);



ipcMain.handle(
  'sqlite:find-folders-by-title', (event: any, sqliteFilePathName: string, ftitle: string) => {
  return findFoldersByTitle(sqliteFilePathName, ftitle);
});

ipcMain.handle(
  'sqlite:get-folder-contents-by-folderName-and-occurence',
  (event: any, sqliteFilePatName: string, rootFolder1Name: string, occurence: number) => {
    const qryResult = getFolderContentsByParentFolderNameAndOccurence(sqliteFilePatName, rootFolder1Name, occurence);
    return qryResult;
  }  
);


ipcMain.handle('get-property-by-substring', (event: any, key: string, substring: string) => {
  return getPropertyValueBySubstring(key, substring);
});