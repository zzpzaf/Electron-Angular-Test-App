electron/protocols/db-protocol.md

250828

# The db-protocol.ts

```js
// electron/protocols/db-protocol.ts


// import type { ProtocolRequest, ProtocolResponse } from 'electron';
import { getImageBlobById } from '../dbs/sqlite/mandb_queries';


/**
 * Creates a handler for Electron's registerBufferProtocol('db', handler).
 * Supports: db://image/<id>
 *
 * Example URLs:
 *   db://image/101
 *   db://image/42?cache=bust  (query is ignored)
 */
export function createDbProtocolHandlerFetch() {
  // Handler for protocol.handle('db', handler)
  return async (request: Request): Promise<Response> => {
    try {
      console.log('>===>> [db protocol] request.url:', request.url);
      // request.url example: db://image/101
      const url = new URL(request.url);
      console.log('>===>> [db protocol] request.url pathname:', url.pathname);
      const parts = url.pathname.split('/').filter(Boolean); // ["image","101"]

      // if (parts.length !== 2 || parts[0] !== 'image') {
      //   console.log('>===>> [db protocol] request.url:', request.url, ' - parts nr: ', parts.length);
      //   return new Response('', { status: 404 });
      // }
      if (parts.length !== 1 ) {
        console.log('>===>> [db protocol] request.url:', request.url, ' - parts nr: ', parts.length);
        return new Response('', { status: 404 });
      }
      
      
      // const id = Number(parts[1]);
      const id = Number(parts[0]);
      if (!Number.isInteger(id) || id < 1) {
        return new Response('', { status: 400 });
      }

      // *** Fetch the image blob from the database ***
      const row = getImageBlobById(id);
      if (!row || !row.imgBlob) {
        console.log('>===>> getImageBlobById: No image found for id:', id);
        return new Response('', { status: 404 });
      }

    // Convert Buffer -> Uint8Array view (using the exact window)
    const body = new Uint8Array(
    row.imgBlob.buffer as ArrayBuffer,     // cast away the SharedArrayBuffer union
    row.imgBlob.byteOffset,
    row.imgBlob.byteLength
    );
    return new Response(body, {
    status: 200,
    headers: { 'Content-Type': row.mime_type }
    });
      
    } catch (err) {
      console.error('[db protocol] handler error:', err);
      return new Response('', { status: 500 });
    }
  };
}


```


### Purpose

Creates a **fetch-style protocol handler** for Electron’s custom scheme **`db://`** so your app can load images stored in the database via URLs like:

* `db://image/101`
* `db://image/42?cache=bust` (query is ignored)

You register it (in the main process) with:

```ts
import { protocol } from 'electron';
protocol.handle('db', createDbProtocolHandlerFetch());
```

### How it works (step by step)

1. **Returns an async handler `(request: Request) => Promise<Response>`**
   This is the function Electron will call whenever something tries to fetch a `db://…` URL.

2. **Parse and validate the URL**

   * Builds a `URL` from `request.url`.
   * For `db://image/101`, the URL parts are:

     * `protocol`: `db:`
     * `hostname`: `image`
     * `pathname`: `/101` → split → `["101"]`
   * The code expects **exactly one path segment** (the numeric ID). If not, it returns **404**.

3. **Extract and validate the ID**

   * Converts that segment to a number (`id`).
   * If it’s not a positive integer, returns **400**.

4. **Read the image blob from the DB**

   * Calls `getImageBlobById(id)` (your own DB accessor).
   * If no row or no `imgBlob`, returns **404**.

5. **Stream the bytes back as a Response**

   * Creates a **zero-copy** `Uint8Array` view over the Node `Buffer`:

     ```ts
     const body = new Uint8Array(
       row.imgBlob.buffer as ArrayBuffer,
       row.imgBlob.byteOffset,
       row.imgBlob.byteLength
     );
     ```
   * Returns a `Response(body, { status: 200, headers: { 'Content-Type': row.mime_type } })`.

6. **Errors**

   * Any unexpected error logs to console and returns **500**.

### Notable details

* **Hostname-as-namespace**: With `db://image/101`, the host (`image`) serves as a namespace; the handler currently **ignores it** and uses only the path (`/101`). (Earlier code expected `["image","101"]` from the path; it was corrected to account for URL parsing rules.)
* **Query strings** are ignored (but harmless for cache-busting).
* **Content-Type** is taken from the DB (`row.mime_type`) so `<img src="db://…">` renders correctly.
* **Sequential design**: well-suited for serving images that were previously stored via your download pipeline and referenced in Markdown as `db://image/{id}` after rewrite.


---
---
---



## Register the scheme as privileged 

```
// ==========================================================================
// Register the scheme as privileged (top of main.ts, before app.whenReady()) 
// ==========================================================================
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'db',
    privileges: {
      standard: true,        // enables URL parsing like http(s)
      secure: true,          // treated as secure
      supportFetchAPI: true, // allows fetch/XHR
      stream: true,          // enables streaming bodies
      corsEnabled: false     // often fine to keep false for app-internal
    }
  }
]);
```


This snippet tells Electron that your custom protocol (db://) should be treated like a “real” web protocol (e.g., https://) — with security, fetch support, and streaming capabilities.
Without this, Electron would treat db:// as a dumb file-like scheme, and features like fetch("db://…") or <img src="db://…"> wouldn’t work properly.

📌 How it works

protocol.registerSchemesAsPrivileged() must be called before app.whenReady(), because it defines how Electron will treat the scheme during app initialization.

Here’s what each privileges flag does:

- standard: true
Makes db:// behave like a standard URL scheme (http, https).
It gets a host part (db://image/101).
Supports relative paths, origin isolation, etc.
Without this, Electron won’t parse it properly in new URL().

- secure: true
Tells Electron to treat it like HTTPS:
Considered a secure origin (same-site cookies, CSP, mixed-content rules).
Avoids security warnings if you embed resources (<img src="db://…">).

- supportFetchAPI: true
Allows usage with the modern APIs:
``` 
await fetch("db://image/101"); 
```
and XHR. Without this, fetch requests would throw.

- stream: true
Enables streaming responses.
Required if your handler returns a ReadableStream or Response(body) with streaming.
Perfect for serving large blobs from the DB without buffering everything.

- corsEnabled: false
Disables CORS restrictions (Cross-Origin Resource Sharing).
Since this scheme is internal-only, you usually don’t need CORS headaches.
If set to true, browser-like CORS checks apply.

📌 Why it’s needed in your case

You’re implementing a custom db:// protocol that fetches images stored in SQLite and serves them into the renderer as if they were normal web images.
With this setup:
- <img src="db://image/101"> just works ✅
- fetch("db://image/101") returns a Response with your blob ✅
- Your scheme is isolated and secure, but still powerful like https ✅

✅ In short:
This declaration registers db:// as a privileged, secure, standard-like protocol in Electron, so you can use it seamlessly in the renderer (fetch, images, XHR, streams) without hacks or security warnings.

Then we can register in our main.ts file like this:
```js
. . .
  // Register the 'db' protocol buffer BEFORE loading any BrowserWindow content using db://
  const handler = createDbProtocolHandlerFetch();
  protocol.handle('db', handler);
. . .  
```

---

Here’s the request flow for `<img src="db://image/101">` in your Electron app:
```
Renderer (HTML/CSS/JS)
   │   <img src="db://image/101">
   ▼
Chromium URL loader sees custom scheme "db"
   │   (allowed because registerSchemesAsPrivileged(...))
   ▼
Electron protocol router
   │   protocol.handle('db', createDbProtocolHandlerFetch())
   ▼
Your db handler (fetch-style)
   │   parse URL → id=101
   │   validate → positive integer?
   │   getImageBlobById(101)  // read from SQLite `images` table
   │   build Response:
   │     body = Uint8Array(view of Buffer)
   │     headers['Content-Type'] = row.mime_type
   ▼
Response(body, headers) returned to Chromium
   │
   ├─► success (200): image decoded & rendered in the <img>
   ├─► not found (404): broken image icon
   ├─► bad request (400): invalid id
   └─► error (500): handler exception

```

---
---
---

## The `getImageBlobById()` function
(Resides in the `electron/dbs/sqlite/maindb_queries.ts` file)

```js
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
```



### The function fetches a single image from the **`images`** table in the Main SQLite DB by its numeric `id`, returning:

* the image’s **MIME type**,
* the **binary blob** (`Buffer`) of the image,
* whether the record is an **“aborted-too-large” placeholder** (i.e., the blob was intentionally not stored because it exceeded a size limit),
* the **byte length** of the stored image (or 0 for placeholders).

If the DB isn’t available or the row doesn’t exist, it returns `null`.

### How it works (step by step)

1. **Log & validate connection**

   * Logs the requested `imageId`.
   * If `mainDb` is not connected, logs an error and returns `null`.

2. **Prepare and execute parameterized SQL**

   ```sql
   SELECT mime_type, imgBlob, alt_text, byte_length
   FROM images
   WHERE id = ?
   LIMIT 1
   ```

   * Uses a prepared statement (via `better-sqlite3`) with the `imageId` bound to `?`.
   * Parameterization avoids SQL injection and is efficient.

3. **Handle no-result case**

   * If no row is returned, the function returns `null`.

4. **Normalize blob & detect “too large” placeholders**

   * Ensures `imgBlob` is a `Buffer` (falls back to an empty buffer if null).
   * Sets `isAbortedTooLarge` when **both**:

     * the blob length is `0`, **and**
     * `alt_text` starts with `"[ABORTED_TOO_LARGE"`.
   * This convention flags images that were skipped during download due to size constraints.

5. **Return shape**

   ```ts
   {
     mime_type: row.mime_type,                 // e.g. "image/png"
     imgBlob: blob,                            // Buffer (possibly empty)
     isAbortedTooLarge: isAborted,             // boolean
     byte_length: row.byte_length ?? blob.length
   }
   ```

   * `byte_length` prefers the DB’s `byte_length` column if numeric; otherwise it uses `blob.length`.

### Notes & edge cases

* **Performance:** The statement is prepared each call; if this is hot, you could cache the prepared statement.
* **Placeholders:** The `[ABORTED_TOO_LARGE…]` marker is a project convention—useful for your `db://` protocol handler to decide how to respond (e.g., 404 vs. a special placeholder).
* **Consumers:** This return shape is ideal for serving binary responses (e.g., your `db://image/{id}` handler sets `Content-Type` to `mime_type` and streams `imgBlob`).


---
---
---


## Allowing  our custom `db:` database-backed image link 

In the render() key-function of our `Markshow` Service (/src/app/shared/services/`markshow.ts` file), we define the following regex: 
```ts
 . . .
      // 250828 - It's 'must' to allow the custom 'db' protocol in URLs 
      // e.g.:  <img src="db://image/1" alt=""> (and common ones)
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data|db):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
  . . .      
```
‘ALLOWED_URI_REGEXP’ regex expression is used to whitelist ‘db://’ URLs (and other safe schemes) so our ‘db://’ custom database-backed image links are not stripped out by DOMPurify (marked library). This is necessary because, by default, DOMPurify blocks unknown URI schemes to prevent JavaScript injection (javascript:alert(1)).

This regex tells DOMPurify which URI schemes are safe:
-	http: and https: (normal web URLs)
-	mailto: (email links)
-	tel: (phone links)
-	data: (inline base64 images, like data:image/png;base64,...)
-	db: ← our custom Electron protocol for serving images from the database (db://image/123).




### The render function:

```ts
. . .
  render(md: string): SafeHtml {
    const html = marked.parse(md, { async: false }) as string;
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: [
        'src',
        'href',
        'title',
        'width',
        'height',
        'allow',
        'allowfullscreen',
        'frameborder',
        'loading',
        'referrerpolicy',
      ],
      // 250828 - It's 'must' to allow the custom 'db' protocol in URLs 
      // e.g.:  <img src="db://image/1" alt=""> (and common ones)
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data|db):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i,
    });
    // return this.sanitizer.bypassSecurityTrustHtml(clean);
    const retText: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(clean);
    return retText;
  }
. . .
```


This `render` function is the key-renering function of our `Markshow` Service (/src/app/shared/services/`markshow.ts` file), which is part of our Markdown rendering pipeline with **sanitization and custom protocol support**. 

---

### What the function does

1. **Convert Markdown → HTML**

   ```ts
   const html = marked.parse(md, { async: false }) as string;
   ```

   * Uses the `marked` library to parse the raw Markdown string (`md`) into HTML.
   * For example:
     `![alt](http://example.com/img.png)` → `<img src="http://example.com/img.png" alt="alt">`

2. **Sanitize the HTML with DOMPurify**

   ```ts
   const clean = DOMPurify.sanitize(html, { ... });
   ```

   * Prevents **XSS (cross-site scripting) attacks** by removing unsafe tags/attributes.
   * However, the options explicitly **whitelist additional tags/attributes**:

     * **Tags:** `iframe` is allowed (normally DOMPurify blocks it because it can embed external content).
     * **Attributes:** `src`, `href`, `title`, `width`, etc., are allowed.
       These are essential for `<iframe>`, `<a>`, `<img>`, etc.

3. **Allow custom and standard URI schemes**

   ```ts
   ALLOWED_URI_REGEXP:
     /^(?:(?:https?|mailto|tel|data|db):|[^a-z]|[a-z+.-]+(?:[^a-z+.-]|$))/i
   ```

   * By default, DOMPurify **blocks unknown URI schemes** to prevent JavaScript injection (`javascript:alert(1)`).
   * This regex tells DOMPurify which URI schemes are **safe**:

     * `http:` and `https:` (normal web URLs)
     * `mailto:` (email links)
     * `tel:` (phone links)
     * `data:` (inline base64 images, like `data:image/png;base64,...`)
     * **`db:`** ← your **custom Electron protocol** for serving images from the database (`db://image/123`).
   * Without this, `<img src="db://image/1">` would be stripped or broken by DOMPurify.

4. **Return Angular-safe HTML**

   ```ts
   const retText: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(clean);
   return retText;
   ```

   * Angular’s DOM sanitizer normally strips potentially dangerous HTML.
   * `bypassSecurityTrustHtml` tells Angular: *“this is safe, trust me”*.
   * The safety is guaranteed because DOMPurify has already sanitized it.

---

### In summary

This function:

✅ Converts Markdown → HTML
✅ Sanitizes the HTML (prevents XSS) but allows iframes & safe attributes
✅ Extends the allowed URL schemes to include **your custom `db://` protocol** (so DB-stored images can render in `<img src="db://...">`).
✅ Returns Angular `SafeHtml` so it can be safely rendered in templates.

---

👉 So the purpose of `ALLOWED_URI_REGEXP` here is **to whitelist `db://` URLs (and other safe schemes)** so your custom database-backed image links are not stripped out by DOMPurify.

---