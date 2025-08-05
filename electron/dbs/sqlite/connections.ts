// /electron/dbs/sqlite/connections.ts

import { app } from 'electron';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  APP_SUPPORT_FOLDER,
  APP_MAIN_SQLITE_DB_FILE,
} from '../../../shared/constants';
import { getConfigProperty } from '../../helpers/electron-utils';

const MAIN_PBM_SQLITE_FILE = path.join(
  app.getPath('userData'),
  APP_SUPPORT_FOLDER,
  APP_MAIN_SQLITE_DB_FILE
);

// const workingDbPath: string = getConfigProperty('workingBookmarksDbPath')!; 

// Copied/Working Floorp/Firefox bookmarks SQLite DB Instance ('places.sqlite')
// ------------------------------------------------------------------------------

let fdb: Database.Database | null = null;

export function getWorkingConnection(): Database.Database | null {
  if (fdb) {
    return fdb;
  }
  const workingDbPath: string = getConfigProperty('workingCopyOfFloorpProfilePlacesSqliteFile')!;
  if (!workingDbPath) throw new Error('Working DB path is not set!');
  if (!fs.existsSync(workingDbPath)) {
    console.log('Error! Working Floorp/Firefox DB file does not exist:', workingDbPath);
    return null;
  } else {
    console.log('Using working Floorp/Firefox DB file:', workingDbPath);
  }
  try {
    fdb = new Database(workingDbPath, { readonly: true });
    if (!fdb) {
      console.log('Error! Could not open Floorp/Firefox working database.');
      return null;
    }
    return fdb;
  } catch (err: any) {
    console.log(
      'Error! Error instantiating Floorp/Firefox working database: ',
      err
    );
    return null;
  }
}

// Nain App SQLite DB Instance
// -------------------------------------------------------------------------
let dbInstance: Database.Database | null = null;

// App-wide Singleton
export function getMainConnection(readOnly = false): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbFilePath = MAIN_PBM_SQLITE_FILE;

  // Ensure DB file exists (if not read-only)
  if (!readOnly && !fs.existsSync(dbFilePath)) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    fs.writeFileSync(dbFilePath, '');
  }

  const options = {
    readonly: readOnly,
    fileMustExist: readOnly,
  };

  dbInstance = new Database(dbFilePath, options);
  dbInstance.pragma('foreign_keys = ON');

  console.log(
    `MAIN SQLite connected (singleton): ${dbFilePath} (${
      readOnly ? 'read-only' : 'read-write'
    })`
  );
  return dbInstance;
}

// Close DB Connections
export function closeDBConnections() {
  if (fdb) {
    fdb.close();
    fdb = null;
    console.log('>===>> Working SQLite connection closed.');
  }
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('>===>> MAIN SQLite connection closed.');
  }
}
