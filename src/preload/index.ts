import { contextBridge, ipcRenderer } from 'electron';

const api = {
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, data: string): Promise<void> =>
    ipcRenderer.invoke('file:write', filePath, data),
  existsFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('file:exists', filePath),
  listFiles: (dirPath: string): Promise<readonly string[]> =>
    ipcRenderer.invoke('file:list', dirPath),
  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('file:delete', filePath),
  getAutoBackupRootPath: (): Promise<string> =>
    ipcRenderer.invoke('file:autoBackupRoot'),
  showOpenDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save')
};

contextBridge.exposeInMainWorld('api', api);
