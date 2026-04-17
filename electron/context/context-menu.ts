// electron/context-menu.ts

import { BrowserWindow, Menu } from 'electron';

function canUseWindow(win: BrowserWindow): boolean {
  return !win.isDestroyed() && !win.webContents.isDestroyed();
}

function safeSend(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!canUseWindow(win)) {
    return;
  }
  win.webContents.send(channel, payload);
}

function safeRemoveContextMenuListener(
  win: BrowserWindow,
  handler: (event: Electron.Event, params: Electron.ContextMenuParams) => void
): void {
  if (!canUseWindow(win)) {
    return;
  }
  win.webContents.removeListener('context-menu', handler);
}

/**
 * Attaches a custom context menu to the given BrowserWindow.
 * This menu supports only editable contexts, e.g., text field inputs.
 * Returns a disposer function to remove the context menu handler.
 */
export function attachContextMenu1(win: BrowserWindow) {
  const handler = (
    _event: Electron.Event,
    params: Electron.ContextMenuParams
  ) => {
    const { isEditable, selectionText, x, y } = params;

    const editItems: Electron.MenuItemConstructorOptions[] = [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(process.platform === 'darwin'
        ? [{ role: 'pasteAndMatchStyle' as const }]
        : []),
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' },
    ];

    const selectionItems: Electron.MenuItemConstructorOptions[] = [
      { role: 'copy' },
      { type: 'separator' },
      { role: 'selectAll' },
    ];

    let template: Electron.MenuItemConstructorOptions[] = [];
    if (isEditable) template = editItems;
    else if (selectionText?.trim()) template = selectionItems;

    if (process.env.NODE_ENV === 'development') {
      if (template.length) template.push({ type: 'separator' });
      template.push({ role: 'toggleDevTools' });
    }

    if (!template.length) return;

    if (!canUseWindow(win)) {
      return;
    }

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win, x, y });
  };

  win.webContents.on('context-menu', handler);

  // Return a disposer so callers can detach when needed
  return () => {
    safeRemoveContextMenuListener(win, handler);
  };
}


/**
 * Attaches a custom context menu to the given BrowserWindow.
 * This menu supports both editable and non-editable contexts.
 * Non-editable contexts will have a "Select All" option that sends an IPC message
 * to the preload script to handle selection within a defined scope.
 * The scope is defined by elements with the tag <context-select-all-scope> or
 * the attribute [context-select-all-scope].
 * The IPC channel used is 'ctx-select-all'. 
 * 
 * Inside inputs/textarea/contentEditable → we use the native menu with { role: 'selectAll' }. 
 * That selects only the field’s contents. No IPC is sent.
 * Everywhere else (non-editable) → we show the custom item that sends 'ctx-select-all' 
 * to the renderer, which scopes selection to your tagged container.
 * 
 * Returns a disposer function to remove the context menu handler. 
 * @param win 
 * @returns () => void
 * @example :
 * const disposeContextMenu = attachContextMenu(mainAppWin);
 * Later, when you want to remove the context menu:
 * disposeContextMenu(); 
 */

export function attachContextMenu2(win: BrowserWindow) {
  const handler = (
    _event: Electron.Event,
    params: Electron.ContextMenuParams
  ) => {
    const { isEditable, selectionText, x, y } = params;

    const editItems: Electron.MenuItemConstructorOptions[] = [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(process.platform === 'darwin'
        ? [{ role: 'pasteAndMatchStyle' as const }]
        : []),
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' }, // keep native in editables
    ];

    const nonEditableItems: Electron.MenuItemConstructorOptions[] = [
      { role: 'copy' },
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        click: () => {
          // 👉 Tell preload to select all, within an element having the defined tag: 
          // <context-select-all-scope> (or [context-select-all-scope])
          // via the IPC channel 'ctx-select-all'
          safeSend(win, 'ctx-select-all', { x, y });
        },
      },
    ];

    const template = isEditable ? editItems : nonEditableItems;

    if (process.env.NODE_ENV === 'development') {
      template.push({ type: 'separator' }, { role: 'toggleDevTools' });
    }

    if (!canUseWindow(win)) {
      return;
    }
    Menu.buildFromTemplate(template).popup({ window: win, x, y });
  };

  win.webContents.on('context-menu', handler);
  return () => safeRemoveContextMenuListener(win, handler);
}





/**
 * Attaches a custom context menu to the given BrowserWindow.
 * This menu supports both editable and non-editable contexts.
 * Non-editable contexts will have a "Select All" option that sends an IPC message
 * to the preload script to handle selection within a defined scope.
 * The scope is defined by elements with the tag <context-select-all-scope> or
 * the attribute [context-select-all-scope].
 * The IPC channel used is 'ctx-select-all'. 
 * 
 * Inside inputs/textarea/contentEditable → we use the native menu with { role: 'selectAll' }. 
 * That selects only the field’s contents. No IPC is sent.
 * Everywhere else (non-editable) → we show the custom item that sends 'ctx-select-all' 
 * to the renderer, which scopes selection to your tagged container.
 * 
 * Returns a disposer function to remove the context menu handler. 
 * @param win 
 * @returns () => void
 * @example :
 * const disposeContextMenu = attachContextMenu(mainAppWin);
 * Later, when you want to remove the context menu:
 * disposeContextMenu(); 
 */

export function attachContextMenu(win: BrowserWindow) {
  const handler = (
    _event: Electron.Event,
    params: Electron.ContextMenuParams
  ) => {
    const { isEditable, selectionText, x, y } = params;

    const editItems: Electron.MenuItemConstructorOptions[] = [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(process.platform === 'darwin'
        ? [{ role: 'pasteAndMatchStyle' as const }]
        : []),
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' }, // keep native in editables
    ];

    const nonEditableItems: Electron.MenuItemConstructorOptions[] = [
      // { role: 'copy' },
      {
        label: 'Copy',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          // tells renderer to copy current selection or tagged scope
          safeSend(win, 'ctx-copy', { x, y });
        }
      },  
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        click: () => {
          // 👉 Tell preload to select all, within an element having the defined tag: 
          // <context-select-all-scope> (or [context-select-all-scope])
          // via the IPC channel 'ctx-select-all'
          safeSend(win, 'ctx-select-all', { x, y });
        },
      },
    ];

    const template = isEditable ? editItems : nonEditableItems;

    if (process.env.NODE_ENV === 'development') {
      template.push({ type: 'separator' }, { role: 'toggleDevTools' });
    }

    if (!canUseWindow(win)) {
      return;
    }
    Menu.buildFromTemplate(template).popup({ window: win, x, y });
  };

  win.webContents.on('context-menu', handler);
  return () => safeRemoveContextMenuListener(win, handler);
}
