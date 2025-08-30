The **`context-select-all-support.ts`** file. 

250816

In General: It’s a **renderer-side** helper that installs two capabilities:

1. **Scoped “Select All”** for non-editable content (right-click → Select All selects only within a marked container).
2. **Rich “Copy”** that **inlines images** (converts `<img src>` to `data:` URLs) so pasting works outside your app.

It’s designed to work together with your main-process context-menu + clipboard utilities (`ctx-select-all`, `ctx-copy`, `ctx-fetch-as-dataurl`, `ctx-write-clipboard`) and returns a **disposer** so you can remove all listeners cleanly.

---

# Public API

```ts
export function installScopedSelectAll(
  opts: ScopedSelectAllOptions = {}
): () => void
```

**Options (`ScopedSelectAllOptions`)**

* `channelSelectAll` — IPC channel for select-all requests (default: `'ctx-select-all'`).
* `channelCopy` — IPC channel for copy requests (default: `'ctx-copy'`).
* `tagName` — tag that marks a scope (default: `'context-select-all-scope'`).
* `attrName` — attribute that marks a scope (default: `'context-select-all-scope'`).
* `fallbackToPage` — if **true**, “Select All” falls back to the **entire document** when no scope is found (default: **false**).

**Return value**: a **disposer** function that removes the installed event listeners and IPC handlers.

---

# How it works

## 1) Track where the context menu was opened

```ts
let lastContextTarget: Element | null = null;

const onContextMenu = (e: MouseEvent) => {
  const path = (e.composedPath && e.composedPath()) || [];
  lastContextTarget = (path[0] as Element) || (e.target as Element) || null;
};
window.addEventListener('contextmenu', onContextMenu, true);
```

* Remembers the exact element you right-clicked, so “Select All” / “Copy” can act **relative** to that spot.

## 2) Find a “scope” container

```ts
const isScopeElement = (el: Element | null): el is HTMLElement =>
  !!(el instanceof HTMLElement &&
     (el.tagName.toLowerCase() === tagName || el.hasAttribute(attrName)));

const findScope = (start: Element | null): HTMLElement | null => {
  let cur = start;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    if (isScopeElement(cur)) return cur as HTMLElement;
    cur = cur.parentElement;
  }
  return null;
};
```

* A scope is any element matching the **tag** `<context-select-all-scope>` or having the **attribute** `[context-select-all-scope]` (both customizable).
* The code walks up from the right-click target to the nearest scope.

## 3) Scoped **Select All**

```ts
const onSelectAll = (_ev, payload?: { x?: number; y?: number }) => {
  const ae = document.activeElement as HTMLElement | null;
  if (ae && (ae.matches('input, textarea, select') || ae.isContentEditable))
    return; // respect native select-all inside inputs/textarea/contentEditable

  // Determine element under cursor or lastContextTarget
  let el: Element | null = lastContextTarget;
  if (payload?.x != null && payload?.y != null) {
    el = document.elementFromPoint(payload.x, payload.y);
  }

  const scope = findScope(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();

  if (scope) {
    const range = document.createRange();
    range.selectNodeContents(scope);
    sel.addRange(range);
  } else if (fallbackToPage) {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    sel.addRange(range);
  }
};
ipcRenderer.on(chSelectAll, onSelectAll);
```

* **Editable elements**: do nothing; you rely on the **native** `selectAll` there.
* **Non-editable**: creates a selection that covers just the **scoped** container.
* If no scope and `fallbackToPage: true`, it selects the **whole page**.

## 4) **Copy** with images inlined

The goal: produce clipboard **HTML + text** where all `<img>` tags are **data URLs**, so paste works in apps that can’t fetch external links.

### a) Get the user’s current selection (or the scoped container)

```ts
type SelectionContainer = { container: HTMLElement; text?: string };

function getSelectionFragmentContainer(): SelectionContainer | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const frag = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(frag);
    return { container: div as HTMLElement, text: sel.toString() };
  }
  return null;
}
```

### b) Convert `<img src="...">` to `data:` URLs (asks main process to fetch)

```ts
const toAbsUrl = (src: string) => new URL(src, document.baseURI).href;

const inlineImagesAndGetHTML = async (container: HTMLElement) => {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;      // already inline
      try {
        const abs = toAbsUrl(src);
        const dataUrl: string = await ipcRenderer.invoke('ctx-fetch-as-dataurl', abs);
        img.setAttribute('src', dataUrl);
        img.removeAttribute('srcset'); // optional: prevent future overrides
      } catch {
        // ignore failures; leave original src as-is
      }
    })
  );
  return container.innerHTML;
};
```

* Uses the **main-process** IPC `ctx-fetch-as-dataurl` (your other file) to fetch arbitrary `http(s)` or `file://` images and return **data URLs**.
* Rewrites each `<img src>` to `data:`; keeps everything else intact.

### c) Write to the clipboard (HTML + text)

```ts
const onCopy = async (_ev, payload?: { x?: number; y?: number }) => {
  let selContainer = getSelectionFragmentContainer();

  if (!selContainer) {
    // No selection? Use the scope under the context-click point
    let el: Element | null = lastContextTarget;
    if (payload?.x != null && payload?.y != null) {
      el = document.elementFromPoint(payload.x, payload.y);
    }
    const scope = findScope(el);
    if (!scope) return; // nothing to copy if no selection and no scope
    const clone = scope.cloneNode(true) as HTMLElement;
    selContainer = { container: clone, text: clone.innerText };
  }

  const html = await inlineImagesAndGetHTML(selContainer.container);
  const text = selContainer.text ?? selContainer.container.innerText;

  await ipcRenderer.invoke('ctx-write-clipboard', { html, text });
};
ipcRenderer.on(chCopy, onCopy);
```

* If there’s already a selection, it copies **that**.
* Otherwise, it clones the scoped container near the right-click point and copies **that**.
* Sends both HTML and plain text to the main process (`ctx-write-clipboard`) so different paste targets get the right flavor.

## 5) Cleanup / Disposer

```ts
return () => {
  window.removeEventListener('contextmenu', onContextMenu, true);
  ipcRenderer.off(chSelectAll, onSelectAll);
  ipcRenderer.off(chCopy, onCopy);
};
```

* You can dispose this during app shutdown or hot-reload.

---

# How it ties into your ecosystem

* **Main process** must provide:

  * `ctx-fetch-as-dataurl` (convert URL → `data:`) — you already have this in `context-copy-selected-images.ts`.
  * `ctx-write-clipboard` (write HTML + text \[+ image]) — also in that file.
* **Main window** context menu should trigger:

  * `ctx-select-all` for non-editable “Select All”.
  * `ctx-copy` for “Copy” (especially in non-editable regions).
* **Preload** imports this file and calls `installScopedSelectAll()` once, storing the returned **disposer** so it can be removed on teardown.

---

# Typical usage pattern

**preload.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { installScopedSelectAll } from './context-select-all-support';

let disposeSelectAll: (() => void) | null = null;

window.addEventListener('DOMContentLoaded', () => {
  disposeSelectAll = installScopedSelectAll({
    channelSelectAll: 'ctx-select-all',
    channelCopy: 'ctx-copy',
    fallbackToPage: true
  });
});

window.addEventListener('beforeunload', () => {
  disposeSelectAll?.();
});
```

**main.ts** (conceptual)

* Build context menu:

  * In **editable** fields → use native `{ role: 'selectAll' }` and `{ role: 'copy' }`.
  * In **non-editable** → add menu items that **send** `ctx-select-all` / `ctx-copy` to the focused window.

---

# Edge cases & behavior notes

* **Editable elements**: the helper **does not override** native behavior; it exits early so your native menu roles work as usual.
* **No scope + no selection**: nothing happens unless `fallbackToPage` is set (then it selects the whole page for select-all; for copy, it still requires either a selection or a found scope).
* **Relative image URLs**: resolved via `new URL(src, document.baseURI)` before fetching.
* **Failed image fetch**: ignored; the original `src` stays (copy still proceeds).
* **Security**: images are fetched and inlined by main process IPC; clipboard writes are done main-side, which is the right security model in Electron.

If you want, I can provide a **tiny main-process context menu snippet** wired to send `ctx-select-all` / `ctx-copy` so you have a turnkey example.
