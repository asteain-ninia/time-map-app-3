/**
 * JSONWorldRepository
 * §5.4: WorldRepositoryインターフェースのJSON永続化実装
 * §2.5: IPC経由でファイル読み書きを行う
 */

import type { WorldRepository } from '@domain/repositories/WorldRepository';
import type { World } from '@domain/entities/World';
import { World as WorldEntity } from '@domain/entities/World';
import { serialize, deserialize, SerializationError } from './JSONSerializer';
import {
  base64ToBytes,
  bytesToBase64,
  createStoredZip,
  decodeUtf8,
  encodeUtf8,
  readStoredZipEntries,
} from './zipArchive';

const GIMOZA_PROJECT_ENTRY = 'project.json';
const GIMOZA_BASE_MAP_ENTRY = 'assets/base-map.svg';

/** ファイルシステムアクセスの抽象化（テスト容易性のため） */
export interface FileSystemPort {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  readBinaryFile?(filePath: string): Promise<string>;
  writeBinaryFile?(filePath: string, base64Data: string): Promise<void>;
  readAsset?(assetPath: string): Promise<string>;
}

export class JSONWorldRepository implements WorldRepository {
  private readonly fs: FileSystemPort;

  constructor(fs: FileSystemPort) {
    this.fs = fs;
  }

  async load(filePath: string): Promise<World> {
    if (isGimozaFile(filePath)) {
      return this.loadGimoza(filePath);
    }
    const content = await this.fs.readFile(filePath);
    return deserialize(content);
  }

  async save(filePath: string, world: World): Promise<void> {
    if (isGimozaFile(filePath)) {
      await this.saveGimoza(filePath, world);
      return;
    }
    const json = serialize(world);
    await this.fs.writeFile(filePath, json);
  }

  private async loadGimoza(filePath: string): Promise<World> {
    if (!this.fs.readBinaryFile) {
      throw new SerializationError('.gimoza ファイルを読み込める環境ではありません');
    }

    const archiveBytes = base64ToBytes(await this.fs.readBinaryFile(filePath));
    const entries = readStoredZipEntries(archiveBytes);
    const projectEntry = entries.find((entry) => entry.name === GIMOZA_PROJECT_ENTRY);
    if (!projectEntry) {
      throw new SerializationError('.gimoza に project.json が含まれていません');
    }
    const world = deserialize(decodeUtf8(projectEntry.data));
    const baseMapEntry = entries.find((entry) => entry.name === GIMOZA_BASE_MAP_ENTRY);
    return baseMapEntry
      ? withBaseMapSvgText(world, decodeUtf8(baseMapEntry.data))
      : world;
  }

  private async saveGimoza(filePath: string, world: World): Promise<void> {
    if (!this.fs.writeBinaryFile) {
      throw new SerializationError('.gimoza ファイルを書き込める環境ではありません');
    }

    const baseMap = await this.resolveBaseMap(world);
    const projectJson = serialize(withBaseMapSvgText(world, null));
    const entries = [
      { name: GIMOZA_PROJECT_ENTRY, data: encodeUtf8(projectJson) },
      { name: GIMOZA_BASE_MAP_ENTRY, data: encodeUtf8(baseMap) },
    ];
    await this.fs.writeBinaryFile(filePath, bytesToBase64(createStoredZip(entries)));
  }

  private async resolveBaseMap(world: World): Promise<string> {
    const configuredMap = world.metadata.settings.baseMap.svgText;
    if (configuredMap && configuredMap.trim().length > 0) {
      return configuredMap;
    }
    return this.loadBundledBaseMap();
  }

  private async loadBundledBaseMap(): Promise<string> {
    if (this.fs.readAsset) {
      try {
        const baseMap = await this.fs.readAsset('./assets/maps/base-map.svg');
        if (baseMap.trim().length > 0) {
          return baseMap;
        }
      } catch {
        // 空の正規SVGへフォールバックする。
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180"></svg>';
  }
}

function isGimozaFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.gimoza');
}

function withBaseMapSvgText(world: World, svgText: string | null): World {
  const settings = world.metadata.settings;
  const metadata = {
    ...world.metadata,
    settings: {
      ...settings,
      baseMap: {
        ...settings.baseMap,
        svgText,
      },
    },
  };

  return new WorldEntity(
    world.version,
    world.vertices,
    world.features,
    world.layers,
    world.sharedVertexGroups,
    world.timelineMarkers,
    metadata
  );
}

/**
 * Electron IPC経由のFileSystemPort実装
 * window.api（preloadで公開）を使用する
 */
export function createElectronFileSystem(): FileSystemPort {
  return {
    readFile: (filePath: string) => window.api.readFile(filePath),
    writeFile: (filePath: string, data: string) => window.api.writeFile(filePath, data),
    readBinaryFile: (filePath: string) => window.api.readBinaryFile(filePath),
    writeBinaryFile: (filePath: string, base64Data: string) =>
      window.api.writeBinaryFile(filePath, base64Data),
    readAsset: async (assetPath: string) => {
      const response = await fetch(assetPath);
      if (!response.ok) {
        throw new Error(`Failed to read asset: ${assetPath}`);
      }
      return response.text();
    },
  };
}
