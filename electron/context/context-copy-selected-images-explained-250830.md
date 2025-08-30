# The `context-copy-selected-images.ts` Module

250830

In General:
It adds two IPC utilities to help the renderer **fetch images as data URLs** and **write rich clipboard content** (HTML + text + images The two IPC utilities, let the **renderer process** interact with images and the system clipboard in a safe way via **IPC channels**.  

It centralizes:

1. Fetching images from various URL schemes (`http://`, `https://`, `file://`, `db://`, and `data:`).  
2. Normalizing them into **data URLs** (so they can be used in `<img src="...">`, pasted into HTML editors, etc.).  
3. Writing rich content to the system clipboard (HTML, plain text, optional image).

---

## Exported API

### `attachCopiedImages()`
Main entrypoint.  
When called, it:

* Registers two IPC handlers:
  * `ctx-fetch-as-dataurl`
  * `ctx-write-clipboard`
* Returns a **disposer function** that removes both handlers.

This makes it easy to set up during app startup and clean up on shutdown or hot reload.

---

## Constants

* `FETCH_CH = 'ctx-fetch-as-dataurl'`  
  The IPC channel for fetching a URL and getting back a `data:` URL.

* `WRITE_CH = 'ctx-write-clipboard'`  
  The IPC channel for writing to the system clipboard.

* `MAX_REDIRECTS = 5`  
  Limits redirect chains for HTTP(S) requests.

* `WriteClipboardPayload`  
  Shape of payload the renderer can send when writing to clipboard:
  ```ts
  {
    html?: string;
    text?: string;
    imageDataUrl?: string;
  }
  ```

---

## Helper Functions

### 1. `guessMimeFromPath(p: string): string`
Infers the MIME type of a file from its extension.  
Supports `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`.  
Falls back to `application/octet-stream`.

**Why?**  
Ensures that when a file is read, we know how to embed it correctly into a `data:` URL.

---

### 2. `dataUrlFromBuffer(buf: Buffer, mime: string): string`
Converts raw bytes into a base64-encoded `data:` URL:

```
data:${mime};base64,<base64-data>
```

**Why?**  
Makes arbitrary binary image data embeddable in HTML/clipboard content.

---

### 3. `parseDataUrlToNativeImage(dataUrl: string): NativeImage`
Parses a `data:` URL, validates it’s an `image/*`, extracts the payload, and constructs an Electron `NativeImage`.

Supports:
- Base64 payloads
- URL-encoded payloads

Throws an error if invalid or empty.

**Why?**  
Clipboard images must be passed as `NativeImage`.  
This function bridges between the text form (`data:` URL) and the native object.

---

### 4. `fetchBuffer(urlStr: string, redirectCount = 0)`
Fetches data over the network using Node’s `http`/`https` modules.  

* Follows redirects up to `MAX_REDIRECTS`.  
* Rejects on non-2xx status codes.  
* Resolves with `{ buffer, contentType }`.

**Why?**  
Node’s native `fetch` may not be available in older contexts.  
This function ensures robust handling of redirects and raw binary downloads.

---

### 5. `parseDbUrl(dbUrl: string)`
Parses a custom `db://` URL.  

Example:  
`db://image/42` → `{ kind: 'image', id: '42' }`

Validates:
- Must be `db:` protocol.
- First path segment must be `"image"`.
- Second segment is the ID.

**Why?**  
Keeps DB URLs predictable and explicit, so IPC only allows `db://image/<id>`.

---

### 6. `normalizeDbImage(result)`
Normalizes the return of `getImageBlobById()`, which is:

```ts
{
  mime_type: string;
  imgBlob: Buffer;
  isAbortedTooLarge: boolean;
  byte_length: number;
} | null
```

Rules:
* Throws if `null` (image not found).
* Throws if `isAbortedTooLarge === true`.
* Uses `mime_type` if provided, else defaults to `application/octet-stream`.
* Returns `{ buffer, mime }`.

**Why?**  
Provides a safe, consistent shape for DB-fetched images before turning them into `data:` URLs.

---

## IPC Handlers

### A) `ctx-fetch-as-dataurl`
Given a URL string, returns a `data:` URL.

1. **If it’s already `data:`**  
   → Return unchanged.

2. **If `file://`**  
   → Read file from disk, guess MIME, convert to `data:`.

3. **If `http://` or `https://`**  
   → Fetch using `fetchBuffer`, determine MIME, convert to `data:`.

4. **If `db://image/<id>`**  
   → Parse ID with `parseDbUrl`.  
   → Fetch bytes with `getImageBlobById(id)`.  
   → Normalize with `normalizeDbImage`.  
   → Convert to `data:`.

5. **Else**  
   → Throw “Unsupported protocol”.

---

### B) `ctx-write-clipboard`
Writes multiple “flavors” to system clipboard:

* **HTML** — the `html` field, or empty string.  
* **Plain text** — the `text` field, or empty string.  
* **Image (optional)** — if `imageDataUrl` is provided and valid:
  * Parse into a `NativeImage` with `parseDataUrlToNativeImage`.
  * Write to clipboard.

Returns `true` if successful.

**Why multiple flavors?**  
Different target apps consume different clipboard types (some want HTML, others plain text, others image).  
By writing all at once, paste works more seamlessly.

---

## Lifecycle: `attachCopiedImages()`

When invoked:

1. Removes any existing handlers (prevents duplicates in hot-reload).  
2. Registers both `FETCH_CH` and `WRITE_CH` handlers.  
3. Returns a disposer function:
   ```ts
   () => {
     ipcMain.removeHandler('ctx-fetch-as-dataurl');
     ipcMain.removeHandler('ctx-write-clipboard');
   }
   ```

Use disposer on app shutdown or reload to cleanly detach.

---

## Typical Renderer Usage

```ts
// Fetch a DB image as a data URL
const dataUrl = await window.electronAPI.invoke('ctx-fetch-as-dataurl', 'db://image/42');

// Use it in an <img> element
document.querySelector('#preview').src = dataUrl;

// Copy HTML + text + image to clipboard
await window.electronAPI.invoke('ctx-write-clipboard', {
  html: `<p><img src="${dataUrl}"></p>`,
  text: 'db://image/42',   // fallback plain text
  imageDataUrl: dataUrl    // real image flavor
});
```

---

## Error Handling & Edge Cases

* **Redirect loops** (HTTP): stopped at 5 hops.  
* **Non-2xx HTTP**: rejected.  
* **DB fetch**:
  * Throws if not found.
  * Throws if aborted due to size.  
* **Invalid `data:` URL**: ignored for image flavor.  
* **Unsupported protocols**: throw early.  
* **MIME resolution**:
  * DB-provided `mime_type` preferred.
  * HTTP `Content-Type` used if available.
  * File extension fallback otherwise.
