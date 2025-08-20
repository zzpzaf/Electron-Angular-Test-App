// electron/dbs/sqlite/maindb_queries.ts

import { PostData, Category, CategoryNode, CategoryRow } from '../../../shared/projectObjects/varObjects';
import { getMainConnection } from './connections';

const mainDb = getMainConnection();

// function safeValue(val: any): string | number | bigint | Buffer | null {
//   if (val === undefined || val === null) return null;
//   if (typeof val === 'boolean') return val ? 1 : 0;
//   if (
//     typeof val === 'object' &&
//     !(val instanceof Buffer) &&
//     !(val instanceof Date)
//   )
//     return JSON.stringify(val);
//   if (val instanceof Date) return val.toISOString();
//   return val; // string, number, bigint, Buffer
// }

// function safeStr(val?: string): string {
//   return typeof val === 'string' ? val : '';
// }

// function safeNum(val?: number): number {
//   return typeof val === 'number' ? val : 0;
// }


/** --------------------------------------------------------------------------------------------------
 * Queries for Main Application SQLite DB dealing with articles, categories, and other data
 * --------------------------------------------------------------------------------------------------
 * - insertArticlesFromJson: Inserts an array of articles into the 'articles' table
 * - isUrlExisting: Checks if a URL already exists in the 'articles' table (250810)
 * 
 * - safeValue: Helper function to safely handle different data types (Iis not used yet)
 * - safeStr: Helper function to ensure string values are safe (Iis not used yet)
 * - safeNum: Helper function to ensure number values are safe (Iis not used yet) 
 **/


/* 250810
 * Checks if a URL already exists in the 'articles' table.
 * @param {string} urlString - The URL to check for existence.
 * @returns {boolean} - Returns true if the URL exists, false otherwise.
 */
export function isUrlExisting(urlString: string): boolean {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return false;
  }

  try {
    const checkStmt = mainDb.prepare(`
      SELECT 1 
      FROM articles 
      WHERE linkurl = ? 
      LIMIT 1
    `);

    const row = checkStmt.get(urlString);

    console.log('>===>> Checking URL existence:', urlString, ' - Found:', row );

    return row !== undefined; // true if found, false otherwise
  } catch (err) {
    console.error('Error checking URL existence:', err);
    return false;
  }
}

/* 250811
 * Checks if a URL slug already exists in the 'articles' table.
 * @param {string} urlSlug - The URL slug to check for existence.
 * @returns {boolean} - Returns true if the URL slug exists, false otherwise.
 */
export function isSlugExisting(urlSlug: string): boolean {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return false;
  }

  try {
    const checkStmt = mainDb.prepare(`
      SELECT 1 
      FROM articles 
      WHERE linkurl LIKE ? 
      LIMIT 1
    `);

    // Add wildcards to search for the substring anywhere in linkurl
    const searchPattern = `%${urlSlug}%`;

    const row = checkStmt.get(searchPattern);

    console.log(
      '>===>> Checking partial URL slug existence:',
      urlSlug,
      ' - Found:',
      row
    );

    return row !== undefined; // true if found, false otherwise
  } catch (err) {
    console.error('Error checking URL slug existence:', err);
    return false;
  }
}

// 250813
/**
 * Retrieves a post by its URL slug from the 'articles' table.
 * @param {string} urlSlug - The URL slug to search for.
 * @returns {PostData | null} - Returns the post data if found, or null if not found.
 */
export function getPostBySlug(urlSlug: string): PostData | null {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return null;
  }

  console.log('>===>> "getPostBySlug" -> Fetching post by slug:', urlSlug);
  try {
    const stmt = mainDb.prepare(`
      SELECT
        listname,
        pubauthorslug,
        0 AS counter,          -- placeholder, not stored in DB
        hostname,
        timestamp,
        pubname,
        authorname,
        title,
        linkurl AS link,
        imageurl AS image,
        date,
        likes,
        comments,
        content
      FROM articles
      WHERE linkurl LIKE ?
      LIMIT 1
    `);

    const searchPattern = `%${urlSlug}%`;
    const row = stmt.get(searchPattern);
    console.log('>===>> "getPostBySlug" -> Post Fetched by slug:', JSON.stringify(row, null, 2 ));
    if (!row) {
      return null;
    }

    // Ensure it matches PostData type
    return row as PostData;
  } catch (err) {
    console.error('Error fetching post by slug:', err);
    return null;
  }
}






 /*
 * Inserts an array of articles into the 'articles' table.
 * @param {PostData[]} posts - Array of articles to insert.
 * @returns {number} - The number of successfully inserted articles.
 */
export function insertArticlesFromJson(posts: PostData[]): number {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return 0;
  }

  console.log('>===>> Inserting articles from JSON array:', posts.length);

  const insertSQL = `
    INSERT INTO articles (
      listname,
      hostname,
      timestamp,
      pubauthorslug,
      pubname,
      authorname,
      title,
      linkurl,
      content,
      imageurl,
      date,
      likes,
      comments
    ) VALUES (
      @listname,
      @hostname,
      COALESCE(@timestamp, datetime('now', 'localtime')),
      @pubauthorslug,
      @pubname,
      @authorname,
      @title,
      @link,
      @content,
      @image,
      @date,
      COALESCE(@likes, 0),
      COALESCE(@comments, 0)
    )
  `;

  const insertStmt = mainDb.prepare(insertSQL);
  let insertedCount = 0;

  const insertMany = mainDb.transaction((articles: PostData[]) => {
    for (const a of articles) {

      console.log('>===>> Inserting article:',JSON.stringify(a, null, 2));

      for (const [key, value] of Object.entries(a)) {
        if (
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'bigint' &&
          !Buffer.isBuffer(value)
        ) {
          console.error(`>===>> Invalid type for field ${key}:`, value, typeof value);
        }
      }

      const info = insertStmt.run({
        listname: String(a.listname ?? ''),
        hostname: String(a.hostname ?? ''),
        timestamp: a.timestamp ? String(a.timestamp) : null,
        pubauthorslug: String(a.pubauthorslug ?? ''),
        pubname: String(a.pubname ?? ''),
        authorname: String(a.authorname ?? ''),
        title: String(a.title ?? ''),
        link: String(a.link ?? ''),
        content: String(a.content ?? ''),
        image: String(a.image ?? ''),
        date: a.date ? String(a.date) : '',
        likes: Number.isFinite(a.likes) ? a.likes : 0,
        comments: Number.isFinite(a.comments) ? a.comments : 0,
      });

      if (info.changes === 1) {
        insertedCount++;
      }
    }
  });

  try {
    insertMany(posts);
    return insertedCount;
  } catch (err: any) {
    console.error('Error inserting articles:', err);
    return 0;
  }
}







/**
 * 250819
 * Returns all categories for a given parent_id.
 * - If parentId is a number → returns subcategories.
 * - If parentId is null     → returns top-level categories.
 * - If no parameter is provided, it returns all categories (all rows)
 * 
 * Usage examples:
 * getCategoriesByParentId();       // → all categories
 * getCategoriesByParentId(null);   // → only top-level categories
 * getCategoriesByParentId(2);      // → children of category with id = 2
 * 
 */
export function getCategoriesByParentId(parentId?: number | null): Category[] {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: Category[];

    if (parentId === undefined) {
      // No param → return ALL categories
      const stmt = mainDb.prepare<[], Category>(`
        SELECT id, name, description, parent_id
        FROM categories
        ORDER BY name
      `);
      rows = stmt.all();
    } else if (parentId === null) {
      // Explicit null → only top categories
      const stmt = mainDb.prepare<[], Category>(`
        SELECT id, name, description, parent_id
        FROM categories
        WHERE parent_id IS NULL
        ORDER BY name
      `);
      rows = stmt.all();
    } else {
      // A number → fetch children
      const stmt = mainDb.prepare<{ parentId: number }, Category>(`
        SELECT id, name, description, parent_id
        FROM categories
        WHERE parent_id = @parentId
        ORDER BY name
      `);
      rows = stmt.all({ parentId });
    }

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description ?? "", // normalize null → empty string
      parent_id: r.parent_id,
    }));
  } catch (err) {
    console.error('Error fetching categories:', err);
    return [];
  }
}





/**
 * 250819
 * Returns the subcategories tree for a given category id.
 * - If the id exists: returns the root node with its full nested subCategoryNode tree.
 * - If the id does not exist: returns null.
 */
export function getSubcategoryTree(rootId: number): CategoryNode | null {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return null;
  }

  try {
    const stmt = mainDb.prepare<{ rootId: number }, CategoryRow>(`
      WITH RECURSIVE subcats AS (
        SELECT id, name, description, parent_id
        FROM categories
        WHERE id = @rootId
        UNION ALL
        SELECT c.id, c.name, c.description, c.parent_id
        FROM categories c
        JOIN subcats sc ON c.parent_id = sc.id
      )
      SELECT id, name, description, parent_id
      FROM subcats
      ORDER BY parent_id IS NULL DESC, parent_id, name
    `);

    const rows = stmt.all({ rootId });
    if (rows.length === 0) return null; // root not found

    // Build node map
    const map = new Map<number, CategoryNode>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        parent_id: r.parent_id,
        subCategoryNode: [],
      });
    }

    // Link children → parents; capture root
    let root: CategoryNode | null = null;
    for (const r of rows) {
      const node = map.get(r.id)!;
      if (r.id === rootId) root = node;
      if (r.parent_id !== null) {
        const parent = map.get(r.parent_id);
        if (parent) parent.subCategoryNode.push(node);
      }
    }

    return root;
  } catch (err) {
    console.error('Error building subcategory tree:', err);
    return null;
  }
}




/**
 * 250819
 * Builds a forest (array of root CategoryNode) for all categories whose parent_id equals `parentId`.
 * - parentId === null  -> roots are top-level categories (parent_id IS NULL)
 * - parentId is number -> roots are the direct children of that parent
 */
export function getSubcategoryForest(parentId: number | null): CategoryNode[] {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: CategoryRow[];

    if (parentId === null) {
      // No parameters → use a stmt type with empty params tuple
      const stmt = mainDb.prepare<[], CategoryRow>(`
        WITH RECURSIVE roots AS (
          SELECT id FROM categories WHERE parent_id IS NULL
        ),
        forest AS (
          SELECT c.id, c.name, c.description, c.parent_id
          FROM categories c
          WHERE c.id IN (SELECT id FROM roots)
          UNION ALL
          SELECT c2.id, c2.name, c2.description, c2.parent_id
          FROM categories c2
          JOIN forest f ON c2.parent_id = f.id
        )
        SELECT id, name, description, parent_id
        FROM forest
        ORDER BY parent_id IS NULL DESC, parent_id, name
      `);
      rows = stmt.all(); // ✅ no args
    } else {
      // Has parameter → stmt typed with { parentId: number }
      const stmt = mainDb.prepare<{ parentId: number }, CategoryRow>(`
        WITH RECURSIVE roots AS (
          SELECT id FROM categories WHERE parent_id = @parentId
        ),
        forest AS (
          SELECT c.id, c.name, c.description, c.parent_id
          FROM categories c
          WHERE c.id IN (SELECT id FROM roots)
          UNION ALL
          SELECT c2.id, c2.name, c2.description, c2.parent_id
          FROM categories c2
          JOIN forest f ON c2.parent_id = f.id
        )
        SELECT id, name, description, parent_id
        FROM forest
        ORDER BY parent_id IS NULL DESC, parent_id, name
      `);
      rows = stmt.all({ parentId }); // ✅ with arg
    }

    // Build nodes
    const nodeMap = new Map<number, CategoryNode>();
    for (const r of rows) {
      nodeMap.set(r.id, {
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        parent_id: r.parent_id,
        subCategoryNode: [],
      });
    }

    // Link children to parents
    for (const r of rows) {
      if (r.parent_id !== null) {
        const p = nodeMap.get(r.parent_id);
        const c = nodeMap.get(r.id);
        if (p && c) p.subCategoryNode.push(c);
      }
    }

    // Collect forest roots for the requested parentId
    const roots: CategoryNode[] = [];
    for (const node of nodeMap.values()) {
      if ((parentId === null && node.parent_id === null) ||
          (typeof parentId === 'number' && node.parent_id === parentId)) {
        roots.push(node);
      }
    }

    return roots;
  } catch (err) {
    console.error('Error building subcategory forest:', err);
    return [];
  }
}