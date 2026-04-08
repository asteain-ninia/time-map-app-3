import type { FileAPI } from './api';

declare global {
  interface Window {
    api: FileAPI;
  }
}

export {};
