import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApi } from './api';

contextBridge.exposeInMainWorld('api', createPreloadApi(ipcRenderer));
