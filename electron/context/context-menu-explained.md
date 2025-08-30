The **`context-menu.ts`** file. 

250816

n General: It defines **main-process** helpers that attach a custom **right-click context menu** to a `BrowserWindow`, covering both **editable** and **non-editable** scenarios, and returns a **disposer** to cleanly remove the handler.

# What the file exports

The file contains three exported variants (progressive iterations with the same idea):

* `attachContextMenu1(win: BrowserWindow)` — a minimal menu focused on **editable** contexts and basic selection handling.
* `attachContextMenu2(win: BrowserWindow)` — adds support for **non-editable** contexts with a **scoped “Select All”** entry that talks to the renderer via IPC.
* `attachContextMenu(win: BrowserWindow)` — a consolidated version: **editable + non-editable** support, scoped select-all, and dev-tools in development.

All of them follow the same pattern:

1. Hook `win.webContents.on('context-menu', handler)`
2. Build a menu **template** based on `Electron.ContextMenuParams`
3. `Menu.buildFromTemplate(template).popup({ window: win, x, y })`
4. Return a disposer that calls `win.webContents.removeListener('context-menu', handler)`

---

# How the menu is built

## 1) Inspect the context

Each handler receives `params` with:

* `isEditable`: true inside inputs/textarea/contentEditable
* `selectionText`: currently selected text (if any)
* `x`, `y`: screen coordinates for positioning the popup

These are used to choose **which menu** to show.

## 2) Editable context menu

For editable fields, the template uses **native roles** so the OS/Electron handle the behavior:

```ts
const editItems = [
  { role: 'undo' }, { role: 'redo' },
  { type: 'separator' },
  { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
  ...(process.platform === 'darwin' ? [{ role: 'pasteAndMatchStyle' as const }] : []),
  { role: 'delete' },
  { type: 'separator' },
  { role: 'selectAll' },
];
```

* This respects platform conventions (e.g., Paste and Match Style on macOS).
* Because it’s **editable**, there’s **no IPC** — the native role already selects within the field.

## 3) Non-editable context menu (scoped “Select All”)

For non-editable areas (articles, panels, custom components), the code shows a leaner menu:

```ts
const nonEditableItems = [
  { role: 'copy' },
  { type: 'separator' },
  {
    label: 'Select All',
    accelerator: 'CmdOrCtrl+A',
    click: () => {
      // Tell the renderer to select only within a specific scope
      win.webContents.send('ctx-select-all', { x, y });
    },
  },
];
```

* **Why IPC?** The renderer knows the DOM. Your preload/renderer (see your `context-select-all-support.ts`) listens to `'ctx-select-all'` and:

  * Finds the closest container marked with `<context-select-all-scope>` or `[context-select-all-scope]`.
  * Selects only that container’s content (instead of the whole page).
* This gives you a **scoped** select-all UX in non-editable contexts, where native `role: 'selectAll'` would otherwise select the entire page indiscriminately.

## 4) Picking the template

* If `isEditable` → use **editable** template.
* Else if there’s **non-empty selectionText**, `attachContextMenu1` also shows a basic selection menu (copy/selectAll).
* Otherwise → use the **non-editable** template with scoped “Select All”.

## 5) Dev tools in development

All variants append a dev-tools toggle in development:

```ts
if (process.env.NODE_ENV === 'development') {
  template.push({ type: 'separator' }, { role: 'toggleDevTools' });
}
```

---

# Lifecycle & disposal

Each function returns a **disposer**:

```ts
win.webContents.on('context-menu', handler);
return () => win.webContents.removeListener('context-menu', handler);
```

Call the disposer when you:

* Close the window
* Hot-reload main-process code
* Switch menus dynamically

This prevents duplicate handlers or memory leaks.

---

# How it integrates with your other modules

* **Renderer-side selection support:**
  The `'ctx-select-all'` message is handled by your **`context-select-all-support.ts`** (installed in preload). That module:

  * Tracks where the right-click happened.
  * Locates the nearest scope (`<context-select-all-scope>` / `[context-select-all-scope]`).
  * Creates a `Selection` that covers only that scope (or whole page if you opt into fallback).

* **Optional copy with image inlining:**
  If you also use the complementary **copy** flow (`ctx-copy`, `ctx-fetch-as-dataurl`, `ctx-write-clipboard`), your non-editable context menu can add a custom “Copy” item that inlines images before writing rich HTML + text to the system clipboard (covered in your `context-copy-selected-images.ts`).

---

# Practical usage

**Main process**

```ts
import { attachContextMenu } from './context-menu';

const disposeContextMenu = attachContextMenu(mainWindow);
// later: disposeContextMenu();
```

**Preload (renderer bridge)**

* Ensure you’ve installed `installScopedSelectAll()` so the `'ctx-select-all'` signal is honored and selection is scoped correctly.

---

# Key takeaways

* **Editable:** native edit roles (undo/redo/cut/copy/paste/delete/select all).
* **Non-editable:** “Copy” + **scoped “Select All”** via IPC (`'ctx-select-all'`), so selection stays inside a marked container.
* **Dev experience:** DevTools shortcut in development builds.
* **Clean teardown:** Disposer removes the handler when you’re done.

If you want, I can extend this file with an optional **“Copy (inline images)”** item that triggers your existing IPC copy pipeline, so non-editable content copies with images embedded (great for pasting into email/notes apps).
