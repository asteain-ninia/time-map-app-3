import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { access, appendFile, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import {
  attachUnsavedChangesCloseGuard,
  createUnsavedChangesTracker,
  registerUnsavedChangesIpc,
} from './closeGuard';
import { registerIpcHandlers } from './ipcHandlers';
import {
  findProjectPathArg,
  isSupportedProjectPath,
  revealProjectOpenWindow,
  sendProjectPathToWindow,
} from './projectOpen';
import { createMainWindow, disableApplicationMenu } from './window';

const unsavedChangesTracker = createUnsavedChangesTracker();
let mainWindow: BrowserWindow | null = null;
let pendingOpenProjectPath: string | null = findProjectPathArg(process.argv);

function queueOrSendProjectPath(filePath: string): void {
  if (!isSupportedProjectPath(filePath)) {
    return;
  }

  if (!mainWindow) {
    pendingOpenProjectPath = filePath;
    return;
  }

  revealProjectOpenWindow(mainWindow);
  sendProjectPathToWindow(mainWindow, filePath);
}

function registerMainProcessAdapters(): void {
  registerUnsavedChangesIpc(ipcMain, unsavedChangesTracker);
  registerIpcHandlers({
    ipcMain,
    app,
    dialog,
    fs: { access, appendFile, mkdir, readdir, readFile, unlink, writeFile },
  });
  disableApplicationMenu(Menu);
}

function createAppWindow(): BrowserWindow {
  const createdWindow = createMainWindow({
    BrowserWindow,
    shell,
    isPackaged: app.isPackaged,
    rendererUrl: process.env['ELECTRON_RENDERER_URL'],
    dirname: __dirname,
  }) as BrowserWindow;

  mainWindow = createdWindow;
  mainWindow.on('closed', () => {
    if (mainWindow === createdWindow) {
      mainWindow = null;
    }
  });
  attachUnsavedChangesCloseGuard(createdWindow, dialog, unsavedChangesTracker);

  if (pendingOpenProjectPath) {
    const filePath = pendingOpenProjectPath;
    pendingOpenProjectPath = null;
    sendProjectPathToWindow(createdWindow, filePath);
  }

  return createdWindow;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = findProjectPathArg(argv);
    if (filePath) {
      queueOrSendProjectPath(filePath);
      return;
    }
    if (mainWindow) {
      revealProjectOpenWindow(mainWindow);
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    queueOrSendProjectPath(filePath);
  });

  app.whenReady().then(() => {
    registerMainProcessAdapters();
    createAppWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createAppWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
