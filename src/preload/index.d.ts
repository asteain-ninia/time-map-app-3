interface FileAPI {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  existsFile(filePath: string): Promise<boolean>;
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
}

declare global {
  interface Window {
    api: FileAPI;
  }
}

export {};
