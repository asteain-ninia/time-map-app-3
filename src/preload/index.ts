import { contextBridge, ipcRenderer } from 'electron';

const api = {
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, data: string): Promise<void> =>
    ipcRenderer.invoke('file:write', filePath, data),
  showOpenDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:open'),
  showSaveDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save')
};

contextBridge.exposeInMainWorld('api', api);
