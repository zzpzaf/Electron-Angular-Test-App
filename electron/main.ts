import { HandlerDetails, type IpcMainInvokeEvent, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  scrapeArticleBasic,
  scrapeList,
  collectPostsFromUrlTabs,
} from './processes/scrappers/scrape-functions';
import {
  coerceParameter,
  copyFileAsync,
  copyWildFiles,
  deleteFiles,
  getConfigProperty,
  getFileData,
  getPropertyValueBySubstring,
  handleSaveMDFile,
  handleSaveScrappedData,
  selectFolder,
} from './helpers/electron-utils';
import {
  Category,
  CategoryNode,
  listURLData,
  PostData,
} from '../shared/projectObjects/varObjects';
import { getFileFullPathName } from './helpers/electron-utils';
import {
  getSubfoldersByParentFolderName,
  getFolderContentsByParentFolderName,
  findFoldersByTitle,
  getFolderContentsByParentFolderNameAndOccurence,
  getFolderContentsById,
  countUniqueLinksByFolderId,
} from './dbs/sqlite/fdb_queries';
import { backupOrgPlacesSQLite } from './dbs/sqlite/sqlite3-utils';
// import { htmlToMarkdown } from './processes/scrappers/page-converters';
import { shell } from 'electron';
import { closeDBConnections } from './dbs/sqlite/connections';
import {
  getArticleById,
  getCategoriesByParentId,
  getPostBySlug,
  getSubcategoryForest,
  getUncategorizedArticles,
  insertArticlesFromJson,
  isSlugExisting,
  isUrlExisting,
} from './dbs/sqlite/mandb_queries';
import { attachContextMenu } from './context-menu';

const isDev = require('electron-is-dev');

// const { app, BrowserWindow, ipcMain, Menu } = require('electron');
import { app, BrowserWindow, ipcMain } from 'electron';
import { attachCopiedImages } from './context-copy-selected-images';

let mainAppWin: any;

  // ==========================================================================
  // Define the path of ndex.html file of the running Angular app from the dist folder
  // ==========================================================================
  // Use path.join to ensure correct path resolution across platforms
  const angularDistPath = path.join(
    process.cwd(),
    'dist/electronang1/browser/index.html'
  );

// ======================================================================================================
// The Main Function to create the main Electron application window
// ======================================================================================================
function createWindow() {
  console.log('>===>> App ready, creating window');

  // ====================================================================
  // Create the main Electron application window
  // ====================================================================
  mainAppWin = new BrowserWindow({
    width: 1400,
    height: 900,
    // icon: path.join(__dirname, 'assets/icon.png'),
    // title: 'MEDIUM Scrapper',
    show: false, // show only when ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // nodeIntegration: false,  // Recommended
      // enableRemoteModule: false,
      sandbox: false, // Must be false to allow the preload.ts to import other scripts like the ./context-select-all-support
    },
  });
  // ====================================================================

  // ===========================================================================
  // Intercept an external link (https://...) and open it, in user’s default browser instead
  // ===========================================================================
  mainAppWin.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    const { url } = details;
    // Open all non-local URLs in the default browser
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainAppWin.webContents.on('will-navigate', (event: any, url: string) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  // ===========================================================================

  // // ==========================================================================
  // // Load the Angular app from the dist folder
  // // ==========================================================================
  // // Use path.join to ensure correct path resolution across platforms
  // const angularDistPath = path.join(
  //   process.cwd(),
  //   'dist/electronang1/browser/index.html'
  // );

  console.log('>===>> process.cwd():', process.cwd());
  console.log('>===>> __dirname:', __dirname);
  console.log('>===>> Loading Angular app from:', angularDistPath);

  // Load the Angular app
  // mainAppWin.loadURL(`file://${angularDistPath}`);
  // or, if you prefer to use loadFile:
  // mainAppWin.loadFile(angularDistPath);
  // Note: loadFile is preferred for local files, but loadURL works too.
  mainAppWin
    .loadFile(angularDistPath)
    .then(() => {
      console.log('>===>> Angular app loaded successfully');
    })
    .catch((err: unknown) => {
      console.error('>===>> Failed to load Angular app:', err);
    });

  // Open DevTools only if in development mode
  if (isDev) {
    mainAppWin.webContents.openDevTools();
  }
  // ==========================================================================

  // ==========================================================================
  // Attach a custom context menu
  // This will allow right-click context menu support in the Electron app
  // ==========================================================================
  // let disposeContextMenu = attachContextMenu(mainAppWin);
  // A minimal entry to attach context menu
  // let disposeContextMenu: (() => void) | null = attachContextMenu(mainAppWin);
  // Or, use ReturnType so it always matches whatever attachContextMenu returns:
  let disposeContextMenu: ReturnType<typeof attachContextMenu> | null =
    attachContextMenu(mainAppWin);
  let disposeCopiedImages: ReturnType<typeof attachCopiedImages> | null =
    attachCopiedImages();
  // ==========================================================================

  // ==========================================================================
  // Show the main window when it's ready
  // ==========================================================================
  mainAppWin.once('ready-to-show', () => {
    console.log('>===>> Main window ready to show');
    mainAppWin.show();
  });
  // ==========================================================================

  // ==========================================================================
  // Handle window close event
  // ==========================================================================
  mainAppWin.on('closed', () => {
    disposeContextMenu?.();
    disposeContextMenu = null;
    disposeCopiedImages?.();
    disposeCopiedImages = null;
    mainAppWin = null; // Clear the reference to the main window
    console.log('>===>> Main window closed');
  });
  // ==========================================================================
}










// ======================================================================================================
// Electron app initialization
// ======================================================================================================
app.whenReady().then(() => {
  console.log('>===>> Electron app is ready');
  createWindow();

  // Activate the main window when the app is activated (e.g., from the dock on macOS)
  // This is useful for macOS where the app can be activated without any windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('>===>> Re-activating app, creating window');
      createWindow();
    }
  });
});
// ======================================================================================================

// ======================================================================================================
// Handle app quitting
// ======================================================================================================
// Quit the app when all windows are closed (except on macOS)
// On macOS, it's common to keep the app running even if no windows are open
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('>===>> All windows closed, quitting app');
    app.quit();
  }
});
// ======================================================================================================



// ======================================================================================================
// Handle a NEW Electron window openning via a route path (defined in Angular app.route.ts) and pass data
// ======================================================================================================
//
let markViewerWindow: BrowserWindow | null = null;
ipcMain.handle('open-new-window', async (_event, data) => {

  const routePath: string = '/show-mark';

  console.log('>===>> Opening a New Window (open-new-window)');
  // console.log('>===>> process.cwd():', process.cwd());
  // console.log('>===>> __dirname:', __dirname);

  if (markViewerWindow && !markViewerWindow.isDestroyed()) {
    // Window already open – just focus and send new data
    markViewerWindow.focus();
    markViewerWindow.webContents.send('window-data', data);
    return true;
  }

  const win = new BrowserWindow({
    width: 800,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });
  markViewerWindow = win;

  // Pass the data via query string 
  // *** Passing data via query parameters is not the best practice for large structured data
  // const encodedData = encodeURIComponent(JSON.stringify(data));
  // win.loadURL(`file://${angularDistPath}#/show-mark?data=${encodedData}`);
  
  // win.loadURL(`file://${angularDistPath}#/show-mark`);
  // markViewerWindow.loadURL(`file://${angularDistPath}#/show-mark`);
  markViewerWindow.loadURL(`file://${angularDistPath}#/${routePath}`);

  markViewerWindow.once('ready-to-show', () => {
    markViewerWindow?.show();
  });

  // Send data to window after it's fully loaded
  // win.webContents.once('did-finish-load', () => {
  markViewerWindow.webContents.once('did-finish-load', () => {
    console.log('>===>> ✅ New window finished loading. Sending data...');
    // console.log('>===>> 📨 Data sent from main process:', JSON.stringify(data));
    markViewerWindow?.webContents.send('window-data', data);
    // setTimeout(() => {
    //   console.log('>===>> ⏱️ Sending delayed data to new window...');
    //   markViewerWindow.webContents.send('window-data', data);
    // }, 300); // Try 300–500ms
  });


  // Open DevTools for debugging
  if (isDev) {
    win.webContents.openDevTools();
  }

  // Clean up when closed
  markViewerWindow.on('closed', () => {
    markViewerWindow = null;
  });

  return true;
});
// ======================================================================================================



















// ******************************************************************************************************
// Custom IPC handlers
// ******************************************************************************************************

ipcMain.handle('app:quit', (event: any) => {
  // Close all windows first (usually app.quit() will do it anyway)
  BrowserWindow.getAllWindows().forEach(
    (w: InstanceType<typeof BrowserWindow>) => w.close()
  );
  app.quit(); // emits before-quit / will-quit, lets you clean up
  // If you really must force it (not recommended normally):
  // app.exit(0);
});

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

// ipcMain.handle(
//   'convert-html-to-markdown',
//   async (event: any, args: { input: string; isRawHtml: boolean }) => {
//     const { input, isRawHtml } = args;

//     try {
//       const markdown = await htmlToMarkdown(input, isRawHtml);
//       return { success: true, markdown };
//     } catch (error: any) {
//       return { success: false, error: error.message || 'Unknown error' };
//     }
//   }
// );

ipcMain.handle(
  'save-scrapped-data',
  async (
    _event: IpcMainInvokeEvent,
    scrappedData: string,
    urlObj?: listURLData | string
  ) => {
    return await handleSaveScrappedData(scrappedData, urlObj);
  }
);

ipcMain.handle(
  'save-md-file',
  async (_event: IpcMainInvokeEvent, scrappedData: string, title?: string) => {
    return await handleSaveMDFile(scrappedData, title);
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
      const result: PostData[] = await collectPostsFromUrlTabs(urls);
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

ipcMain.handle(
  'open-file-dialog',
  (_event: any, defPathProperty: string, fdOptions: any) => {
    if (mainAppWin) {
      return getFileFullPathName(mainAppWin, defPathProperty, fdOptions); // pass options to the handler
    }
    return { success: false, message: 'Main window not available' };
  }
);

ipcMain.handle('read-file-data', async (event: any, filePathName: string) => {
  console.log(
    '>===>> (read-file-data) - Reading Data from File: filePathName',
    filePathName
  );
  // return getFileData(filePathName); // pass options to the handler
  const data = await getFileData(filePathName);
  // console.log('>===>> (read-file-data) - Data obtained from File: ', data);
  return data; // return value sent back to renderer
});

ipcMain.handle('select-folder', async (event: any, defaultPath?: string) => {
  if (mainAppWin) {
    return await selectFolder(mainAppWin, defaultPath);
  }
  return { success: false, message: 'Main window not available' };
});

ipcMain.handle(
  'copy-file',
  async (event: any, source: string, destination: string) => {
    await copyFileAsync(source, destination);
    return { success: true };
  }
);

ipcMain.handle(
  'copy-wild-files',
  async (event: any, sourceFilePaths: string[], destinationFolder: string) => {
    await copyWildFiles(sourceFilePaths, destinationFolder);
    return { success: true };
  }
);

ipcMain.handle('delete-files', async (event: any, filePaths: string[]) => {
  if (!Array.isArray(filePaths)) {
    throw new Error('delete-files: Input must be an array of file paths');
  }
  return await deleteFiles(filePaths);
});

ipcMain.handle(
  'get-property-by-substring',
  (event: any, key: string, substring: string) => {
    return getPropertyValueBySubstring(key, substring);
  }
);

ipcMain.handle(
  'get-config-property-by-key',
  async (event: any, key: string) => {
    try {
      const value: string | null = getConfigProperty(key);
      return value;
    } catch (err) {
      console.log('Error getting property by key: ', err);
      return null;
    }
  }
);

// ipcMain.handle('sqlite:open-connection1', (event: any, filePath: string) => {
//   return getConnection1(filePath);
// });

ipcMain.handle(
  'sqlite:backup-places',
  async (event: any, sourcePath: string, targetPath: string) => {
    try {
      const result = await backupOrgPlacesSQLite(sourcePath, targetPath);
      return { success: true, message: result };
    } catch (err: any) {
      console.error('Error backing up places.sqlite:', err);
      return { success: false, error: err.message };
    }
  }
);

// Handle DB close request from Angular
ipcMain.handle('sqlite:close-db-connections', async () => {
  try {
    closeDBConnections();
    return { success: true };
  } catch (err: any) {
    console.error('Error closing DB connections:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle(
  'sqlite:insert-articles-from-json-array',
  (event: any, postsData: PostData[]) => {
    try {
      const nrOfInsertedRows = insertArticlesFromJson(postsData);
      return nrOfInsertedRows; // just the number
    } catch (err) {
      console.error('Error inserting articles from JSON array:', err);
      return 0; // if error, return 0
    }
  }
);

ipcMain.handle('sqlite:check-if-url-exists', (event: any, link: string) => {
  try {
    const sanitized = (link ?? '').trim();
    if (!sanitized) return false; // empty/invalid input → treat as not found
    const isExisting = isUrlExisting(sanitized);
    return isExisting; // boolean
  } catch (err) {
    console.error('Error checking linkurl existence:', link, err);
    return false; // always return boolean
  }
});

ipcMain.handle('sqlite:check-if-slug-exists', (event: any, slug: string) => {
  try {
    const sanitized = (slug ?? '').trim();
    if (!sanitized) return false; // empty/invalid input → treat as not found
    const isExisting = isSlugExisting(sanitized);
    return isExisting; // boolean
  } catch (err) {
    console.error('Error checking Slug existence:', slug, err);
    return false; // always return boolean
  }
});

ipcMain.handle('sqlite:get-post-data-by-slug', (event: any, slug: string) => {
  try {
    const sanitized = (slug ?? '').trim();
    if (!sanitized) return false; // empty/invalid input → treat as not found
    const postData: PostData | null = getPostBySlug(sanitized);
    return postData; // PostData or null
  } catch (err) {
    console.error('Error getting Post data by Slug:', slug, err);
    return false; // always return boolean
  }
});


ipcMain.handle('sqlite:get-articles-by-id', (event: any, id?: number) => {
  // Parameter id can be: a number > 0, or not provided at all
  let articles: PostData[] = [];
  try {
    if (!id) {
      articles = getArticleById();
    } else if (id > 0) {
      articles = getArticleById(id);
    }
    return articles;
  } catch (err) {
    console.error('Error getting Articles by id: "', id, '" ', err);
    return articles;
  }
});

ipcMain.handle('sqlite:get-uncategorized-articles', (event: any) => {
  let articles: PostData[] = [];
  try {
    articles = getUncategorizedArticles();
    return articles;
  } catch (err) {
    console.error('Error getting Uncategorized Articles: ', err);
    return articles;
  }
});


ipcMain.handle(
  'sqlite:get-categories-by-parent-id',
  (event: any, parent_id?: unknown) => {
    // Parameter parent_id can be: number, nul, or not provided at all
    try {
      const coerced = coerceParameter(parent_id);
      const categories: Category[] = getCategoriesByParentId(coerced);
      return categories;
    } catch (err) {
      console.error(
        'Error getting Categories by parent_id: "',
        parent_id,
        '" ',
        err
      );
      return false; // always return boolean
    }
  }
);

ipcMain.handle(
  'sqlite:get-sub-category-forest-by-parent-id',
  (event: any, parent_id: unknown) => {
    // Parameter parent_id can be: number, '', or not provided at all
    try {
      const coerced = coerceParameter(parent_id);
      const effective = coerced === undefined ? null : coerced;
      const categoryForest: CategoryNode[] = getSubcategoryForest(
        effective as number | null
      );
      return categoryForest;
    } catch (err) {
      console.error(
        'Error getting Category Forest by parent_id: "',
        parent_id,
        '" ',
        err
      );
      return [];
    }
  }
);

ipcMain.handle(
  'sqlite:get-subfolders-tree',
  (event: any, field1Name: string) => {
    const qryResult = getSubfoldersByParentFolderName(field1Name);
    return qryResult;
  }
);

ipcMain.handle(
  'sqlite:get-folder-contents',
  (event: any, rootFolder1Name: string) => {
    const qryResult = getFolderContentsByParentFolderName(rootFolder1Name);
    return qryResult;
  }
);

ipcMain.handle('sqlite:get-folder-contents-by-id', (event: any, id: number) => {
  const qryResult = getFolderContentsById(id);
  return qryResult;
});

ipcMain.handle(
  'sqlite:get-number-unique-links-from-folder-by-id',
  (event: any, id: number) => {
    const qryResult = countUniqueLinksByFolderId(id);
    return qryResult;
  }
);

ipcMain.handle('sqlite:find-folders-by-title', (event: any, ftitle: string) => {
  return findFoldersByTitle(ftitle);
});

ipcMain.handle(
  'sqlite:get-folder-contents-by-folderName-and-occurence',
  (event: any, rootFolder1Name: string, occurence: number) => {
    const qryResult = getFolderContentsByParentFolderNameAndOccurence(
      rootFolder1Name,
      occurence
    );
    return qryResult;
  }
);

// Not-used so far ....
ipcMain.handle('open-component-window', (event: any, data: any) => {
  const newWin = new BrowserWindow({
    width: 750,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Always load from dist folder since we are using Option 1 (no dev server)
  newWin.loadFile(path.join(__dirname, '../electronang1/browser/index.html'), {
    hash: '/popup-preview',
  });

  // Send markdown data to popup after load
  newWin.webContents.once('did-finish-load', () => {
    newWin.webContents.send('mark-data', data);
  });
});

