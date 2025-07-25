// electron/dbs/sqlite/queries.ts

import { LinkRow, SubfolderRow } from '../../../shared/projectObjects/varObjects';
import { getConnection1 } from './connections';



export function getSubfoldersByParentFolderName(
  sqliteFilePatName: string,
  rootTitle: string
): {
  success: boolean;
  data?: SubfolderRow[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePatName);
  if (!db) {
    console.log('>===>> Error - Unable to create DB Connection!');
    return { success: false, error: 'No DB connection' };
  }

  try {
    const sqlQuery = `
      WITH RECURSIVE subfolders(id, title, parent) AS (
          SELECT id, title, parent
          FROM moz_bookmarks
          WHERE title = ? AND type = 2
          UNION ALL
          SELECT b.id, b.title, b.parent
          FROM moz_bookmarks b
          JOIN subfolders sf ON b.parent = sf.id
          WHERE b.type = 2
      )
      SELECT id AS folder_id, title AS folder_name, parent AS parent_id
      FROM subfolders
      WHERE id != (SELECT id FROM moz_bookmarks WHERE title = ? AND type = 2);
      `;

    const stmt = db.prepare(sqlQuery);
    // Same parameter twice => pass it twice
    const rows = stmt.all(rootTitle, rootTitle) as SubfolderRow[];
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function getFolderContentsByParentFolderName(
  sqliteFilePatName: string,
  rootTitle: string
): {
  success: boolean;
  data?: LinkRow[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePatName);
  if (!db) {
    console.log('>===>> Error - Unable to create DB Connection!');
    return { success: false, error: 'No DB connection' };
  }

  try {
    const sqlQuery = `
    SELECT b.title AS title, p.url AS link
    FROM moz_bookmarks b
    JOIN moz_places p ON b.fk = p.id
    WHERE b.parent = (
      SELECT id FROM moz_bookmarks WHERE title = ? AND type = 2
    )
    AND b.type = 1;
    `;
    const stmt = db.prepare(sqlQuery);
    // Same parameter twice => pass it twice
    const rows = stmt.all(rootTitle) as LinkRow[];
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
