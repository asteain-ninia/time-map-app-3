export interface FileAPI {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  readBinaryFile(filePath: string): Promise<string>;
  writeBinaryFile(filePath: string, base64Data: string): Promise<void>;
  appendFile(filePath: string, data: string): Promise<void>;
  existsFile(filePath: string): Promise<boolean>;
  listFiles(dirPath: string): Promise<readonly string[]>;
  deleteFile(filePath: string): Promise<void>;
  getAutoBackupRootPath(): Promise<string>;
  getLogRootPath(): Promise<string>;
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
  setUnsavedChanges(isDirty: boolean): void;
}

interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send?(channel: string, ...args: unknown[]): void;
}

export function createPreloadApi(ipcRenderer: IpcRendererLike): FileAPI {
  return {
    readFile: (filePath: string) =>
      ipcRenderer.invoke('file:read', filePath) as Promise<string>,
    writeFile: (filePath: string, data: string) =>
      ipcRenderer.invoke('file:write', filePath, data) as Promise<void>,
    readBinaryFile: (filePath: string) =>
      ipcRenderer.invoke('file:readBinary', filePath) as Promise<string>,
    writeBinaryFile: (filePath: string, base64Data: string) =>
      ipcRenderer.invoke('file:writeBinary', filePath, base64Data) as Promise<void>,
    appendFile: (filePath: string, data: string) =>
      ipcRenderer.invoke('file:append', filePath, data) as Promise<void>,
    existsFile: (filePath: string) =>
      ipcRenderer.invoke('file:exists', filePath) as Promise<boolean>,
    listFiles: (dirPath: string) =>
      ipcRenderer.invoke('file:list', dirPath) as Promise<readonly string[]>,
    deleteFile: (filePath: string) =>
      ipcRenderer.invoke('file:delete', filePath) as Promise<void>,
    getAutoBackupRootPath: () =>
      ipcRenderer.invoke('file:autoBackupRoot') as Promise<string>,
    getLogRootPath: () =>
      ipcRenderer.invoke('file:logRoot') as Promise<string>,
    showOpenDialog: () =>
      ipcRenderer.invoke('dialog:open') as Promise<string | null>,
    showSaveDialog: () =>
      ipcRenderer.invoke('dialog:save') as Promise<string | null>,
    setUnsavedChanges: (isDirty: boolean) => {
      ipcRenderer.send?.('app:setDirtyState', isDirty);
    },
  };
}
