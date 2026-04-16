import { dirname, join } from 'path';

const PROJECT_FILE_FILTERS = [
  { name: 'gimoza プロジェクト', extensions: ['gimoza'] },
  { name: 'JSON ファイル', extensions: ['json'] },
];

type IpcHandler = (event: unknown, ...args: any[]) => Promise<unknown>;

interface IpcMainLike {
  handle(channel: string, listener: IpcHandler): void;
}

interface AppLike {
  isPackaged: boolean;
  getAppPath(): string;
  getPath(name: 'exe'): string;
}

interface DialogLike {
  showOpenDialog(options: {
    filters: typeof PROJECT_FILE_FILTERS;
    properties: string[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(options: {
    filters: typeof PROJECT_FILE_FILTERS;
  }): Promise<{ canceled: boolean; filePath?: string | null }>;
}

interface DirEntryLike {
  isFile(): boolean;
  name: string;
}

interface FsLike {
  access(path: string): Promise<void>;
  appendFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  readdir(path: string, options: { withFileTypes: true }): Promise<readonly DirEntryLike[]>;
  readFile(path: string): Promise<Buffer>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  unlink(path: string): Promise<void>;
  writeFile(path: string, data: Buffer): Promise<void>;
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
}

function createIpcHandlers({
  app,
  dialog,
  fs,
}: {
  app: AppLike;
  dialog: DialogLike;
  fs: FsLike;
}): Record<string, IpcHandler> {
  return {
    'file:read': async (_event, filePath: string): Promise<string> => {
      return fs.readFile(filePath, 'utf-8');
    },

    'file:write': async (_event, filePath: string, data: string): Promise<void> => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data, 'utf-8');
    },

    'file:readBinary': async (_event, filePath: string): Promise<string> => {
      const data = await fs.readFile(filePath);
      return Buffer.from(data).toString('base64');
    },

    'file:writeBinary': async (_event, filePath: string, base64Data: string): Promise<void> => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
    },

    'file:append': async (_event, filePath: string, data: string): Promise<void> => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, data, 'utf-8');
    },

    'file:exists': async (_event, filePath: string): Promise<boolean> => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    'file:list': async (_event, dirPath: string): Promise<readonly string[]> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },

    'file:delete': async (_event, filePath: string): Promise<void> => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    },

    'file:autoBackupRoot': async (): Promise<string> => {
      const appRootPath = app.isPackaged
        ? dirname(app.getPath('exe'))
        : app.getAppPath();
      return join(appRootPath, 'savebackup');
    },

    'file:logRoot': async (): Promise<string> => {
      const appRootPath = app.isPackaged
        ? dirname(app.getPath('exe'))
        : app.getAppPath();
      return join(appRootPath, 'logs');
    },

    'dialog:open': async (): Promise<string | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        filters: PROJECT_FILE_FILTERS,
        properties: ['openFile'],
      });
      return canceled ? null : filePaths[0] ?? null;
    },

    'dialog:save': async (): Promise<string | null> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        filters: PROJECT_FILE_FILTERS,
      });
      return canceled ? null : filePath ?? null;
    },
  };
}

function registerIpcHandlers({
  ipcMain,
  app,
  dialog,
  fs,
}: {
  ipcMain: IpcMainLike;
  app: AppLike;
  dialog: DialogLike;
  fs: FsLike;
}): void {
  const handlers = createIpcHandlers({ app, dialog, fs });
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

export { PROJECT_FILE_FILTERS, createIpcHandlers, registerIpcHandlers };
