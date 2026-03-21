import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: '地物時空変遷編纂機',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** JSONファイル用フィルタ（要件定義書 §2.5.1: 拡張子は .json） */
const JSON_FILTERS = [{ name: 'JSON ファイル', extensions: ['json'] }];

/** IPC ハンドラの登録 */
function registerIpcHandlers(): void {
  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    return readFile(filePath, 'utf-8');
  });

  ipcMain.handle('file:write', async (_event, filePath: string, data: string): Promise<void> => {
    await writeFile(filePath, data, 'utf-8');
  });

  ipcMain.handle('dialog:open', async (): Promise<string | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: JSON_FILTERS,
      properties: ['openFile'],
    });
    return canceled ? null : filePaths[0] ?? null;
  });

  ipcMain.handle('dialog:save', async (): Promise<string | null> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: JSON_FILTERS,
    });
    return canceled ? null : filePath ?? null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
