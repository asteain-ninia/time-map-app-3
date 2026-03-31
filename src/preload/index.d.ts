interface FileAPI {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  existsFile(filePath: string): Promise<boolean>;
  listFiles(dirPath: string): Promise<readonly string[]>;
  deleteFile(filePath: string): Promise<void>;
  getAutoBackupRootPath(): Promise<string>;
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
}

declare global {
  interface Window {
    api: FileAPI;
  }
}

export {};
