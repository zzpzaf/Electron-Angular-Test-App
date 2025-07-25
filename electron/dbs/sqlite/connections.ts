// /electron/dbs/sqlite/connections.ts


import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getConnection1(filePath: string):  Database.Database | null {
  try {
    db = new Database(filePath, { readonly: true });
    return db;

  } catch (err: any) {
    console.log('Error! Error instantiating database: ', err);
    return null;
  }
}


