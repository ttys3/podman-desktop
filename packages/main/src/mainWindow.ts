/**********************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import type { BrowserWindowConstructorOptions } from 'electron';
import { BrowserWindow, ipcMain, app, dialog } from 'electron';
import { join } from 'path';
import { URL } from 'url';
import { isLinux, isMac } from './util';

async function createWindow() {
  const browserWindowConstructorOptions: BrowserWindowConstructorOptions = {
    show: false, // Use 'ready-to-show' event to show window
    width: 1050,
    minWidth: 640,
    minHeight: 600,
    height: 600,
    webPreferences: {
      webSecurity: false,
      nativeWindowOpen: true,
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like iframe or Electron's BrowserView. https://www.electronjs.org/docs/latest/api/webview-tag#warning
      preload: join(__dirname, '../../preload/dist/index.cjs'),
    },
  };
  if (isMac) {
    browserWindowConstructorOptions.titleBarStyle = 'hiddenInset';
  }

  // native wayland support according to vscode code
  // ref https://github.com/microsoft/vscode/blob/fa8d1063f6ab829e848575cf402d8bca74bcc2d4/src/vs/platform/windows/electron-main/window.ts#L241
  // only do this if it is under Linux and is using wayland
  if (true) {
    browserWindowConstructorOptions.titleBarStyle = 'hidden';
    if (!isMac) {
	  browserWindowConstructorOptions.frame = false;
    }
  }

  const browserWindow = new BrowserWindow(browserWindowConstructorOptions);

  setTimeout(() => {
    browserWindow.webContents.send('container-stopped-event', 'containerID');
  }, 5000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.on('container-stopped-event', (event: any) => {
    browserWindow.webContents.send('container-stopped-event', event);
  });

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  browserWindow.on('ready-to-show', () => {
    browserWindow?.show();
    if (isMac) {
      app.dock.show();
    }

    if (import.meta.env.DEV) {
      browserWindow?.webContents.openDevTools();
    }
  });

  // select a file using native widget
  ipcMain.on('dialog:openFile', async (_, param: { dialogId: string; message: string }) => {
    const response = await dialog.showOpenDialog(browserWindow, {
      properties: ['openFile'],
      message: param.message,
    });
    // send the response back
    browserWindow.webContents.send('dialog:open-file-or-folder-response', param.dialogId, response);
  });

  // select a folder using native widget
  ipcMain.on('dialog:openFolder', async (_, param: { dialogId: string; message: string }) => {
    const response = await dialog.showOpenDialog(browserWindow, {
      properties: ['openDirectory'],
      message: param.message,
    });
    // send the response back
    browserWindow.webContents.send('dialog:open-file-or-folder-response', param.dialogId, response);
  });

  browserWindow.on('close', e => {
    e.preventDefault();
    if (isLinux) {
      browserWindow.minimize();
    } else {
      browserWindow.hide();
      if (isMac) {
        app.dock.hide();
      }
    }
  });

  app.on('before-quit', () => {
    browserWindow.destroy();
  });

  /**
   * URL for main window.
   * Vite dev server for development.
   * `file://../renderer/index.html` for production and test
   */
  const pageUrl =
    import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL !== undefined
      ? import.meta.env.VITE_DEV_SERVER_URL
      : new URL('../renderer/dist/index.html', 'file://' + __dirname).toString();

  await browserWindow.loadURL(pageUrl);

  return browserWindow;
}

/**
 * Restore existing BrowserWindow or Create new BrowserWindow
 */
export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await createWindow();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (!window.isVisible()) {
    window.show();
  }

  window.focus();
}
