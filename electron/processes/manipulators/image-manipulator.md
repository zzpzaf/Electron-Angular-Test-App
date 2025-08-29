electron/processes/manipulators/image-manipulator.ts

250829

# `image-manipulator.ts`
The file includes the following functions:
- ### processMarkdownImagesForArticle
- ### downloadAndStoreImagesStreamedForArticle
- ### extractFromMarkdownArrayImageUrls
- ### downloadAndStoreImageStreamed
- ### extractFileName
- ### rewriteMarkdownImagesWithDbLinks

---


# The 'high-level' wrapper `processMarkdownImagesForArticle()` function

This is a **high-level wrapper** that processes all images in an article’s Markdown content.

It:

1. **Extracts** image URLs from the Markdown text (inline, reference, or HTML).
2. **Downloads and stores** each image sequentially, streaming with optional size limits.
3. **Returns** both the extracted URLs (in reading order) and the per-image download/store results.

---

## **Step-by-step workflow**

1. **Log intent**

   ```ts
   console.log('Calling extractFromMarkdownArrayImageUrls()');
   ```

2. **Extract image URLs**

   ```ts
   const extracted = extractFromMarkdownArrayImageUrls(markContent);
   ```

   * Uses the earlier helper (`extractFromMarkdownArrayImageUrls`) to scan the Markdown string.
   * Produces an ordered array like:

     ```ts
     [{ orderIndx: 0, imgUrl: "https://example.com/img1.png" }, ...]
     ```

3. **Short-circuit if no images**

   ```ts
   if (extracted.length === 0) {
     return { extracted, results: [] };
   }
   ```

   * Returns immediately with empty results if the Markdown contained no images.

4. **Prepare list of URLs for downloader**

   ```ts
   const orderedUrls = extracted.map(e => e.imgUrl);
   ```

   * Drops everything but the URLs (order preserved).

5. **Download and store images**

   ```ts
   const results = await downloadAndStoreImagesStreamedForArticle(
     article_id,
     orgArticleUrl,
     orderedUrls,
     {
       maxBytes: opts?.maxBytes,
       setOrder: opts?.setOrder ?? true,
       startOrder: opts?.startOrder ?? 0,
     }
   );
   ```

   * Calls the other wrapper (`downloadAndStoreImagesStreamedForArticle`) with:

     * The article ID and original article URL.
     * The list of extracted URLs.
     * Options:

       * `maxBytes`: enforce a maximum image size.
       * `setOrder`: defaults to `true` here, so each image gets an order index.
       * `startOrder`: index offset (default 0).
   * That function downloads and stores each image sequentially, returning detailed results (success/failure, file paths, etc.).

6. **Return combined result**

   ```ts
   return { extracted, results };
   ```

   * The return type `ProcessMarkdownResult` contains:

     * `extracted`: the raw Markdown image URLs in reading order.
     * `results`: the full download/store results array (one per URL).

---

## **Example usage**

```ts
const res = await processMarkdownImagesForArticle(
  42,
  "https://medium.com/post/abc123",
  markdownContent,
  { maxBytes: 5 * 1024 * 1024 }
);

console.log(res.extracted); // ordered image URLs
console.log(res.results);   // per-image download/store metadata
```

---

✅ **In short:**
This function is the **end-to-end pipeline** for handling article images:
*Find them in Markdown → Download/Store them → Return both the “what we found” and the “what happened to them”.*


### Image Processing Flow
```
processMarkdownImagesForArticle(article_id, orgArticleUrl, markContent, opts)
        │
        ├─► extractFromMarkdownArrayImageUrls(markContent)
        │        │
        │        └─► returns [{ orderIndx, imgUrl }, ...]   ← reading order
        │
        ├─► if no images → return { extracted, results: [] }
        │
        ├─► orderedUrls = extracted.map(e => e.imgUrl)
        │
        └─► downloadAndStoreImagesStreamedForArticle(
                 article_id,
                 orgArticleUrl,
                 orderedUrls,
                 {
                   maxBytes: opts?.maxBytes,
                   setOrder: opts?.setOrder ?? true,
                   startOrder: opts?.startOrder ?? 0
                 }
             )
                 │
                 └─(sequential loop over orderedUrls)──────────────────────────┐
                      for each url:                                            │
                        ├─► downloadAndStoreImageStreamed({
                        │       article_id,
                        │       orgArticleUrl,
                        │       orgImgUrl: url,
                        │       maxBytes,
                        │       orderIndx: setOrder ? currentOrder : null
                        │   })
                        └─► collect { orgImgUrl, orderIndx?, ...ImageDownloadResult }
                           (increment order if setOrder)                       │
                 ──────────────────────────────────────────────────────────────┘

return { extracted, results }   // extracted = ordered image URLs
                                // results   = per-URL download/store outcomes
```


---
---
---


# The wrapper ` downloadAndStoreImagesStreamedForArticle()` function

### This is a **wrapper function** that:

* Takes an article ID, the article’s original URL, and a list of image URLs.
* Iterates through the image URLs **sequentially** (one by one).
* For each image:

  * Calls another helper, `downloadAndStoreImageStreamed(...)`, which actually **downloads** the image (streaming it in chunks) and **stores it** (e.g., in the DB or filesystem).
  * Collects the result (success/failure, metadata) together with the original image URL, and optionally an `orderIndx` (the image’s order in the Markdown/HTML).
* Returns an array of results, one entry per input image.

This makes sure all article images are downloaded and stored in order, with results for each.

---

## **How it works (step by step)**

1. **Extract options**

   ```ts
   const setOrder = !!opts?.setOrder;   // Should we assign an order index?
   const maxBytes = opts?.maxBytes;     // Max allowed size per image (optional)
   let order = opts?.startOrder ?? 0;   // Start order index (default 0)
   ```

   * `setOrder` → whether to assign sequential order indices.
   * `maxBytes` → optional per-image size limit.
   * `order` → where to start numbering (useful if appending more images later).

2. **Prepare results array**

   ```ts
   const out: Array<{ orgImgUrl: string; orderIndx?: number } & ImageDownloadResult> = [];
   ```

   Each result will contain:

   * The original image URL (`orgImgUrl`),
   * The assigned `orderIndx` (if enabled),
   * Plus all fields returned by `downloadAndStoreImageStreamed` (e.g., file path, DB id, errors).

3. **Sequential loop**

   ```ts
   for (const url of orgImgUrls) {
     const res = await downloadAndStoreImageStreamed({ ... });
     out.push({ orgImgUrl: url, orderIndx: setOrder ? order : undefined, ...res });
     if (setOrder) order++;
   }
   ```

   * It uses `for ... of` with `await` → downloads happen **one after another**.
     (This avoids hammering servers with many parallel requests.)
   * For each URL:

     * Calls `downloadAndStoreImageStreamed(...)` with parameters:
       article id, article URL, the image URL, size limit, and order index (if enabled).
     * Pushes the combined result into `out[]`.
     * Increments the `order` counter if `setOrder` is true.

4. **Log and return**
   At the end it logs the array and returns it:

   ```ts
   console.log('Results:', out);
   return out;
   ```

---

## **What you get back**

An array of objects like:

```ts
[
  {
    orgImgUrl: "https://example.com/img1.png",
    orderIndx: 0,
    success: true,
    filePath: ".../stored/image1.png",
    size: 123456
  },
  {
    orgImgUrl: "https://example.com/img2.png",
    orderIndx: 1,
    success: false,
    error: "Timeout"
  }
]
```

---

✅ **In short:**
This function orchestrates **downloading and storing all images for one article**, sequentially, while tagging each with its order and returning a detailed result list.


---
---
---


# The `extractFromMarkdownArrayImageUrls()` function

Here’s what the function does and how it works—plain and practical:

**Goal**

It scans a Markdown content string and returns every image URL it finds, **in reading order**. It supports:

* Raw HTML images: `<img src="...">`
* Markdown inline images: `![alt](url "title")`
* Markdown reference images: `![alt][id]` paired with `[id]: url "title"` (and the shortcut `![alt][]`)


**What it returns**
An array like:

```ts
[{ orderIndx: 0, imgUrl: "https://..." }, { orderIndx: 1, imgUrl: "..." }, ...]
```

`orderIndx` reflects the order each URL appears in the text.

**How it works (step-by-step)**

1. **Early exit**
   If `markContent` is falsy, return `[]`.

2. **Build a map of reference definitions**
   Regex `refDefRe` collects lines like:

```
[id]: https://example/img.png "optional title"
```

It lowercases the `id`, extracts the `url`, and stores them in `refMap`.
Flags: `gim` (global, case-insensitive, multiline).

3. **Collect inline image URLs**
   Regex `inlineImgRe` matches `![...](...)` and captures the URL inside the parentheses.
   It tolerates **angle-bracketed URLs** (`<…>`) and optional titles (`"..."`, `'...'`, or `(…)`).
   Each captured URL is pushed to `results` in encounter order.

4. **Resolve reference images**
   Regex `refImgRe` matches `![alt][id]`.

* If the `id` is empty (`![alt][]`), it uses `alt` as the id (shortcut form).
* Looks up the URL from `refMap` and, if found, pushes it to `results`.

5. **Pick up HTML `<img>` tags**
   Regex `htmlImgRe` matches `<img ... src="...">` (or `'...'`).
   The captured `src` is pushed to `results`.

6. **Return with order indices**
   It maps `results` to `{ orderIndx, imgUrl }` preserving discovery order and logs them.
   Note: despite the comment “filter duplicates,” **no de-duplication is performed**—duplicates are kept as-is.

**Notes & caveats**

* It’s intentionally liberal, but not an exhaustive Markdown/HTML parser (e.g., complex nested parentheses in URLs or exotic HTML may escape the regexes).
* Reference IDs are matched case-insensitively (stored lowercase).
* Inline URLs with angle brackets are supported; spaces inside bare URLs aren’t.
* It handles relative URLs, absolute URLs, and `data:` URLs alike—anything that matches the capture.
* Time complexity is effectively linear over the input with a handful of global regex scans.



---
---
---


# The ` downloadAndStoreImageStreamed()` function 

Here’s what that function does, step-by-step, and why:

---

## What it does:

1. streams an image from the network with `got`
2. aborts early if it exceeds a byte limit
3. stores either the real image **or** a placeholder row in SQLite
4. returns a concise result object

It never touches Angular; you call it via IPC from the renderer.

---

## Inputs

```ts
{
  article_id: number,        // which article this image belongs to
  orgArticleUrl: string,     // original article page URL
  orgImgUrl: string,         // image URL to fetch
  maxBytes?: number,         // hard cap (default 10 MB)
  orderIndx?: number | null, // position in markdown (optional)
  alt_text?: string | null   // alt text (optional)
}
```

---

## Streaming download

```ts
const stream = got.stream(orgImgUrl, {
  timeout: { request: 15000 },
  followRedirect: true,
  maxRedirects: 5,
  retry: { limit: 2 },
  headers: { 'user-agent': 'App/1.0 (+https://www.example.com)' },
});
```

* Uses **got’s stream API** (Node stream of bytes).
* Sets a **request timeout**, allows redirects, and a small retry.
* Custom UA to be polite to servers.

When the HTTP **response** arrives:

```ts
stream.once('response', (res) => {
  mime = String(res.headers['content-type'] ?? '');         // e.g. image/png
  file_name = extractFileName(orgImgUrl, res.headers['content-disposition']);
});
```

* Reads `Content-Type` for MIME (fallback `application/octet-stream` if unknown).
* Attempts a filename from `Content-Disposition` or URL last path segment.

---

## Byte-limit enforcement (aborting early)

```ts
const chunks: Buffer[] = [];
let total = 0;
let aborted = false;

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
  stream.on('end', resolve);
  stream.on('error', reject);
});
```

* As bytes arrive, `total` grows.
* If `total > maxBytes` → **destroy** the stream with an error to stop downloading immediately.
* Otherwise, collect chunks to reassemble later.

---

## If aborted due to size

```ts
if (aborted) {
  const pseudoHash = sha256(`${orgImgUrl}|too-large|max=${maxBytes}`);
  const save = upsertImageRecord({
    article_id,
    orgArticleUrl,
    orgImgUrl,
    mime_type: mime,
    imgBlob: Buffer.alloc(0),                     // EMPTY BLOB placeholder
    byte_length: total,                           // bytes seen before abort
    sha256_hex: pseudoHash,                       // deterministic "hash"
    file_name: file_name ?? `aborted-${pseudoHash.slice(0, 8)}`,
    orderIndx: params.orderIndx ?? null,
    alt_text: `[ABORTED_TOO_LARGE:${maxBytes}]`,  // tag for UI/diagnostics
    imgWidth: null,
    imgHeight: null,
  });
  return { success: false, aborted: true, reason: 'too_large', imageId: save.imageId };
}
```

* Creates a **placeholder DB row**:

  * `imgBlob` is empty (still a valid BLOB)
  * `alt_text` marks the reason (`[ABORTED_TOO_LARGE:...]`)
  * `byte_length` captures how far it got
  * `sha256_hex` is a **deterministic pseudo-hash** based on URL+limit so your per-article unique `(article_id, sha256_hex)` still dedupes consistently.
* Returns `{ success:false, aborted:true, imageId }`, so the renderer can still create `db://image/{id}` and show a fallback.

---

## If completed within limit

```ts
const buffer = chunks.length ? Buffer.concat(chunks, total) : Buffer.alloc(0);
if (!mime.startsWith('image/')) {
  return { success: false, reason: `not_an_image:${mime}` };
}
const sha256_hex = sha256(buffer);
const save = upsertImageRecord({
  article_id,
  orgArticleUrl,
  orgImgUrl,
  mime_type: mime,
  imgBlob: buffer,                 // real image bytes
  byte_length: buffer.length,
  sha256_hex,
  file_name: file_name ?? `image-${sha256_hex.slice(0, 8)}`,
  orderIndx: params.orderIndx ?? null,
  alt_text: params.alt_text ?? '',
  imgWidth: null,
  imgHeight: null,
});
return {
  success: true,
  inserted: save.inserted,         // true if new row, false if deduped
  imageId: save.imageId,
  mime_type: mime,
  byte_length: buffer.length,
  sha256_hex,
  file_name: file_name ?? undefined,
};
```

* Reassembles the full buffer.
* Validates it **looks like an image** via MIME; if not, returns a failure.
* Computes a **SHA-256** of the bytes for dedupe/integrity.
* Calls `upsertImageRecord()`. 
The `upsertImageRecord()` function inserts an image into the images table of the main DB. In the case of a conflict (CONFLICT(article_id, sha256_hex)) it does nothing since the image is already existing. If the row is inserted it returns the new row id. If it is existing, it returns the existing row id. Finally, it returns the results as metadata back to the caller.

---

## Errors (network, DNS, timeout…)

```ts
} catch (err) {
  return { success: false, reason: err.message ?? String(err) };
}
```

* Any unexpected error becomes `{ success:false, reason: '...' }`.
* No DB row is created in this branch (only created for “aborted too large” or successful downloads).

---

## Why this design?

* **Stream + abort**: saves bandwidth and memory when images are huge.
* **Placeholder rows** for too-large images let your markdown rewrite still use `db://image/{id}` and display a controlled fallback later.
* **Per-article dedupe** via `(article_id, sha256_hex)` avoids duplicate blobs in the *same* article but allows reuse across different articles (since you chose a single `images` table, no join).
* **Order index** (`orderIndx`) can be set here when you know the true reading order from your markdown extractor.

---

## Improvements you can add later

* **Incremental hashing**: compute SHA-256 as you stream (no need to keep chunks) → lower memory for big images.
* **Header precheck**: if `Content-Length` exists and is already > `maxBytes`, abort even before reading body.
* **Dimension probe**: if you need `imgWidth/imgHeight`, you can either:

  * parse headers (some servers send size hints), or
  * use a small parser that can determine size from early bytes (so you don’t have to buffer all).

---

## Returned value shape (quick reference)

```ts
type ImageDownloadResult = {
  success: boolean;             // required
  aborted?: boolean;            // true when size limit exceeded
  reason?: string;              // failure reason (e.g., 'too_large', 'not_an_image:...')

  imageId?: number;             // DB id if row exists (success OR aborted placeholder)
  inserted?: boolean;           // true if newly inserted row
  mime_type?: string;           // e.g., image/png
  byte_length?: number;         // stored blob size
  sha256_hex?: string;          // content hash (for success path)
  file_name?: string;           // derived file name
};
```

That’s the full flow and rationale behind each step.


---
---
---


# The helper ` extractFileName()` function


### Purpose

Given a **download URL** and an optional HTTP **Content-Disposition** header, it tries to determine a **file name** for the downloaded resource. It prefers the header (if present) and falls back to the URL’s last path segment.

### Step-by-step logic

1. **Try Content-Disposition first (highest fidelity):**

   * Looks for a `filename*=` parameter that may include RFC 5987 encoding (e.g., `filename*=UTF-8''my%20file.png`) via:

     ```regex
     /filename\*=(?:UTF-8'')?([^;]+)/i
     ```

     Captures the value up to `;`.
   * If not found, looks for a quoted `filename="..."` via:

     ```regex
     /filename="([^"]+)"/i
     ```
   * Picks whichever matched (`m1` or `m2`), trims it, strips any quotes, and **decodes percent-escapes** with `decodeURIComponent`. If decoding throws (bad percent-encoding), it returns the raw value.

2. **Fallback to URL path if no usable header:**

   * Constructs a `URL` from `urlStr`. If that fails (invalid URL), returns `null`.
   * Takes the **last non-empty path segment** from `u.pathname` (everything after the last `/`).
     Example: `https://site.com/images/cat.jpg` → `cat.jpg`.
   * If the path ends with `/` or there’s no segment, returns `null`.

### Return value

* A file name string (e.g., `"cat.jpg"`), or `null` if nothing sensible can be determined.

### Examples

* Header: `Content-Disposition: attachment; filename="résumé.pdf"` → `"résumé.pdf"`.
* Header: `filename*=UTF-8''na%C3%AFve.png` → `"naïve.png"`.
* No header; URL: `https://cdn.example.com/assets/img/logo.svg` → `"logo.svg"`.
* No header; URL: `https://example.com/dir/` → `null` (no last segment).

### Edge cases handled

* **RFC 5987** filename\* with optional `UTF-8''` prefix.
* **Quoted** filename parameter.
* **Percent-decoding** of header values (with safe fallback if malformed).
* **Trailing slash** or empty segments in URL paths.
* **Invalid URL** strings (caught and return `null`).

---
---
---


# The `rewriteMarkdownImagesWithDbLinks()` function

✅ **In short:**
It transforms all image references in Markdown into `db://image/{id}` links using DB results, while preserving order and leaving originals untouched when no DB mapping exists.

### **What it does**

`rewriteMarkdownImagesWithDbLinks(...)` takes a Markdown string (`markContent`) and a list of image-processing results from the DB (`results`).

It **rewrites the original image references** in the Markdown so that instead of pointing to external URLs, they now point to local database-backed links in the form:

```
db://image/{imageId}
```

This way, when the Markdown is rendered later, the images are loaded from your DB rather than the original URLs.

---

### **How it works**

1. **Input validation**

   * If there’s no Markdown or no `results`, it just returns the original `markContent`.

2. **Result cursor**

   * It processes results in *exactly the same order* as the extractor produced them (inline first, reference second, HTML last).
   * A `cursor` keeps track of which result to use next.
   * The helper `takeNextDbUrl()` returns the rewritten URL if the current result has a numeric `imageId`. If not, it advances anyway but signals “no rewrite”.

3. **Inline images**

   * Regex matches inline Markdown images like:

     ```md
     ![alt](http://example.com/foo.png "optional title")
     ```
   * For each, it tries to replace the URL with `db://image/{id}` from the results.
   * If no DB imageId exists, it leaves the original untouched.

4. **Reference-style images**

   * Matches reference-usage style:

     ```md
     ![alt][id]
     ```
   * These are rewritten into inline form with the DB URL:

     ```md
     ![alt](db://image/{id})
     ```

5. **HTML `<img>` tags**

   * Matches `<img src="...">` tags.
   * Only the `src` attribute value is replaced with `db://image/{id}`, preserving all other attributes.

6. **Return**

   * Returns the updated Markdown string with DB-linked images.

---

### **Key Points**

* **Order-sensitive**: must align with how URLs were extracted (cursor-driven).
* **Graceful fallback**: if no `imageId` (download failed, not stored), the original image link is preserved.
* **Handles three formats**: inline Markdown, reference Markdown, raw HTML `<img>`.
* **Ensures DB integration**: images now resolve to your internal DB scheme (`db://image/...`) instead of external links.

---

# A **`before vs after`** transformation. 
See exactly what `rewriteMarkdownImagesWithDbLinks()` does.

---

### Example Input

```md
## Article Example

Here is an inline image:
![logo](https://site.com/images/logo.png "Company Logo")

Here is a reference-style image:
![diagram][d1]

And here is raw HTML:
<img src="https://site.com/images/photo.jpg" alt="photo" width="200"/>

[d1]: https://site.com/images/diagram.png "A diagram"
```

And suppose `results` looks like this (from DB after downloading/storing):

```ts
[
  { orgImgUrl: "https://site.com/images/logo.png", imageId: 101 },
  { orgImgUrl: "https://site.com/images/diagram.png", imageId: 102 },
  { orgImgUrl: "https://site.com/images/photo.jpg", imageId: 103 }
]
```

---

### What happens

1. Inline `![logo](...)` → replaced with `db://image/101`
2. Reference `![diagram][d1]` → turned into inline `![diagram](db://image/102)`
3. HTML `<img src="...">` → `src="db://image/103"`

Order is preserved (1st match gets 101, 2nd gets 102, etc.).

---

### Example Output

```md
## Article Example

Here is an inline image:
![logo](db://image/101 "Company Logo")

Here is a reference-style image:
![diagram](db://image/102)

And here is raw HTML:
<img src="db://image/103" alt="photo" width="200"/>

[d1]: https://site.com/images/diagram.png "A diagram"
```

---

🔎 Notice:

* The `[d1]: ...` definition remains, but it’s unused now because the usage was rewritten.
* If any `results` entry had **no `imageId`**, the original Markdown would have been left unchanged for that image.

---





