import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { access, appendFile, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import {
  attachUnsavedChangesCloseGuard,
  createUnsavedChangesTracker,
  registerUnsavedChangesIpc,
} from './closeGuard';
import { registerIpcHandlers } from './ipcHandlers';
import { createMainWindow, disableApplicationMenu } from './window';

const unsavedChangesTracker = createUnsavedChangesTracker();

app.whenReady().then(() => {
  registerUnsavedChangesIpc(ipcMain, unsavedChangesTracker);
  registerIpcHandlers({
    ipcMain,
    app,
    dialog,
    fs: { access, appendFile, mkdir, readdir, readFile, unlink, writeFile },
  });
  disableApplicationMenu(Menu);
  const mainWindow = createMainWindow({
    BrowserWindow,
    shell,
    isPackaged: app.isPackaged,
    rendererUrl: process.env['ELECTRON_RENDERER_URL'],
    dirname: __dirname,
  });
  attachUnsavedChangesCloseGuard(mainWindow, dialog, unsavedChangesTracker);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const activatedWindow = createMainWindow({
        BrowserWindow,
        shell,
        isPackaged: app.isPackaged,
        rendererUrl: process.env['ELECTRON_RENDERER_URL'],
        dirname: __dirname,
      });
      attachUnsavedChangesCloseGuard(activatedWindow, dialog, unsavedChangesTracker);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
