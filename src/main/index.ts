import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { access, appendFile, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { registerIpcHandlers } from './ipcHandlers';
import { createMainWindow, disableApplicationMenu } from './window';

app.whenReady().then(() => {
  registerIpcHandlers({
    ipcMain,
    app,
    dialog,
    fs: { access, appendFile, mkdir, readdir, readFile, unlink, writeFile },
  });
  disableApplicationMenu(Menu);
  createMainWindow({
    BrowserWindow,
    shell,
    isPackaged: app.isPackaged,
    rendererUrl: process.env['ELECTRON_RENDERER_URL'],
    dirname: __dirname,
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({
        BrowserWindow,
        shell,
        isPackaged: app.isPackaged,
        rendererUrl: process.env['ELECTRON_RENDERER_URL'],
        dirname: __dirname,
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
