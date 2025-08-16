// electron/context-select-all-support.ts

import { ipcRenderer, IpcRendererEvent } from 'electron';

export interface ScopedSelectAllOptions {
  channelSelectAll?: string; // default 'ctx-select-all'
  channelCopy?: string; // default 'ctx-copy'
  tagName?: string; // default 'context-select-all-scope'
  attrName?: string; // default 'context-select-all-scope'
  fallbackToPage?: boolean; // default false
}

type SelectionContainer = { container: HTMLElement; text?: string };

/**
 * 250815
 * Installs scoped "Select All" support for non-editable elements marked with either
 * <context-select-all-scope> or [context-select-all-scope].
 * This allows users to select all content within these elements
 * when they right-click and choose "Select All" from the context menu.
 * This is useful for custom contexts where the default browser behavior
 * does not apply, such as block elements, custom components or web views.
 * The selection is done by sending an IPC message to the preload script,
 * which then selects the content within the defined scope.
 * The IPC channel used is 'ctx-select-all' by default, but can be customized
 * via the `channel` option.
 * The scope is defined by elements with the tag <context-select-all-scope>
 * or the attribute [context-select-all-scope].
 * The tag name and attribute name can be customized via the `tagName` and `attrName` options.
 * If no scope is found, it can fall back to selecting the whole page
 * if `fallbackToPage` is set to true.
 * 
 * 250816
 * Adds rich “Copy” capability for inlines images (converts <img src> to data: URLs) 
 * so pasting works outside your app.  * For this purpose, it handles additionally the new ‘ctx-copy' 
 * IPC channel (defined into the ‘context-menu.ts’ file) and  * uses  the ‘ctx-fetch-as-dataurl’ and 
 * 'ctx-write-clipboard' IPC channels (defined into the 'context-copy-selected-images.ts' file).
 * 
 * Returns: 
 * a disposer to remove listeners.
 */

export function installScopedSelectAll(opts: ScopedSelectAllOptions = {}) {
  const chSelectAll = opts.channelSelectAll ?? 'ctx-select-all';
  const chCopy = opts.channelCopy ?? 'ctx-copy';
  const tagName = (opts.tagName ?? 'context-select-all-scope').toLowerCase();
  const attrName = opts.attrName ?? 'context-select-all-scope';
  const fallbackToPage = !!opts.fallbackToPage;

  let lastContextTarget: Element | null = null;

  const onContextMenu = (e: MouseEvent) => {
    const path = (e.composedPath && e.composedPath()) || [];
    lastContextTarget = (path[0] as Element) || (e.target as Element) || null;
  };

  const isScopeElement = (el: Element | null): el is HTMLElement =>
    !!(
      el instanceof HTMLElement &&
      (el.tagName.toLowerCase() === tagName || el.hasAttribute(attrName))
    );

  const findScope = (start: Element | null): HTMLElement | null => {
    let cur: Element | null = start;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isScopeElement(cur)) return cur as HTMLElement;
      cur = cur.parentElement;
    }
    return null;
  };

  // ----- Select All (unchanged behavior) -----
  const onSelectAll = (
    _ev: IpcRendererEvent,
    payload?: { x?: number; y?: number }
  ) => {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.matches('input, textarea, select') || ae.isContentEditable))
      return;

    let el: Element | null = lastContextTarget;
    if (
      !el &&
      payload &&
      typeof payload.x === 'number' &&
      typeof payload.y === 'number'
    ) {
      el = document.elementFromPoint(payload.x, payload.y);
    }

    const scope = findScope(el);
    const sel = window.getSelection();
    if (!sel) return;
    
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

  // ----- Copy with inlined images -----
  const toAbsUrl = (src: string) => new URL(src, document.baseURI).href;

  const inlineImagesAndGetHTML = async (container: HTMLElement) => {
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute('src') || '';
        if (!src || src.startsWith('data:')) return;
        try {
          const abs = toAbsUrl(src);
          const dataUrl: string = await ipcRenderer.invoke(
            'ctx-fetch-as-dataurl',
            abs
          );
          img.setAttribute('src', dataUrl);
          // Optional: drop srcset to avoid overrides on paste
          img.removeAttribute('srcset');
        } catch {
          // Ignore fetch failures; leave original src
        }
      })
    );
    return container.innerHTML;
  };

  function getSelectionFragmentContainer(): SelectionContainer | null {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const frag = range.cloneContents();
      const div = document.createElement('div'); // HTMLDivElement, but assignable to HTMLElement
      div.appendChild(frag);
      return { container: div as HTMLElement, text: sel.toString() };
    }
    return null;
  }

  const onCopy = async (
    _ev: IpcRendererEvent,
    payload?: { x?: number; y?: number }
  ) => {
    // If an editable is focused, let native copy handle it
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.matches('input, textarea, select') || ae.isContentEditable))
      return;

    // Prefer the current selection
    let selContainer: SelectionContainer | null =
      getSelectionFragmentContainer();

    if (!selContainer) {
      // No selection: copy the whole tagged scope under cursor
      let el: Element | null = lastContextTarget;
      if (
        !el &&
        payload &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number'
      ) {
        el = document.elementFromPoint(payload.x, payload.y);
      }
      const scope = findScope(el);
      if (!scope) return;

      const clone = scope.cloneNode(true) as HTMLElement;
      selContainer = { container: clone, text: clone.innerText };
    }

    const html = await inlineImagesAndGetHTML(selContainer!.container);
    const text = selContainer!.text ?? selContainer!.container.innerText;

    await ipcRenderer.invoke('ctx-write-clipboard', { html, text });
  };

  // Register listeners
  window.addEventListener('contextmenu', onContextMenu, true);
  ipcRenderer.on(chSelectAll, onSelectAll);
  ipcRenderer.on(chCopy, onCopy);

  // Return disposer so you can unhook on demand
  return () => {
    window.removeEventListener('contextmenu', onContextMenu, true);
    ipcRenderer.off(chSelectAll, onSelectAll);
    ipcRenderer.off(chCopy, onCopy);
  };
}
