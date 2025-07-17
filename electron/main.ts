const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
import type { IpcMainInvokeEvent, IpcMainEvent } from 'electron';

const { scrapeArticleBasic } = require('./processes/scrappers/scrape-article-basic');

function createWindow() {
  console.log('App ready, creating window');

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false, // show only when ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  const angularDistPath = path.join(process.cwd(), 'dist/electronang1/browser/index.html');
  console.log('process.cwd():', process.cwd());
  console.log('__dirname:', __dirname);
  console.log('Loading Angular app from:', angularDistPath);

  win.loadFile(angularDistPath)
    .then(() => {
      console.log('Angular app loaded successfully');
    })
    .catch((err: unknown) => {
      console.error('Failed to load Angular app:', err);
    });

  win.once('ready-to-show', () => {
    console.log('Main window ready to show');
    win.show();
  });

  win.on('closed', () => {
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

ipcMain.handle('scrape-article', async (event: IpcMainInvokeEvent, url: string) => {
  console.log(`Received scrape-article request for URL: ${url}`);
  try {
    const result = await scrapeArticleBasic(url);
    console.log('Scraping successful');
    return { success: true, data: result };
  } catch (error: unknown) {
    console.error('Scraping error:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.on('test-channel', (event: IpcMainEvent, arg: unknown) => {
  console.log('Received from Angular (test-channel):', arg);
});
