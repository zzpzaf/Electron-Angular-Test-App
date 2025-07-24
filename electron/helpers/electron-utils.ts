import { existsSync, mkdirSync } from 'fs';
import { app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { listURLData } from '../../shared/projectObjects/varObjects';

export function ensureFolderExists(folderPath: string): void {
  if (!existsSync(folderPath)) {
    try {
      mkdirSync(folderPath, { recursive: true });
      console.log(`📂 Created output folder: ${folderPath}`);
    } catch (err) {
      console.error(`❌ Failed to create folder "${folderPath}":`, err);
      throw err;
    }
  }
}

export function formatDate(input: string): string {
  console.log(`formatDate(${input})`);

  const now = new Date();
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  if (/^\d+h ago$/.test(input)) {
    return `${String(now.getFullYear()).slice(2)}${pad(
      now.getMonth() + 1
    )}${pad(now.getDate())}`;
  }

  if (/^\d+\s*(h|hours)\s+ago$/.test(input)) {
    const hoursAgo = parseInt(input);
    const pastDate = new Date(now);
    pastDate.setHours(now.getHours() - hoursAgo);
    return `${String(pastDate.getFullYear()).slice(2)}${pad(
      pastDate.getMonth() + 1
    )}${pad(pastDate.getDate())}`;
  }

  // if (/^\d+d ago$/.test(input)) {
  if (/^\d+\s*(d|days)\s+ago$/.test(input)) {
    const daysAgo = parseInt(input);
    const pastDate = new Date(now);
    pastDate.setDate(now.getDate() - daysAgo);
    return `${String(pastDate.getFullYear()).slice(2)}${pad(
      pastDate.getMonth() + 1
    )}${pad(pastDate.getDate())}`;
  }

  if (/^[A-Z][a-z]{2} \d{1,2}$/.test(input)) {
    const [monthStr, day] = input.split(' ');
    return `${String(now.getFullYear()).slice(2)}${pad(
      months[monthStr] + 1
    )}${pad(parseInt(day, 10))}`;
  }

  if (/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(input)) {
    const [monthStr, dayWithComma, year] = input.split(' ');
    const day = dayWithComma.replace(',', '');
    return `${year.slice(2)}${pad(months[monthStr] + 1)}${pad(
      parseInt(day, 10)
    )}`;
  }

  return 'Unknown';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

const CONFIG_FILE = path.join(
  app.getPath('userData'),
  'medium-scrapper-app-config.json'
);

export async function handleSaveScrappedData(
  scrappedData: string,
  urlObj?: listURLData
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  let fileNameFirstPrefix = 'posts_scrapped_data_';
  if (urlObj)
    fileNameFirstPrefix =
      fileNameFirstPrefix + urlObj.pubauthorslug + '_' + urlObj.listname + '_';

  try {
    const filenamePrefix =
      fileNameFirstPrefix + new Date().toISOString().replace(/:/g, '-');
    const lastFolder = getLastSavedFolder();

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Scrapped Data',
      defaultPath: lastFolder
        ? path.join(lastFolder, `${filenamePrefix}.json`)
        : path.join(app.getPath('documents'), `${filenamePrefix}.json`),
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Save canceled' };
    }

    await fs.promises.writeFile(filePath, scrappedData, 'utf8');

    setLastSavedFolder(path.dirname(filePath));

    return { success: true, message: 'Scrapped data saved' };
  } catch (error) {
    console.error('Error saving scrapped data:', error);
    return {
      success: false,
      message: 'Error saving scrapped data',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getLastSavedFolder(): string | null {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return data.lastSavedFolder || null;
    } catch {
      return null;
    }
  }
  return null;
}

function setLastSavedFolder(folderPath: string): void {
  const data = { lastSavedFolder: folderPath };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data), 'utf8');
}

// export async function openAndReadFile(mainWindow) {
//   const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
//     properties: ['openFile'],
//     filters: [
//       { name: 'Text and JSON', extensions: ['txt', 'json'] }
//     ]
//   });

//   if (canceled || filePaths.length === 0) {
//     return null;
//   }

//   const filePath = filePaths[0];
//   const data = await fs.readFile(filePath, 'utf-8');

//   return { filePath, data };
// }

// import { app, dialog, BrowserWindow } from 'electron';
// import fs from 'fs';
// import path from 'path';

export async function handleOpenFile(mainWindow: BrowserWindow): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  data?: string;
  error?: string;
}> {
  try {
    const lastFolder = getLastSavedFolder();

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open .txt or .json File',
      defaultPath: lastFolder || app.getPath('documents'),
      properties: ['openFile'],
      filters: [{ name: 'Text and JSON', extensions: ['txt', 'json'] }],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'Open file canceled' };
    }

    const filePath = filePaths[0];

    // classic sync read:
    // const data = fs.readFileSync(filePath, 'utf8'); 
    // Alternative: async version:
    const data = await new Promise<string>((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    setLastSavedFolder(path.dirname(filePath));

    return {
      success: true,
      message: 'File read successfully',
      filePath,
      data,
    };
  } catch (error) {
    console.error('Error opening file:', error);
    return {
      success: false,
      message: 'Error opening file',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}




// export async function handleDroppedFile(droppedFilePath: string): Promise<{
//   success: boolean;
//   message: string;
//   filePath?: string;
//   data?: string;
//   error?: string;
// }> {
//   try {
 
//     const filePath = droppedFilePath;

//     // classic sync read:
//     // const data = fs.readFileSync(filePath, 'utf8'); 
//     // Alternative: async version:
//     const data = await new Promise<string>((resolve, reject) => {
//       fs.readFile(filePath, 'utf8', (err, data) => {
//         if (err) reject(err);
//         else resolve(data);
//       });
//     });

//     setLastSavedFolder(path.dirname(filePath));

//     return {
//       success: true,
//       message: 'File droped read successfully',
//       filePath,
//       data,
//     };
//   } catch (error) {
//     console.error('Error opening dropped file:', error);
//     return {
//       success: false,
//       message: 'Error opening dropped file',
//       error: error instanceof Error ? error.message : String(error),
//     };
//   }
// }