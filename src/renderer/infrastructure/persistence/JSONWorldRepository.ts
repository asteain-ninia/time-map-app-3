/**
 * JSONWorldRepository
 * §5.4: WorldRepositoryインターフェースのJSON永続化実装
 * §2.5: IPC経由でファイル読み書きを行う
 */

import type { WorldRepository } from '@domain/repositories/WorldRepository';
import type { World } from '@domain/entities/World';
import { serialize, deserialize, SerializationError } from './JSONSerializer';

/** ファイルシステムアクセスの抽象化（テスト容易性のため） */
export interface FileSystemPort {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
}

export class JSONWorldRepository implements WorldRepository {
  private readonly fs: FileSystemPort;

  constructor(fs: FileSystemPort) {
    this.fs = fs;
  }

  async load(filePath: string): Promise<World> {
    const content = await this.fs.readFile(filePath);
    return deserialize(content);
  }

  async save(filePath: string, world: World): Promise<void> {
    const json = serialize(world);
    await this.fs.writeFile(filePath, json);
  }
}

/**
 * Electron IPC経由のFileSystemPort実装
 * window.api（preloadで公開）を使用する
 */
export function createElectronFileSystem(): FileSystemPort {
  return {
    readFile: (filePath: string) => window.api.readFile(filePath),
    writeFile: (filePath: string, data: string) => window.api.writeFile(filePath, data),
  };
}
