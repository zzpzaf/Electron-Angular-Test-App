// electron/dbs/sqlite/maindb_queries.ts

import { PostData } from '../../../shared/projectObjects/varObjects';
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
    return row !== undefined; // true if found, false otherwise
  } catch (err) {
    console.error('Error checking URL existence:', err);
    return false;
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
