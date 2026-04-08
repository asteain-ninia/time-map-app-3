export interface FileAPI {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  existsFile(filePath: string): Promise<boolean>;
  listFiles(dirPath: string): Promise<readonly string[]>;
  deleteFile(filePath: string): Promise<void>;
  getAutoBackupRootPath(): Promise<string>;
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
}

interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

export function createPreloadApi(ipcRenderer: IpcRendererLike): FileAPI {
  return {
    readFile: (filePath: string) =>
      ipcRenderer.invoke('file:read', filePath) as Promise<string>,
    writeFile: (filePath: string, data: string) =>
      ipcRenderer.invoke('file:write', filePath, data) as Promise<void>,
    existsFile: (filePath: string) =>
      ipcRenderer.invoke('file:exists', filePath) as Promise<boolean>,
    listFiles: (dirPath: string) =>
      ipcRenderer.invoke('file:list', dirPath) as Promise<readonly string[]>,
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke('file:delete', filePath) as Promise<void>,
    getAutoBackupRootPath: () =>
      ipcRenderer.invoke('file:autoBackupRoot') as Promise<string>,
    showOpenDialog: () =>
      ipcRenderer.invoke('dialog:open') as Promise<string | null>,
    showSaveDialog: () =>
      ipcRenderer.invoke('dialog:save') as Promise<string | null>,
  };
}
