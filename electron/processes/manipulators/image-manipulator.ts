// electron/dbs/sqlite/image-manipulator.ts
import got from 'got';
import crypto from 'crypto';
import { getMainConnection } from '../../dbs/sqlite/connections';
import { ExtractedImage, ImageDownloadResult, ProcessMarkdownResult, RewriteResultItem } from '../../../shared/projectObjects/varObjects';
import { upsertImageRecord } from '../../dbs/sqlite/mandb_queries';

const mainDb = getMainConnection();





// --------------------------------------------------------------------------------------------------------------
// Helper function to extract the file name from a URL or Content-Disposition header
function extractFileName(urlStr: string, contentDisposition?: string): string | null {
  if (contentDisposition) {
    const m1 = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(contentDisposition);
    const m2 = /filename="([^"]+)"/i.exec(contentDisposition);
    const raw = (m1?.[1] ?? m2?.[1])?.trim();
    if (raw) {
      try { return decodeURIComponent(raw.replace(/["']/g, '')); } catch { return raw; }
    }
  }
  try {
    const u = new URL(urlStr);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ?? null;
  } catch { return null; }
}





// --------------------------------------------------------------------------------------------------------------
/**
 ** Streamed-download of a single image with a hard byte limit.
 * If the limit is exceeded, abort and insert a placeholder row (empty blob)
 * tagged in alt_text and with a deterministic pseudo-hash.
 * It inserts a placeholder row (empty blob) tagged in alt_text.
 */
export async function downloadAndStoreImageStreamed(params: {
  article_id: number;
  orgArticleUrl: string;
  orgImgUrl: string;
  maxBytes?: number;       // default 10MB
  orderIndx?: number | null;
  alt_text?: string | null;
}): Promise<ImageDownloadResult> {
  const { article_id, orgArticleUrl, orgImgUrl } = params;
  const maxBytes = params.maxBytes ?? 10 * 1024 * 1024;
  
  console.log('>= *** ==>> downloadAndStoreImageStreamed - Starting for URL:', orgImgUrl, ' with maxBytes:', maxBytes);

  const stream = got.stream(orgImgUrl, {
    timeout: { request: 15000 },
    followRedirect: true,
    maxRedirects: 5,
    retry: { limit: 2 },
    headers: { 'user-agent': 'App/1.0 (+https://www.example.com)' },
  });

  let mime = 'application/octet-stream';
  let file_name: string | null = null;

  stream.once('response', (res) => {
    const ct = String(res.headers['content-type'] ?? '');
    if (ct) mime = ct;
    file_name = extractFileName(orgImgUrl, res.headers['content-disposition'] as string | undefined);
  });

  const chunks: Buffer[] = [];
  let total = 0;
  let aborted = false;


  console.log('>= *** ==>> downloadAndStoreImageStreamed - Starting trying ....');
  try {
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          stream.destroy(new Error(`Byte limit exceeded: ${total} > ${maxBytes}`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    if (aborted) {
      // Placeholder row (empty blob) + deterministic pseudo-hash
      const pseudoHash = crypto
        .createHash('sha256')
        .update(`${orgImgUrl}|too-large|max=${maxBytes}`)
        .digest('hex');

      console.log('>= *** ==>> downloadAndStoreImageStreamed - ABORTED (too large) - calling upsertImageRecord for pseudoHash');  
      const save = upsertImageRecord({
        article_id,
        orgArticleUrl,
        orgImgUrl,
        mime_type: mime,
        imgBlob: Buffer.alloc(0),
        byte_length: total,
        sha256_hex: pseudoHash,
        file_name: file_name ?? `aborted-${pseudoHash.slice(0, 8)}`,
        orderIndx: params.orderIndx ?? null,
        alt_text: `[ABORTED_TOO_LARGE:${maxBytes}]`,
        imgWidth: null,
        imgHeight: null,
      });

      return { success: false, aborted: true, reason: 'too_large', imageId: save.imageId };
    }

    // Completed within limit
    const buffer = chunks.length ? Buffer.concat(chunks, total) : Buffer.alloc(0);
    if (!mime.startsWith('image/')) {
      return { success: false, reason: `not_an_image:${mime}` };
    }

    console.log('>= *** ==>> downloadAndStoreImageStreamed - calling upsertImageRecord for sha256');
    const sha256_hex = crypto.createHash('sha256').update(buffer).digest('hex');
    const save = upsertImageRecord({
      article_id,
      orgArticleUrl,
      orgImgUrl,
      mime_type: mime,
      imgBlob: buffer,
      byte_length: buffer.length,
      sha256_hex,
      file_name: file_name ?? `image-${sha256_hex.slice(0, 8)}`,
      orderIndx: params.orderIndx ?? null,
      alt_text: params.alt_text ?? '',
      imgWidth: null,
      imgHeight: null,
    });

    console.log('>= *** ==>> downloadAndStoreImageStreamed: ', save.imageId, ' - ', 
      save.inserted ? 'INSERTED' : 'EXISTS', ' - ', orgImgUrl, ' - ', mime, ' - ', buffer.length);

    return {
      success: true,
      inserted: save.inserted,
      imageId: save.imageId,
      mime_type: mime,
      byte_length: buffer.length,
      sha256_hex,
      file_name: file_name ?? undefined,
    };
  } catch (err: any) {
    return { success: false, reason: err?.message ?? String(err) };
  }
}



// --------------------------------------------------------------------------------------------------------------
/**
* wrapper: Downloads and stores images for a specific article.
*
* @param article_id - The ID of the article.
* @param orgArticleUrl - The original article URL.
* @param orgImgUrls - An array of original image URLs.
* @param opts - Optional settings for the download process.
* @returns An array of results for each image URL.
* Example:
* const results = await downloadAndStoreImagesStreamedForArticle(
*   articleId,
*   articleUrl,
*   orderedUrls,                 // in markdown order
*   { maxBytes: 10 * 1024 * 1024, setOrder: true, startOrder: 0 }
* );
*/
export async function downloadAndStoreImagesStreamedForArticle( 
  article_id: number,
  orgArticleUrl: string,
  orgImgUrls: string[],
  opts?: { maxBytes?: number; setOrder?: boolean; startOrder?: number }
): Promise<Array<{ orgImgUrl: string; orderIndx?: number } & ImageDownloadResult>> {
  const setOrder = !!opts?.setOrder;
  const maxBytes = opts?.maxBytes;
  let order = opts?.startOrder ?? 0;

  const out: Array<{ orgImgUrl: string; orderIndx?: number } & ImageDownloadResult> = [];

  console.log('='.repeat(90));
  console.log('>= *** ==>> downloadAndStoreImagesStreamedForArticle - Calling downloadAndStoreImageStreamed() for article_id:', article_id);
  console.log('='.repeat(90));
  // Sequential (simpler & polite to servers)
  for (const url of orgImgUrls) {
    const res = await downloadAndStoreImageStreamed({
      article_id,
      orgArticleUrl,
      orgImgUrl: url,
      maxBytes,
      orderIndx: setOrder ? order : null,
    });
    out.push({ orgImgUrl: url, orderIndx: setOrder ? order : undefined, ...res });
    if (setOrder) order++;
  }

  console.log('>= *** ==>> downloadAndStoreImagesStreamedForArticle Results:', out);
  return out;

}


// --------------------------------------------------------------------------------------------------------------
/**
 * Extract image URLs from Markdown, in reading order.
 * Supports:
 *  - HTML <img src="...">
 *  - Inline images:        ![alt](url "title")
 *  - Reference images:     ![alt][id] + [id]: url "title"
 */
export function extractFromMarkdownArrayImageUrls(
  markContent: string
): Array<{ orderIndx: number; imgUrl: string }> {
  if (!markContent) return [];

  const results: string[] = [];

  // 1) Collect reference definitions: [id]: url "title"
  //    Example: [logo]: https://site/logo.png "Logo"
  const refDefRe =
    /^[ \t]*\[(?<id>[^\]]+)\]:[ \t]*<?(?<url>\S+?)>?(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^\)]*\)))?[ \t]*$/gim;
  const refMap = new Map<string, string>();
  for (const m of markContent.matchAll(refDefRe)) {
    const id = (m.groups?.id ?? '').trim().toLowerCase();
    const url = (m.groups?.url ?? '').trim();
    if (id && url) refMap.set(id, url);
  }

  // 2) Inline images: ![alt](url "title")
  //    Capture the URL between the parentheses; allow <angle-bracket> URLs per MD spec
  const inlineImgRe =
    /!\[[^\]]*\]\(\s*<?([^)\s>]+)[^)]*?>?\s*(?:"[^"]*"|'[^']*'|\([^\)]*\))?\s*\)/g;
  for (const m of markContent.matchAll(inlineImgRe)) {
    const url = (m[1] ?? '').trim();
    if (url) results.push(url);
  }

  // 3) Reference images: ![alt][id]
  //    The id can be empty (shortcut): ![alt][]  => uses "alt" as id
  const refImgRe = /!\[(?<alt>[^\]]*)\]\[(?<id>[^\]]*)\]/g;
  for (const m of markContent.matchAll(refImgRe)) {
    const idRaw = (m.groups?.id ?? '').trim();
    const altRaw = (m.groups?.alt ?? '').trim();
    const id = (idRaw || altRaw).toLowerCase();
    const url = refMap.get(id);
    if (url) results.push(url);
  }

  // 4) Basic HTML <img src="..."> (not exhaustive)
  const htmlImgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const m of markContent.matchAll(htmlImgRe)) {
    const url = (m[1] ?? '').trim();
    if (url) results.push(url);
  }

  // Post-process: filter duplicates if you want only first occurrence

  const uniqueOrdered = results.map((imgUrl, orderIndx) => ({ orderIndx, imgUrl }));
  console.log('>= *** ==>> Unique Ordered Image URLs:', uniqueOrdered);
  // return results.map((imgUrl, orderIndx) => ({ orderIndx, imgUrl }));
  return uniqueOrdered;
}





// --------------------------------------------------------------------------------------------------------------
/**
 ** Wrapper: Process (extracts and stores) Markdown images for a specific article.
 *  1. extracts image URLs from the markdown (in order) - extractFromMarkdownArrayImageUrls()
 *  2. streams, size-limits, and stores each image - downloadAndStoreImagesStreamedForArticle()
 *  and returns both the extracted list and the per-URL results.
 * 
 */
export async function processMarkdownImagesForArticle(
  article_id: number,
  orgArticleUrl: string,
  markContent: string,
  opts?: { maxBytes?: number; setOrder?: boolean; startOrder?: number }
): Promise<
  // [
    // extracted: Array<{ orderIndx: number; imgUrl: string }>;
    // results: Array<{ orgImgUrl: string; orderIndx?: number } & ImageDownloadResult>;
  // ]  
   ProcessMarkdownResult
   > {

  console.log('='.repeat(90));
  console.log('>= *** ==>> processMarkdownImagesForArticle - Calling extractFromMarkdownArrayImageUrls()' );
  console.log('='.repeat(90));
  
  // 1) Extract image URLs from markdown, in reading order
  const extracted = extractFromMarkdownArrayImageUrls(markContent);

  // Short-circuit if nothing to do
  if (extracted.length === 0) {
    return { extracted, results: [] };
  }

  // 2) Build the ordered URL list for downloader
  const orderedUrls = extracted.map(e => e.imgUrl);

  console.log('>= *** ==>> processMarkdownImagesForArticle - Calling downloadAndStoreImagesStreamedForArticle()');
  // 3) Download & store (by default we DO set order since we control the sequence here)
  const results = await downloadAndStoreImagesStreamedForArticle(
    article_id,
    orgArticleUrl,
    orderedUrls,
    {
      maxBytes: opts?.maxBytes,
      setOrder: opts?.setOrder ?? true,   // default true here because the order is known
      startOrder: opts?.startOrder ?? 0,
    }
  );

  console.log('>= *** ==>> processMarkdownImagesForArticle Results :', results);
  return { extracted, results };
}






/**
 ** Rewrite markdown image links using the given per-image results (from the Db).
 * Order-sensitive: it replaces matches in the same sequence as your extractor:
 *  1) inline markdown images,
 *  2) reference-style usages,
 *  3) HTML <img src="...">.
 * 
 * If a result has no imageId (e.g. failed without DB row), the original match is left unchanged.
 */
export function rewriteMarkdownImagesWithDbLinks(
  markContent: string,
  // results: Array<{ orgImgUrl: string; orderIndx?: number } & ImageDownloadResult>
  results: RewriteResultItem[]
): string {


  if (!markContent || !Array.isArray(results) || results.length === 0) {
    return markContent;
  }

  // We consume results sequentially to stay aligned with how URLs were extracted.
  let cursor = 0;

  // Pop the next result that has an imageId; if missing imageId, we still advance the cursor
  // but return undefined so the original link stays as-is.
  const takeNextDbUrl = (): string | undefined => {
    if (cursor >= results.length) return undefined;
    const r = results[cursor++];
    return typeof r.imageId === 'number' ? `db://image/${r.imageId}` : undefined;
  };

  let updated = markContent;

  // 1) Inline images: ![alt](url "title")
  // Capture:  1=alt   2=url   3=opt title (including quotes/paren)
  const inlineImgRe =
    /!\[([^\]]*)\]\(\s*<?([^)\s>]+)[^)]*?>?\s*(?:(\"[^\"]*\"|'[^']*'|\([^\)]*\))\s*)?\)/g;
  updated = updated.replace(inlineImgRe, (m, alt: string, _url: string, titlePart?: string) => {
    const dbUrl = takeNextDbUrl();
    if (!dbUrl) return m; // keep original if no imageId
    const title = titlePart ? ` ${titlePart.trim()}` : '';
    return `![${alt}](${dbUrl}${title})`;
  });

  // 2) Reference-style image *usages*: ![alt][id]  (we rewrite usage to inline)
  // Capture: 1=alt  2=id
  const refImgUseRe = /!\[([^\]]*)\]\[([^\]]*)\]/g;
  updated = updated.replace(refImgUseRe, (m, alt: string) => {
    const dbUrl = takeNextDbUrl();
    if (!dbUrl) return m;
    return `![${alt}](${dbUrl})`;
  });

  // 3) HTML <img src="..."> — replace src attribute only
  const htmlImgRe = /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi;
  updated = updated.replace(htmlImgRe, (m, preAttrs: string, quote: string, _src: string, postAttrs: string) => {
    const dbUrl = takeNextDbUrl();
    if (!dbUrl) return m;
    return `<img${preAttrs}src=${quote}${dbUrl}${quote}${postAttrs}>`;
  });

  return updated;
}
