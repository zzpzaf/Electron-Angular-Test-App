// electron/context-copy-selected-images.ts
// Updated on 250830




import { clipboard, ipcMain, NativeImage, nativeImage } from 'electron';
// import * as http from 'http';
// import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { getImageBlobById } from '../dbs/sqlite/mandb_queries';
import { fileURLToPath } from 'url';

type WriteClipboardPayload = {
  html?: string;
  text?: string;
  imageDataUrl?: string; // optional: write an image as well
};

// The type returned by getImageBlobById() 
type DbImageResult = {
  mime_type: string;          // e.g. "image/png"
  imgBlob: Buffer;            // raw bytes
  isAbortedTooLarge: boolean; // your DB layer signaled an abort due to size
  byte_length: number;        // size in bytes
} | null;

interface NormalizeDbImageOptions {
  /** If true (default), throw when isAbortedTooLarge is set. */
  failIfTooLarge?: boolean;
  /** Optional explicit ceiling; if result.byte_length exceeds this, throw. */
  maxBytes?: number;
}

const FETCH_CH = 'ctx-fetch-as-dataurl';
const WRITE_CH = 'ctx-write-clipboard';
const MAX_REDIRECTS = 5;


const extToMime: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.bmp':  'image/bmp',
  '.ico':  'image/x-icon',
};


// MIME inference — guessMimeFromPath(p: string): string
// - Picks a MIME type by file extension (png, jpg, gif, webp, svg, bmp). 
// - Falls back to application/octet-stream.
// function guessMimeFromPath(p: string): string {
//   // const ext = path.extname(p).toLowerCase();
//   // if (ext === '.png') return 'image/png';
//   // if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
//   // if (ext === '.gif') return 'image/gif';
//   // if (ext === '.webp') return 'image/webp';
//   // if (ext === '.svg') return 'image/svg+xml';
//   // if (ext === '.bmp') return 'image/bmp';
//   // return 'application/octet-stream';
//   const ext = path.extname(new URL(p).pathname).toLowerCase();
//   return extToMime[ext] || 'application/octet-stream';
// }

// Make a data URL — dataUrlFromBuffer(buf, mime)
// Returns data:${mime};base64,${base64}; used after downloads/reads.
function dataUrlFromBuffer(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Parse image data: URL to NativeImage — parseDataUrlToNativeImage(dataUrl)
// - Validates data: URL shape and ensures it’s an image/ MIME.
// - Supports base64 or URL-encoded payload.
// - Builds a NativeImage via nativeImage.createFromBuffer() and errors if empty.
function parseDataUrlToNativeImage(dataUrl: string): NativeImage {
  const m = /^data:([^;,]+)?;(base64)?,(.*)$/i.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL for image');
  const mime = (m[1] || '').toLowerCase();
  if (!mime.startsWith('image/'))
    throw new Error(`Not an image data URL: ${mime}`);
  const isBase64 = (m[2] || '').toLowerCase() === 'base64';
  const payload = m[3] || '';
  const buf = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty())
    throw new Error('Failed to create native image from data URL');
  return img;
}

// // Network fetch with redirects — fetchBuffer(urlStr, redirectCount=0)
// // - Uses http/https modules.
// // - Handles 3xx redirects (up to MAX_REDIRECTS).
// // - Rejects on non-2xx status.
// // - Concats response chunks → returns { buffer, contentType }.
// function fetchBuffer(
//   urlStr: string,
//   redirectCount = 0
// ): Promise<{ buffer: Buffer; contentType?: string }> {
//   return new Promise((resolve, reject) => {
//     const u = new URL(urlStr);
//     const mod = u.protocol === 'https:' ? https : http;

//     const req = mod.get(u, (res) => {
//       // handle redirects
//       const status = res.statusCode || 0;
//       const loc = res.headers.location;
//       if (status >= 300 && status < 400 && loc) {
//         if (redirectCount >= MAX_REDIRECTS)
//           return reject(new Error('Too many redirects'));
//         const next = new URL(loc, urlStr).href;
//         res.resume(); // drain
//         return resolve(fetchBuffer(next, redirectCount + 1));
//       }

//       if (status < 200 || status >= 400) {
//         return reject(new Error(`HTTP ${status} for ${urlStr}`));
//       }

//       const chunks: Buffer[] = [];
//       res.on('data', (c) =>
//         chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
//       );
//       res.on('end', () => {
//         const buffer = Buffer.concat(chunks);
//         const ctHeader = Array.isArray(res.headers['content-type'])
//           ? res.headers['content-type'][0]
//           : res.headers['content-type'];
//         resolve({ buffer, contentType: ctHeader });
//       });
//     });

//     req.on('error', reject);
//   });
// }



/**
* The key function of the file
* Registers two IPC handlers and returns a disposer that removes them:
* - ctx-fetch-as-dataurl — fetches any http(s):// or file:// resource (or accept data: as-is) and return a data: URL.
* - ctx-write-clipboard — writes HTML, plain text, and optionally an image to the system clipboard.
*
* Returns a disposer that removes both handlers.
*/
export function attachCopiedImages() {
  // Avoid duplicate handlers during hot-reload
  ipcMain.removeHandler(FETCH_CH);
  ipcMain.removeHandler(WRITE_CH);



  // ========================================================================================
  // 1) ctx-fetch-as-dataurl (FETCH_CH) — now supports db:// via getImageBlobById() function
  // ========================================================================================

  ipcMain.handle(FETCH_CH, async (_e, inputUrl: string) => {
    if (!inputUrl || typeof inputUrl !== 'string') {
      throw new Error('Invalid URL');
    }

    // data: → passthrough
    if (inputUrl.startsWith('data:')) {
      return inputUrl;
    }

    const u = new URL(inputUrl);

    // file:// → read and convert
    if (u.protocol === 'file:') {
      const fsPath = fileURLToPath(u); // robust across platforms
      const buf = await fs.promises.readFile(fsPath);
      const mime = guessMimeFromPathLike(fsPath);
      return bufferToDataURL(buf, mime);
    }

    // http(s):// → (keep your existing fetch/undici or net.fetch logic here)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const res = await fetch(inputUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      const ab = await res.arrayBuffer();
      const mime = res.headers.get('content-type')?.split(';')[0] || guessMimeFromPathLike(u.pathname);
      return bufferToDataURL(Buffer.from(ab), mime);
    }

    // db://image/<id> → call DB directly (no fetch/net)
    if (u.protocol === 'db:') {
      
      console.log(`>= *** ==>> Protocol: ${u.protocol}`);
      const { kind, id } = parseDbUrl(inputUrl);

      console.log(`>= *** ==>> Fetching DB image ${u.protocol} with ID: ${id}`);
    

      // Optionally coerce to number if your impl expects numeric IDs:
      const numId = Number(id); // and validate Number.isFinite(numId)

      // ✅ Direct DB read via your existing function
      const dbResult = await getImageBlobById(numId);
      // console.log('>= *** ==>> DB image:', dbResult, typeof dbResult, dbResult ? (Buffer.isBuffer(dbResult) ? 'Buffer' : (dbResult instanceof Blob ? 'Blob' : 'Object')) : '(null or undefined)');
      const { buffer, mime } = await normalizeDbImage(dbResult);

      // If your DB layer doesn't know MIME, you can do a light guess here
      // based on the id or any metadata you have (not shown). Otherwise:
      const finalMime = mime || 'application/octet-stream';
      return bufferToDataURL(buffer, finalMime);
    }

    throw new Error(`Unsupported protocol: ${u.protocol}`);
  });

    // if (u.protocol === 'http:' || u.protocol === 'https:') {
    //   const { buffer, contentType } = await fetchBuffer(absUrl);
    //   const mime = contentType?.split(';')[0] || guessMimeFromPath(u.pathname);
    //   return dataUrlFromBuffer(buffer, mime);
    // }

    // if (u.protocol === 'file:') {
    //   const filePath = decodeURIComponent(u.pathname);
    //   const buf = await fs.promises.readFile(filePath);
    //   const mime = guessMimeFromPath(filePath);
    //   return dataUrlFromBuffer(buf, mime);
    // }

      // throw new Error(`Unsupported protocol: ${u.protocol}`);
  



  // =========================================================================
  // 2) ctx-write-clipboard (WRITE_CH) — unchanged, but supports image DataURL
  //    write HTML, plain text, and optionally an image
  // ==========================================================================

  ipcMain.handle(WRITE_CH, async (_e, payload: WriteClipboardPayload) => {

    const { html = '', text = '', imageDataUrl } = payload || {};

    if (typeof html !== 'string' || typeof text !== 'string') {
      throw new Error('Invalid payload - html and text must be strings');
    }

    // If an image Data URL is provided, convert it to a nativeImage
    // also write an image flavor (many apps prefer HTML+image for pasting)
    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
      try {
        const img = parseDataUrlToNativeImage(imageDataUrl);
        if (!img.isEmpty()) clipboard.writeImage(img);
      } catch {
        // ignore if data URL was not an image or failed to parse
      }
    }

    // Write HTML & plain text flavors
    clipboard.write({ html, text });

    return true;
  });



  // Return disposer to remove both handlers
  return () => {
    ipcMain.removeHandler(FETCH_CH);
    ipcMain.removeHandler(WRITE_CH);
  };


}



// async function responseToDataURL(res: Response) {
//   if (!res.ok) {
//     throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
//   }
//   const mime = res.headers.get('content-type') || 'application/octet-stream';
//   const arrayBuf = await res.arrayBuffer();
//   return bufferToDataURL(Buffer.from(arrayBuf), mime);
// }


// function bufferToDataURL(buf: Buffer, mime = 'application/octet-stream') {
//   const b64 = buf.toString('base64');
//   return `data:${mime};base64,${b64}`;
// }
function bufferToDataURL(buf: Buffer, mime = 'application/octet-stream') {
  return `data:${mime};base64,${buf.toString('base64')}`;
}


function guessMimeFromPathLike(p: string) {
  const ext = path.extname(p).toLowerCase();
  return extToMime[ext] || 'application/octet-stream';
}




/**
 * Parse a db:// URL. Expects paths like db://image/<id> (optionally with query).
 * Returns { kind: 'image', id: '2' } for db://image/2
 */
function parseDbUrl(dbUrl: string): { kind: 'image'; id: string } {
  const u = new URL(dbUrl);
  // u.pathname starts with '/'
  const segs = u.pathname.split('/').filter(Boolean); // removes empty segments
  
  console.log('>= *** ==>> parseDbUrl Pathname: ', u.pathname);
  console.log('>= *** ==>> parseDbUrl segments:', segs.length, " - ", segs);

  const kind = 'image'; // segs[0];
  const id = segs[0];

  if (u.protocol !== 'db:') throw new Error(`Not a db:// URL: ${dbUrl}`);
  if (kind !== 'image') throw new Error(`Unsupported db resource: ${kind || '(none)'}`);
  if (!id) throw new Error(`Missing image id in ${dbUrl}`);
  return { kind: 'image', id };
}


/**
 * Normalizes whatever getImageBlobById returns into { buffer, mime }.
 * Throws with clear messages for: not found (null), aborted-too-large, or exceeding maxBytes.
 * Supports:
 *   - Buffer
 *   - Blob (from undici/global fetch)
 *   - { buffer: Buffer, contentType?: string } or { data: Buffer, mime?: string }
 *   - { blob: Blob, contentType?: string }
 */
export function normalizeDbImage(
  result: DbImageResult,
  opts: NormalizeDbImageOptions = {}
): { buffer: Buffer; mime: string } {
  const { failIfTooLarge = true, maxBytes } = opts;

  // Not found
  if (result == null) {
    throw new Error('DB image not found (getImageBlobById returned null).');
  }

  // Structural sanity checks
  if (!Buffer.isBuffer(result.imgBlob)) {
    throw new Error('Invalid DB image payload: imgBlob is not a Buffer.');
  }

  const mime = (result.mime_type && String(result.mime_type).trim()) || 'application/octet-stream';
  const size = typeof result.byte_length === 'number' ? result.byte_length : result.imgBlob.byteLength;

  // Your DB layer flagged the fetch as aborted due to size
  if (result.isAbortedTooLarge && failIfTooLarge) {
    throw new Error(
      `DB image fetch aborted: image too large (reported ${size} bytes).`
    );
  }

  // Independent explicit size ceiling
  if (typeof maxBytes === 'number' && size > maxBytes) {
    throw new Error(
      `DB image exceeds allowed size: ${size} bytes > ${maxBytes} bytes.`
    );
  }

  return { buffer: result.imgBlob, mime };
}
