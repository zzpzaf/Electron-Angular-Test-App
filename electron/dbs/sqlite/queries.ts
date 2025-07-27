// electron/dbs/sqlite/queries.ts

import {
  FolderMatch,
  FolderNode,
  LinkRow,
  SubfolderRow,
} from '../../../shared/projectObjects/varObjects';
import { getConnection1 } from './connections';




// function getSubfoldersByParentFolderName_old1(
//   sqliteFilePatName: string,
//   rootTitle: string
// ): {
//   success: boolean;
//   data?: SubfolderRow[];
//   error?: string;
// } {
//   const db = getConnection1(sqliteFilePatName);
//   if (!db) {
//     console.log('>===>> Error - Unable to create DB Connection!');
//     return { success: false, error: 'No DB connection' };
//   }

//   try {
//     const sqlQuery = `
//       WITH RECURSIVE subfolders(id, title, parent) AS (
//           SELECT id, title, parent
//           FROM moz_bookmarks
//           WHERE title = ? AND type = 2
//           UNION ALL
//           SELECT b.id, b.title, b.parent
//           FROM moz_bookmarks b
//           JOIN subfolders sf ON b.parent = sf.id
//           WHERE b.type = 2
//       )
//       SELECT id AS folder_id, title AS folder_name, parent AS parent_id
//       FROM subfolders
//       WHERE id != (SELECT id FROM moz_bookmarks WHERE title = ? AND type = 2);
//       `;

//     const stmt = db.prepare(sqlQuery);
//     // Same parameter twice => pass it twice
//     const rows = stmt.all(rootTitle, rootTitle) as SubfolderRow[];
//     return { success: true, data: rows };
//   } catch (err: any) {
//     return { success: false, error: err.message };
//   }
// }


// function buildFolderTree_old1(rows: SubfolderRow[]): FolderNode[] {
//   const map: Record<number, FolderNode> = {};
//   const roots: FolderNode[] = [];

//   // Initialize all nodes in a map
//   rows.forEach((row) => {
//     map[row.folder_id] = {
//       ...row,
//       folder_name: row.folder_name ?? '', // Ensure string, not null
//       children: [],
//     };
//   });

//   // Link children to parents
//   rows.forEach((row) => {
//     if (row.parent_id && map[row.parent_id]) {
//       map[row.parent_id].children!.push(map[row.folder_id]);
//     } else {
//       roots.push(map[row.folder_id]); // root-level folder
//     }
//   });

//   return roots;
// }



// ========================================================================================
export function getSubfoldersByParentFolderName(
  sqliteFilePathName: string,
  rootTitle: string
): {
  success: boolean;
  data?: FolderNode[];
  error?: string;
} {
  console.log(
    '>===>> SQLite file Path Name for DB Connection',
    sqliteFilePathName
  );

  const db = getConnection1(sqliteFilePathName);
  if (!db) {
    console.log('>===>> Error - Unable to create DB Connection!');
    return { success: false, error: 'No DB connection' };
  }


      // const sqlQuery = `
    //   WITH RECURSIVE subfolders(id, title, parent) AS (
    //       SELECT id, title, parent
    //       FROM moz_bookmarks
    //       WHERE title = ? AND type = 2
    //       UNION ALL
    //       SELECT b.id, b.title, b.parent
    //       FROM moz_bookmarks b
    //       JOIN subfolders sf ON b.parent = sf.id
    //       WHERE b.type = 2
    //   )
    //   SELECT id AS folder_id, title AS folder_name, parent AS parent_id
    //   FROM subfolders
    //   WHERE id != (SELECT id FROM moz_bookmarks WHERE title = ? AND type = 2);
    // `;

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
        SELECT
          f.id   AS folder_id,
          f.title AS folder_name,
          f.parent AS parent_id,
          EXISTS (
            SELECT 1
            FROM moz_bookmarks b
            WHERE b.parent = f.id AND b.type = 1
          ) AS has_bookmarks
        FROM subfolders f
        WHERE f.id != (SELECT id FROM moz_bookmarks WHERE title = ? AND type = 2);
      `;

  try {

    const stmt = db.prepare(sqlQuery);
    const rows = stmt.all(rootTitle, rootTitle) as SubfolderRow[];

    // Convert to tree
    const tree = buildFolderTree(rows);
    const pruned = pruneEmptyFolders(tree);

    // return { success: true, data: tree };
    return { success: true, data: pruned };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}



// ----------------------------------------------------------------------------------------
function buildFolderTree(rows: SubfolderRow[]): FolderNode[] {
  const map: Record<number, FolderNode> = {};
  const roots: FolderNode[] = [];

  rows.forEach(r => {
    map[r.folder_id] = {
      folder_id: r.folder_id,
      folder_name: r.folder_name ?? '',
      parent_id: r.parent_id,
      has_bookmarks: !!r.has_bookmarks,
      children: []
    };
  });

  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) {
      map[r.parent_id].children.push(map[r.folder_id]);
    } else {
      roots.push(map[r.folder_id]);
    }
  });

  return roots;
}

// ----------------------------------------------------------------------------------------
function pruneEmptyFolders(nodes: FolderNode[]): FolderNode[] {
  const result: FolderNode[] = [];

  for (const n of nodes) {
    n.children = pruneEmptyFolders(n.children); // prune bottom-up
    const isLeaf = n.children.length === 0;
    if (!(isLeaf && !n.has_bookmarks)) {
      result.push(n);
    }
  }

  return result;
}




















// ========================================================================================
export function getFolderContentsByParentFolderName(
  sqliteFilePathName: string,
  rootTitle: string
): {
  success: boolean;
  data?: LinkRow[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePathName);
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
    const rows = stmt.all(rootTitle) as LinkRow[];
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}



export function getFolderContentsByParentFolderNameAndOccurence(
  sqliteFilePathName: string,
  rootTitle: string,
  occurence: number // 1, 2, 3...
): {
  success: boolean;
  data?: LinkRow[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePathName);
  if (!db) return { success: false, error: 'No DB connection' };

  if (occurence < 1) return { success: false, error: '`which` must be >= 1' };

  try {
    const sqlQuery = `
      WITH candidates AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM moz_bookmarks
        WHERE title = ? AND type = 2
      )
      SELECT b.title AS title, p.url AS link
      FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      JOIN candidates c ON c.id = b.parent
      WHERE c.rn = ? AND b.type = 1
      ORDER BY b.id;
    `;

    const rows = db.prepare(sqlQuery).all(rootTitle, occurence) as LinkRow[];

    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}







// ----------------------------------------------------------------------------------------
export function findFoldersByTitle(
  sqliteFilePathName: string,
  folderTitle: string
): {
  success: boolean;
  count?: number;
  data?: FolderMatch[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePathName);
  if (!db) return { success: false, error: 'No DB connection' };

  try {
    const sql = `
      SELECT id, parent AS parent_id
      FROM moz_bookmarks
      WHERE type = 2 AND title = ?
      ORDER BY id
    `;
    const rows = db.prepare(sql).all(folderTitle) as FolderMatch[];
    return { success: true, count: rows.length, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}




// ========================================================================================
export function getFolderContentsById(
  sqliteFilePathName: string,
  folder_id: number
): {
  success: boolean;
  data?: LinkRow[];
  error?: string;
} {
  const db = getConnection1(sqliteFilePathName);
  if (!db) {
    console.log('>===>> Error - Unable to create DB Connection!');
    return { success: false, error: 'No DB connection' };
  }

  try {
    const sqlQuery = `
      SELECT b.title AS title, p.url AS link
      FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      WHERE b.parent = ?
      AND b.type = 1;
    `;
    const stmt = db.prepare(sqlQuery);
    const rows = stmt.all(folder_id) as LinkRow[];
    return { success: true, data: rows };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}


// ========================================================================================
export function countUniqueLinksByFolderId(
  sqliteFilePathName: string,
  folderId: number
): {
  success: boolean;
  count?: number;
  error?: string;
} {
  const db = getConnection1(sqliteFilePathName);
  if (!db) {
    return { success: false, error: 'No DB connection' };
  }

  try {
    const sql = `
      SELECT COUNT(DISTINCT b.fk) AS cnt
      FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      WHERE b.parent = ?
        AND b.type = 1
    `;
    const row = db.prepare(sql).get(folderId) as { cnt: number } | undefined;
    return { success: true, count: row?.cnt ?? 0 };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
