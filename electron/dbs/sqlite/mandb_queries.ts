// electron/dbs/sqlite/maindb_queries.ts

import { PostData, Category, CategoryNode, CategoryRow, ImageRow } from '../../../shared/projectObjects/varObjects';
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
 * 
 *  + + + + + 
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
    // field 'ranking' added on 250820
    const stmt = mainDb.prepare(`
      SELECT
        id,
        listname,
        pubauthorslug,
        hostname,
        timestamp,
        pubname,
        authorname,
        authorlink,
        title,
        linkurl AS link,
        imageurl AS image,
        date,
        likes,
        comments,
        content, 
        ranking
      FROM articles
      WHERE linkurl LIKE ?
      LIMIT 1
    `);

    const searchPattern = `%${urlSlug}%`;
    const row = stmt.get(searchPattern) as PostData | undefined;
    console.log('>===>> "getPostBySlug" -> Post' + "'" + ' s Title Fetched by slug:', row?.title );
    // console.log('>===>> "getPostBySlug" -> Post Fetched by slug:', JSON.stringify(row, null, 2 ));
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
      authorlink,
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
      @authorlink,
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
        authorlink: String(a.authorlink ?? ''),
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
 * 250827
 * Updates the content of an article by its ID.
 * @param id 
 * @returns 
 */
export function updateArticleContentById(id: number, newContent: string): boolean {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return false;
  }

  try {
    const stmt = mainDb.prepare(`
      UPDATE articles
      SET content = @content
      WHERE id = @id
    `);
    const result = stmt.run({ id, content: newContent });
    console.log('>===>> "updateArticleContentById" -> Update Result:', result);
    return result.changes === 1;
  } catch (err) {
    console.error('Error updating article content:', err);
    return false;
  }
}


/**
 * 250827
 * Updates the content of an article by its ID.
 * @param id 
 * @returns 
 */
export function updateArticleById(post: PostData): boolean {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return false;
  }
  // Guard: need a valid numeric id
  if (post == null || typeof (post as any).id !== 'number' || !Number.isInteger((post as any).id)) {
    console.error('>===>> updateArticleById: invalid post.id:', post && (post as any).id);
    return false;
  }

  try {
    const stmt = mainDb.prepare(`
      UPDATE articles
      SET
        listname     = @listname,
        pubauthorslug= @pubauthorslug,
        hostname     = @hostname,
        timestamp    = CURRENT_TIMESTAMP,  -- always update to current time
        pubname      = @pubname,
        authorname   = @authorname,
        authorlink   = @authorlink,
        title        = @title,
        linkurl      = @link,     -- NOTE: param @link maps to column linkurl
        content      = @content,
        imageurl     = @image,    -- NOTE: param @image maps to column imageurl
        date         = @date,
        likes        = @likes,
        content      = @content,
        comments     = @comments
      WHERE id = @id
    `);

    const info = stmt.run({
      id: (post as any).id,
      listname:        post.listname ?? '',
      pubauthorslug:   post.pubauthorslug ?? '',
      hostname:        post.hostname ?? '',
      timestamp:       post.timestamp ?? null,    // keep existing default logic if you prefer
      pubname:         post.pubname ?? '',
      authorname:      post.authorname ?? '',
      authorlink:      post.authorlink ?? '',
      title:           post.title ?? '',
      link:            post.link ?? '',           // maps to linkurl
      content:         post.content ?? '',
      image:           post.image ?? '',          // maps to imageurl
      date:            post.date ?? '',
      likes:           typeof post.likes === 'number' ? post.likes : 0,
      comments:        typeof post.comments === 'number' ? post.comments : 0,
    });

    console.log('>= *** ==>> "updateArticleById" -> Update Result:', info);
    return info.changes === 1; // true if exactly one row updated
  } catch (err) {
    console.error('Error updating article:', err);
    return false;
  }
}





/**
 * 250821
 * Returns an array that contains either just 1 article with the specific id or all articles
 * If no id parameter is provided, it returns all articles (all rows)
 * 
 */
export function getArticleById(id?: number): PostData[] {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: PostData[] = [];
        if (id === undefined) {
      // No id param → return ALL Articles
      const stmt = mainDb.prepare<[], PostData>(`
      SELECT
        id,
        listname,
        pubauthorslug,         
        hostname,
        timestamp,
        pubname,
        authorname,
        authorlink,
        title,
        linkurl AS link,
        imageurl AS image,
        date,
        likes,
        comments,
        content, 
        ranking
      FROM articles
      ORDER BY title
      `);
      rows = stmt.all();
     
    } else {
      // id is a number → fetch just an article with this id
      const stmt = mainDb.prepare<{ id: number }, PostData>(`
      SELECT
        id,
        listname,
        pubauthorslug,         
        hostname,
        timestamp,
        pubname,
        authorname,
        authorlink,
        title,
        linkurl AS link,
        imageurl AS image,
        date,
        likes,
        comments,
        content, 
        ranking
      FROM articles
      WHERE id = @id
      ORDER BY title
      `);
      rows = stmt.all({ id });
    }
    return rows.flat();
  } catch (err) {
    console.error('Error fetching categories:', err);
    return [];
  }
}

/**
 * 250821
 * Returns an array of all articles that have NO category assigned (no entry in the article-categories join table).
 * LEFT JOIN ensures all articles are included.
 * If no match is found in article_categories, then ac.article_id will be NULL.
 * The WHERE ac.article_id IS NULL filters to those without matches.
 * 
 * 
 */
export function getUncategorizedArticles(): PostData[] {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: PostData[] = [];
    const stmt = mainDb.prepare(`
      SELECT 
        a.id,
        a.listname,
        a.pubauthorslug,         
        a.hostname,
        a.timestamp,
        a.pubname,
        a.authorname,
        a.authorlink,
        a.title,
        a.linkurl AS link,
        a.imageurl AS image,
        a.date,
        a.likes,
        a.comments,
        a.content, 
        a.ranking
      FROM articles a
      LEFT JOIN article_categories ac ON a.id = ac.article_id
      WHERE ac.article_id IS NULL
    `);
    rows = stmt.all() as PostData[];
    return rows;
  } catch (err) {
    console.error('Error fetching uncategorized Articles:', err);
    return [];
  }
}

/**
 * 250904 
 * @returns Returns an array of all articles
 */
export function getAllArticles(): PostData[] {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: PostData[] = [];
    const stmt = mainDb.prepare<PostData[]>(`
      SELECT
        id,
        listname,
        pubauthorslug,
        hostname,
        timestamp,
        pubname,
        authorname,
        authorlink,
        title,
        linkurl AS link,
        imageurl AS image,
        date,
        likes,
        comments,
        content,
        ranking
      FROM articles
    `);
    rows = stmt.all() as PostData[];
    return rows;
  } catch (err) {
    console.error('Error fetching all articles:', err);
    return [];
  }
}

/**
 * 250903
 * @param category_id 
 * @returns Returns an array of all articles in the specified category
 */
export async function getArticlesByCategoryId(category_id: number): Promise<PostData[]> {
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return [];
  }

  try {
    let rows: PostData[] = [];
    const stmt = mainDb.prepare<{ category_id: number } >(`
      SELECT
        a.id,
        a.listname,
        a.pubauthorslug,
        a.hostname,
        a.timestamp,
        a.pubname,
        a.authorname,
        a.authorlink,
        a.title,
        a.linkurl AS link,
        a.imageurl AS image,
        a.date,
        a.likes,
        a.comments,
        a.content,
        a.ranking
      FROM articles a
      JOIN article_categories ac ON a.id = ac.article_id
      WHERE ac.category_id = @category_id
      ORDER BY a.title
    `);
    rows = stmt.all({ category_id }) as PostData[];
    return rows;
  } catch (err) {
    console.error('Error fetching articles by category_id:', err);
    return [];
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
 * Builds a *** forest *** (array of root CategoryNode) for all categories whose parent_id equals `parentId`.
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






/**
 * 250824
 ** 'Upsert' function for 'images' table
 * Insert (or find) an image row; dedupe per article by (article_id, sha256_hex)
 * If a matching row is found, it will be returned instead of inserting a new one.
 * If no matching row is found, a new row will be inserted.
 * If the insert is ignored due to a conflict, the existing row will be returned.
 * If the operation fails for any other reason, an error will be thrown.
 * If the operation is successful, the newly inserted or found row will be returned.
 * 
 */
export function upsertImageRecord(params: {
  article_id: number;
  orgArticleUrl: string | null;
  orgImgUrl: string;
  mime_type: string;
  imgBlob: Buffer;
  byte_length: number;
  sha256_hex: string;
  file_name: string | null;
  orderIndx?: number | null;
  alt_text?: string | null;
  imgWidth?: number | null;
  imgHeight?: number | null;
}): { inserted: boolean; imageId: number } {
  if (!mainDb) throw new Error('No Main DB connection');

  console.log('>= *** ==>> upsertImageRecord Started ...');

  const insert = mainDb.prepare(`
    INSERT INTO images (
      article_id, orgArticleUrl, orgImgUrl, mime_type,
      imgBlob, byte_length, sha256_hex, file_name,
      orderIndx, alt_text, imgWidth, imgHeight
    ) VALUES (
      @article_id, @orgArticleUrl, @orgImgUrl, @mime_type,
      @imgBlob, @byte_length, @sha256_hex, @file_name,
      @orderIndx, @alt_text, @imgWidth, @imgHeight
    )
    ON CONFLICT(article_id, sha256_hex) DO NOTHING
  `);

  const info = insert.run({
    article_id: params.article_id,
    orgArticleUrl: params.orgArticleUrl,
    orgImgUrl: params.orgImgUrl,
    mime_type: params.mime_type,
    imgBlob: params.imgBlob,
    byte_length: params.byte_length,
    sha256_hex: params.sha256_hex,
    file_name: params.file_name,
    orderIndx: params.orderIndx ?? null,
    alt_text: params.alt_text ?? '',
    imgWidth: params.imgWidth ?? null,
    imgHeight: params.imgHeight ?? null,
  });

  if (info.changes === 1) {
    return { inserted: true, imageId: Number(info.lastInsertRowid) };
  }

  const row = mainDb.prepare(`
    SELECT id FROM images
    WHERE article_id = ? AND sha256_hex = ?
    LIMIT 1
  `).get(params.article_id, params.sha256_hex) as { id: number } | undefined;

  if (!row) throw new Error('Insert ignored but existing row not found');

  console.log('>= *** ==>> upsertImageRecord: ', row.id, ' - ', params.orgImgUrl, ' - ', params.mime_type, ' - ', params.byte_length);
  return { inserted: false, imageId: row.id };
}








/**
 * 250825
 ** Load an image blob by DB id.
 * Returns null if not found.
 * Also indicates if this is an "aborted-too-large" placeholder
 * (imgBlob is empty and alt_text starts with [ABORTED_TOO_LARGE:...]).
 */
export function getImageBlobById(
  imageId: number
): {
  mime_type: string;
  imgBlob: Buffer;
  isAbortedTooLarge: boolean;
  byte_length: number;
} | null {
  
  console.log('>===>> getImageBlobById: Fetching image with id:', imageId);
  if (!mainDb) {
    console.error('>===>> No Main DB connection.');
    return null;
  }

  // --- SQLite query (prepared once per call) ---
  // You can copy-paste this SQL into any SQLite client:
  // SELECT mime_type, imgBlob, alt_text, byte_length
  // FROM images
  // WHERE id = ? LIMIT 1;
  const stmt = mainDb.prepare<number[], ImageRow>(`
    SELECT mime_type, imgBlob, alt_text, byte_length
    FROM images
    WHERE id = ?
    LIMIT 1
  `);

  const row = stmt.get(imageId);

  // console.log('>===>> getImageBlobById: Fetched image row:', JSON.stringify(row));

  if (!row) return null;

  const blob = row.imgBlob ?? Buffer.alloc(0);
  const isAborted =
    blob.length === 0 && (row.alt_text ?? '').startsWith('[ABORTED_TOO_LARGE');

  return {
    mime_type: row.mime_type,
    imgBlob: blob,
    isAbortedTooLarge: isAborted,
    byte_length: typeof row.byte_length === 'number' ? row.byte_length : blob.length,
  };
}


// 250902
// Insert a row in article_categories table
export function insertArticleCategory(params: {
  article_id: number;
  category_id: number;
}): boolean {
  if (!mainDb) throw new Error('No Main DB connection');

  const insert = mainDb.prepare(`
    INSERT INTO article_categories (article_id, category_id)
    VALUES (?, ?)
  `);
  const info = insert.run(params.article_id, params.category_id);
  return info.changes === 1;

}

// 250902
// Assign multiple categories for a given article id into article_categories table
export function insertArticleCategories(params: {
  article_id: number;
  category_ids: number[];
}): boolean {
  if (!mainDb) throw new Error('No Main DB connection');

  console.log('>===>> Trying to insert article categories with parameters:', params);

  const insert = mainDb.prepare(`
    INSERT INTO article_categories (article_id, category_id)
    VALUES (?, ?)
  `);

  for (const category_id of params.category_ids) {
    insert.run(params.article_id, category_id);
  }

  console.log('>===>> Article categories inserted successfully:', { article_id: params.article_id, category_ids: params.category_ids });

  return true;
}





// 250902
// Delete a row from article_categories table
export function deleteArticleCategory(params: {
  article_id: number;
  category_id: number;
}): boolean {
  if (!mainDb) throw new Error('No Main DB connection');

  const del = mainDb.prepare(`
    DELETE FROM article_categories
    WHERE article_id = ? AND category_id = ?
  `);
  const info = del.run(params.article_id, params.category_id);
  return info.changes === 1;
}


// 250902
// Remove (delete) all articles for a given category id
export function deleteArticlesByCategoryId(category_id: number): boolean {
  if (!mainDb) throw new Error('No Main DB connection');

  const del = mainDb.prepare(`
    DELETE FROM article_categories
    WHERE category_id = ?
  `);
  const info = del.run(category_id);
  return info.changes > 0;
}
