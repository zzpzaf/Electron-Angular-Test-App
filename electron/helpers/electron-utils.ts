import { existsSync, mkdirSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { listURLData } from '../../shared/projectObjects/varObjects';
import { glob } from 'glob';
import { APP_MAIN_CONFIG_FILE, APP_SUPPORT_FOLDER } from '../../shared/constants';

// const CONFIG_FILE = path.join(
//   app.getPath('userData'),
//   '/' + APP_SUPPORT_FOLDER + '/' + APP_MAIN_CONFIG_FILE
// );
const CONFIG_FILE = path.join(
  app.getPath('userData'),
  APP_SUPPORT_FOLDER,
  APP_MAIN_CONFIG_FILE
);



// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// -----------------------------------------------------------------------
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
    // const lastFolder = getLastSavedFolder();
    const lastFolder = getConfigProperty<string>('lastSavedFolder');

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

    // setLastSavedFolder(path.dirname(filePath));
    setConfigProperties({ lastSavedFolder: path.dirname(filePath) });

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


// --------------------------------------------------------------------------

export async function handleSaveMDFile(
  data: string,
  title?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  let fileNameFirstPrefix = 'post_markdown_file_';
  if (title && title.length > 0) fileNameFirstPrefix = title + '_';

  try {
    const filenamePrefix =
      fileNameFirstPrefix + new Date().toISOString().replace(/:/g, '-');
    // const lastFolder = getLastSavedFolder();
    const lastFolder = getConfigProperty<string>('lastSavedFolder');

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Save Markdown File',
      defaultPath: lastFolder
        ? path.join(lastFolder, `${filenamePrefix}.md`)
        : path.join(app.getPath('documents'), `${filenamePrefix}.md`),
      filters: [{ name: 'Markdown (MD) Files', extensions: ['md'] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Save canceled' };
    }

    await fs.promises.writeFile(filePath, data, 'utf8');

    // setLastSavedFolder(path.dirname(filePath));
    setConfigProperties({ lastSavedFolder: path.dirname(filePath) });

    return { success: true, message: 'Markdown File saved' };
  } catch (error) {
    console.error('Error saving Markdown File:', error);
    return {
      success: false,
      message: 'Error saving Markdown File',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}





// --------------------------------------------------------------------------
export async function getFileFullPathName(
  mainWindow: BrowserWindow,
  defPathProperty: string,
  fileDialogOptions?: Electron.OpenDialogOptions
): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  error?: string;
}> {
  try {
    // const lastFolder = getLastSavedFolder();

    const fullPathName = getConfigProperty<string>(
      // 'lastObtainedFullPathname'
      defPathProperty
    );

    console.log('>===>> Property Obtained:', defPathProperty, ' value:', fullPathName);

    const folderName = path.dirname(
      fullPathName ?? app.getPath('documents')
    );

    console.log('>===>> Folder Name: ', folderName);

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: fileDialogOptions?.title || 'Select a file',
      defaultPath: folderName || app.getPath('documents'),
      properties: ['openFile'],
      filters: fileDialogOptions?.filters || [],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'Open file dialog canceled' };
    }

    const newFilePath = filePaths[0];

    // setLastSavedFolder(path.dirname(filePath));
    setConfigProperties({ [defPathProperty]: newFilePath });

    return {
      success: true,
      message: 'File Path Name obtained successfully',
      filePath: newFilePath,
    };
  } catch (error) {
    console.error('Error opening file dialog - Error: ', error);
    return {
      success: false,
      message: 'Error opening file dialog',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}



// -----------------------------------------------------------------------------
export async function getFileData(fileFullPathName: string): Promise<string> {
  console.log('Attempting to read:', fileFullPathName);
  let data: string = '';
  try {
    const exists = fs.existsSync(fileFullPathName);
    console.log('File exists:', exists);
    if (!exists) throw new Error('File does not exist');

    data = await new Promise<string>((resolve, reject) => {
      fs.readFile(fileFullPathName, 'utf8', (err, fileData) => {
        if (err) {
          console.error('Read error:', err);
          reject(err);
        } else {
          console.log('Successfully read file.');
          resolve(fileData);
        }
      });
    });
  } catch (error) {
    console.error('Error in getFileData():', error);
  }
  // console.log('>===>> ( getFileData() ) - Data obtained from File: ', data);
  return data;
}



// -----------------------------------------------------------------------
export async function selectFolder(
  mainWindow: BrowserWindow,
  initPath?: string
): Promise<{ 
  success: boolean; 
  filePath?: string[]; 
  message?: string }> {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a folder',
      defaultPath: initPath?.trim() ? initPath : app.getPath('documents'), // Use provided path if any
      properties: ['openDirectory'],  // key for selecting directories
    });

    if (result.canceled) {
      return { success: false, message: 'User canceled' };
    }

    return { success: true, filePath: result.filePaths };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}


// -----------------------------------------------------------------------
/**
 * Async copy of a file from source to destination
 * - Creates destination folder if it doesn't exist
 * - Overwrites existing file by default
 */
export async function copyFileAsync(source: string, destination: string): Promise<void> {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Perform async copy
    await fsPromises.copyFile(source, destination);
    console.log(`✅ >===>> Copied file from "${source}" to "${destination}"`);
  } catch (error) {
    console.error(`❌ >===>> Failed to copy file from "${source}" to "${destination}":`, error);
    throw error; // Re-throw so the caller can handle it
  }
}


// -----------------------------------------------------------------------
/**
 * Copies one or more files, supporting wildcards in the source paths array elements.
 *
 * @param sourceFilePaths - Array of source paths (wildcards allowed)
 * @param destDir - Destination folder (files will be placed here) (if it is a file, then the destination will be its containing folder)
 */
export async function copyWildFiles(
  sourcePatterns: string[],
  destPath: string
): Promise<void> {
  // Expand all patterns
  let allMatches: string[] = [];
  for (const pattern of sourcePatterns) {
    allMatches = allMatches.concat(glob.sync(pattern));
  }

  // Remove duplicates
  const matchedFiles = [...new Set(allMatches)];
  if (matchedFiles.length === 0) {
    console.warn("No matching files found for:", sourcePatterns);
    return;
  }

  let destDir: string;
  const destIsFilePath = path.extname(destPath) !== "";

  if (matchedFiles.length > 1) {
    // Multiple matches → if dest is file path, use its parent folder
    destDir = destIsFilePath ? path.dirname(destPath) : destPath;
  } else {
    // Single match
    if (destIsFilePath) {
      // Single match → copy directly to file path
      await fsPromises.copyFile(matchedFiles[0], destPath);
      console.log(`Copied: ${matchedFiles[0]} → ${destPath}`);
      return;
    } else {
      destDir = destPath;
    }
  }

  // Ensure destination directory exists
  try {
    const stat = await fsPromises.stat(destDir);
    if (!stat.isDirectory()) {
      throw new Error(`Destination exists but is not a directory: ${destDir}`);
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await fsPromises.mkdir(destDir, { recursive: true });
    } else {
      throw err;
    }
  }

  // Copy each matched file into destination directory
  for (const file of matchedFiles) {
    const stat = await fsPromises.stat(file);
    if (!stat.isFile()) {
      console.log(`Skipping non-file: ${file}`);
      continue;
    }
    const fileName = path.basename(file);
    const finalDest = path.join(destDir, fileName);
    await fsPromises.copyFile(file, finalDest);
    console.log(`Copied: ${file} → ${finalDest}`);
  }
}





// -----------------------------------------------------------------------
/**
 * Deletes multiple files by full absolute path.
 * @param filePaths Array of full file paths to delete.
 * @returns {Promise<{ deleted: string[], failed: string[] }>}
 */
export async function deleteFiles1(filePaths: string[]) {
  const deleted: string[] = [];
  const failed: string[] = [];

  for (const filePath of filePaths) {
    try {
      await fsPromises.unlink(filePath);
      deleted.push(filePath);
    } catch (err) {
      console.error(`Failed to delete file: ${filePath}`, err);
      failed.push(filePath);
    }
  }

  return { deleted, failed };
}


// -----------------------------------------------------------------------
/**
 * Expands wildcards and deletes matching files
 * @param patterns Array of file paths or wildcard patterns
 * @returns {Promise<{ deleted: string[], failed: string[] }>}
 */
export async function deleteFiles(patterns: string[]) {
  const deleted: string[] = [];
  const failed: string[] = [];

  // Expand each pattern into actual file paths
  for (const pattern of patterns) {
    const matches = await glob(pattern, { nodir: true });

    for (const filePath of matches) {
      try {
        await fsPromises.unlink(filePath);
        deleted.push(filePath);
      } catch (err) {
        console.error(`Failed to delete file: ${filePath}`, err);
        failed.push(filePath);
      }
    }
  }

  return { deleted, failed };
}




// -----------------------------------------------------------------------
export function getConfigProperty<T = any>(key: string): T | null {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log(`>===>> getConfigProperty(${key}) - Data: `, data);
      return data[key] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

// -----------------------------------------------------------------------
export function setConfigProperties(newProps: Record<string, any>): void {
  let data = {};

  // Load existing data
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      data = {};
    }
  }

  // Merge new properties
  const updatedData = { ...data, ...newProps };

  // Save back to file
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedData, null, 2), 'utf8');
}

// --------------------------------------------------------------------------
export function getPropertiesBySubstring(
  substring: string
): Record<string, any> {
  if (!fs.existsSync(CONFIG_FILE)) return {};

  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const results: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.includes(substring)) {
        results[key] = value;
      }
    }
    return results;
  } catch {
    return {};
  }
}

// --------------------------------------------------------------------------
export function propertyContains(key: string, substring: string): boolean {
  const value = getConfigProperty<string>(key);
  return typeof value === 'string' && value.includes(substring);
}

// --------------------------------------------------------------------------
export function getPropertyValueBySubstring(
  key: string,
  substring: string
): string {
  let retValue = '';
  const value = getConfigProperty<string>(key);
  if (typeof value === 'string' && value.includes(substring)) retValue = value;
  return retValue;
}
