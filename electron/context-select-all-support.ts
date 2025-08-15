// electron/context-select-all-support.ts

import { ipcRenderer, IpcRendererEvent } from 'electron';

export interface ScopedSelectAllOptions {
  /** IPC channel name the main process uses to trigger Select All */
  channel?: string;                 // default: 'ctx-select-all'
  /** Custom tag to treat as a selection scope */
  tagName?: string;                 // default: 'context-select-all-scope'
  /** Attribute name to treat as a selection scope */
  attrName?: string;                // default: 'context-select-all-scope'
  /** If true, falls back to selecting the whole page when no scope is found */
  fallbackToPage?: boolean;         // default: false
}

/**
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
 *  Returns a disposer to remove listeners.
 */
export function installScopedSelectAll(opts: ScopedSelectAllOptions = {}) {

  const channel = opts.channel ?? 'ctx-select-all';
  const tagName = (opts.tagName ?? 'context-select-all-scope').toLowerCase();
  const attrName = opts.attrName ?? 'context-select-all-scope';
  const fallbackToPage = !!opts.fallbackToPage;

  let lastContextTarget: Element | null = null;

  const onContextMenu = (e: MouseEvent) => {
    const path = (e.composedPath && e.composedPath()) || [];
    lastContextTarget = (path[0] as Element) || (e.target as Element) || null;
  };

  const isScopeElement = (el: Element | null): el is HTMLElement => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const t = el.tagName.toLowerCase();
    return t === tagName || el.hasAttribute(attrName);
  };

  const findScope = (start: Element | null): HTMLElement | null => {
    let cur: Element | null = start;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isScopeElement(cur)) return cur as HTMLElement;
      cur = cur.parentElement;
    }
    return null;
  };

  const onIpc = (_ev: IpcRendererEvent, payload?: { x?: number; y?: number }) => {
    let el: Element | null = lastContextTarget;

    // Fallback: derive from coordinates if we missed the contextmenu event
    if (!el && payload && typeof payload.x === 'number' && typeof payload.y === 'number') {
      // elementFromPoint expects CSS pixels
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

  // Use capture to ensure we record the original target even if someone stops propagation
  window.addEventListener('contextmenu', onContextMenu, true);
  ipcRenderer.on(channel, onIpc);

  // Return disposer so you can unhook on demand
  return () => {
    window.removeEventListener('contextmenu', onContextMenu, true);
    ipcRenderer.off(channel, onIpc);
  };
}
