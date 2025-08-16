// electron/context-copy-selected-images.ts

// This is a helper file, and its main functionality is to export the key function attachCopiedImages().

import { clipboard, ipcMain, NativeImage, nativeImage } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

type WriteClipboardPayload = {
  html?: string;
  text?: string;
  imageDataUrl?: string; // optional: write an image as well
};

const FETCH_CH = 'ctx-fetch-as-dataurl';
const WRITE_CH = 'ctx-write-clipboard';
const MAX_REDIRECTS = 5;


// MIME inference — guessMimeFromPath(p: string): string
// - Picks a MIME type by file extension (png, jpg, gif, webp, svg, bmp). 
// - Falls back to application/octet-stream.
function guessMimeFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

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

// Network fetch with redirects — fetchBuffer(urlStr, redirectCount=0)
// - Uses http/https modules.
// - Handles 3xx redirects (up to MAX_REDIRECTS).
// - Rejects on non-2xx status.
// - Concats response chunks → returns { buffer, contentType }.
function fetchBuffer(
  urlStr: string,
  redirectCount = 0
): Promise<{ buffer: Buffer; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;

    const req = mod.get(u, (res) => {
      // handle redirects
      const status = res.statusCode || 0;
      const loc = res.headers.location;
      if (status >= 300 && status < 400 && loc) {
        if (redirectCount >= MAX_REDIRECTS)
          return reject(new Error('Too many redirects'));
        const next = new URL(loc, urlStr).href;
        res.resume(); // drain
        return resolve(fetchBuffer(next, redirectCount + 1));
      }

      if (status < 200 || status >= 400) {
        return reject(new Error(`HTTP ${status} for ${urlStr}`));
      }

      const chunks: Buffer[] = [];
      res.on('data', (c) =>
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
      );
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const ctHeader = Array.isArray(res.headers['content-type'])
          ? res.headers['content-type'][0]
          : res.headers['content-type'];
        resolve({ buffer, contentType: ctHeader });
      });
    });

    req.on('error', reject);
  });
}



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

  ipcMain.handle(FETCH_CH, async (_e, absUrl: string) => {
    if (typeof absUrl !== 'string' || !absUrl)
      throw new Error('absUrl must be a non-empty string');

    // Already a data URL → return as-is
    if (absUrl.startsWith('data:')) return absUrl;

    const u = new URL(absUrl);

    if (u.protocol === 'file:') {
      const filePath = decodeURIComponent(u.pathname);
      const buf = await fs.promises.readFile(filePath);
      const mime = guessMimeFromPath(filePath);
      return dataUrlFromBuffer(buf, mime);
    }

    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const { buffer, contentType } = await fetchBuffer(absUrl);
      const mime = contentType?.split(';')[0] || guessMimeFromPath(u.pathname);
      return dataUrlFromBuffer(buffer, mime);
    }

    throw new Error(`Unsupported protocol: ${u.protocol}`);
  });

  ipcMain.handle(WRITE_CH, async (_e, payload: WriteClipboardPayload) => {
    const { html = '', text = '', imageDataUrl } = payload || {};

    // Write HTML & plain text flavors
    clipboard.write({ html, text });

    // Optionally also write an image flavor (many apps prefer HTML+image for pasting)
    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
      try {
        const img = parseDataUrlToNativeImage(imageDataUrl);
        if (!img.isEmpty()) clipboard.writeImage(img);
      } catch {
        // ignore if data URL was not an image or failed to parse
      }
    }

    return true;
  });

  // disposer
  return () => {
    ipcMain.removeHandler(FETCH_CH);
    ipcMain.removeHandler(WRITE_CH);
  };
}
