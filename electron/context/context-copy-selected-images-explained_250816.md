The **'context-copy-selected-images.ts'** file.

250815

In General:
It adds two IPC utilities to help the renderer **fetch images as data URLs** and **write rich clipboard content** (HTML + text + optional image) from the main process.

# What it exports

* **`attachCopiedImages()`** → Registers two IPC handlers and returns a **disposer** that removes them:

  * `ctx-fetch-as-dataurl` — fetch any `http(s)://` or `file://` resource (or accept `data:` as-is) and return a **`data:` URL**.
  * `ctx-write-clipboard` — write **HTML**, **plain text**, and **optionally an image** to the system clipboard.

# Constants & types

* `FETCH_CH = 'ctx-fetch-as-dataurl'`, `WRITE_CH = 'ctx-write-clipboard'`.
* `MAX_REDIRECTS = 5` to avoid infinite redirect loops.
* `WriteClipboardPayload` `{ html?: string; text?: string; imageDataUrl?: string }`.

# Helper functions (core logic)

1. **MIME inference** — `guessMimeFromPath(p: string): string`
   Picks a MIME type by file extension (png, jpg, gif, webp, svg, bmp). Falls back to `application/octet-stream`.

2. **Make a data URL** — `dataUrlFromBuffer(buf, mime)`
   Returns `data:${mime};base64,${base64}`; used after downloads/reads.

3. **Parse image `data:` URL to `NativeImage`** — `parseDataUrlToNativeImage(dataUrl)`

   * Validates `data:` URL shape and ensures it’s an **image/** MIME.
   * Supports **base64** or **URL-encoded** payload.
   * Builds a `NativeImage` via `nativeImage.createFromBuffer()` and errors if empty.

4. **Network fetch with redirects** — `fetchBuffer(urlStr, redirectCount=0)`

   * Uses `http`/`https` modules.
   * Handles **3xx redirects** (up to `MAX_REDIRECTS`).
   * Rejects on non-2xx status.
   * Concats response chunks → returns `{ buffer, contentType }`.

# The IPC handlers (registered by `attachCopiedImages`)

### A) `ctx-fetch-as-dataurl`

```ts
ipcMain.handle(FETCH_CH, async (_e, absUrl: string) => {
  if (!absUrl) throw new Error('absUrl must be a non-empty string');

  // 1) Already data: → return unchanged
  if (absUrl.startsWith('data:')) return absUrl;

  const u = new URL(absUrl);

  // 2) file:// → read file, guess MIME, return data:
  if (u.protocol === 'file:') {
    const filePath = decodeURIComponent(u.pathname);
    const buf = await fs.promises.readFile(filePath);
    const mime = guessMimeFromPath(filePath);
    return dataUrlFromBuffer(buf, mime);
  }

  // 3) http(s):// → fetch bytes, use content-type (or guess), return data:
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    const { buffer, contentType } = await fetchBuffer(absUrl);
    const mime = contentType?.split(';')[0] || guessMimeFromPath(u.pathname);
    return dataUrlFromBuffer(buffer, mime);
  }

  throw new Error(`Unsupported protocol: ${u.protocol}`);
});
```

**Result:** The renderer can give a URL, and get back a **data URL** usable in `<img src="...">` or as an image payload elsewhere.

### B) `ctx-write-clipboard`

```ts
ipcMain.handle(WRITE_CH, async (_e, payload: WriteClipboardPayload) => {
  const { html = '', text = '', imageDataUrl } = payload || {};
  clipboard.write({ html, text });               // write HTML + plain text flavors

  // optionally include an image flavor
  if (imageDataUrl?.startsWith('data:')) {
    try {
      const img = parseDataUrlToNativeImage(imageDataUrl);
      if (!img.isEmpty()) clipboard.writeImage(img);
    } catch { /* ignore invalid data URLs */ }
  }
  return true;
});
```

**Why HTML + text + image?** Many apps prefer multiple clipboard “flavors” so paste works nicely in different targets (rich editors, plain inputs, image-aware apps).

# Registration / disposal

* When `attachCopiedImages()` is called:

  * It **removes any existing handlers** (helps during hot-reload), then registers both.
  * Returns a **cleanup function** that calls:

    ```ts
    ipcMain.removeHandler('ctx-fetch-as-dataurl');
    ipcMain.removeHandler('ctx-write-clipboard');
    ```

  Use this disposer during app shutdown or when reloading modules.

# Typical renderer usage (example)

```ts
// Fetch an image URL as a data URL
const dataUrl = await window.electronAPI.invoke('ctx-fetch-as-dataurl', imageUrl);

// Copy HTML + text + (optionally) image
await window.electronAPI.invoke('ctx-write-clipboard', {
  html: `<p><img src="${dataUrl}"></p>`,
  text: imageUrl,               // fallback plain text
  imageDataUrl: dataUrl         // also add real image flavor
});
```

# Error handling & edge cases

* **Redirect loops**: blocked at 5 hops.
* **Non-2xx HTTP**: rejected with `HTTP <code>`.
* **Unsupported protocols**: throws (`ftp:`, `blob:`, etc.).
* **Invalid data URL** or non-image data\*\*:\*\* safely ignored for the image flavor.
* **MIME detection**: prefers `Content-Type` header; falls back to extension.

# Why this design?

* Keeps **network IO** and **clipboard** access in the **main process** (safer, more reliable).
* Provides renderer a simple IPC API to:

  1. Normalize arbitrary image sources into **data URLs** (cacheable, embeddable).
  2. Push **multi-flavor** clipboard content for best paste UX across apps.

If you’d like, I can sketch a minimal **renderer helper** (TypeScript) that wraps these two IPC calls for convenient reuse across your UI.
