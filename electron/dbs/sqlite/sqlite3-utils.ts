// electron/dbs/sqlite/sqlite3-utils.ts
// 250802

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

/**
 * Safely backup Floorp/Firefox places.sqlite file while the browser is open!
 * 
 * Opens places.sqlite in read-only mode.
 * Uses SQLite Online Backup API (safe even while Floorp is running).
 * Creates a clean .sqlite file without requiring .sqlite-wal or .sqlite-shm.
 * Can be run inside Electron main process or from a Node CLI script.
 * 
 * No need to manually delete places.sqlite-wal / places.sqlite-shm.
 * No need to close Floorp.
 * It works for any of Floorp/Firefox profiles (in case of multiple profiles).
 * 
 * @param sourcePath Full path to the source places.sqlite file
 * @param destPath Full path to the destination backup file
 */
// export function backupOrgPlacesSQLite(sourcePath: string, destPath: string) {
//   try {
//     if (!fs.existsSync(sourcePath)) {
//       throw new Error(`Source file not found: ${sourcePath}`);
//     }

//     // Ensure destination folder exists
//     fs.mkdirSync(path.dirname(destPath), { recursive: true });

//     // Open source DB in read-only mode
//     const sourceDB = new Database(sourcePath, { readonly: true });

//     // Create destination DB (will overwrite if exists)
//     const destDB = new Database(destPath);

//     // Perform online backup
//     sourceDB.backup(destPath)
//       .then(() => {
//         console.log(`Backup completed successfully: ${destPath}`);
//         destDB.close();
//         sourceDB.close();
//       })
//       .catch((err) => {
//         console.error("Backup failed:", err.message);
//         destDB.close();
//         sourceDB.close();
//       });

//   } catch (err: any) {
//     console.error("Error backing up places.sqlite:", err.message);
//   }
// }
export async function backupOrgPlacesSQLite(sourcePath: string, targetPath: string) {
  try {
    // Ensure target directory exists
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // Open the live database in read-only mode
    const db = new Database(sourcePath, { readonly: true });

    // Use SQLite's native backup API to create a safe copy
    db.backup(targetPath)
      .then(() => {
        console.log('Backup completed:', targetPath);
      })
      .catch((err) => {
        console.error('Backup failed:', err);
      })
      .finally(() => {
        db.close();
      });

    return `Backup started for ${sourcePath}`;
  } catch (err: any) {
    throw new Error(`Backup failed: ${err.message}`);
  }
}