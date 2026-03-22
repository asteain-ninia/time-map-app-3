import { describe, it, expect, vi } from 'vitest';
import { JSONWorldRepository, type FileSystemPort } from '@infrastructure/persistence/JSONWorldRepository';
import { serialize } from '@infrastructure/persistence/JSONSerializer';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Layer } from '@domain/entities/Layer';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';

function createMockFs(): FileSystemPort & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
} {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
}

function createTestWorld(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));

  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(1000) },
    { name: 'テスト', description: '' },
    { type: 'Point', vertexId: 'v1' },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const features = new Map<string, Feature>();
  features.set('f1', new Feature('f1', 'Point', [anchor]));

  const layers = [new Layer('l1', 'レイヤー1', 0)];

  return new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);
}

describe('JSONWorldRepository', () => {
  describe('save', () => {
    it('WorldをJSON文字列としてファイルに書き込む', async () => {
      const fs = createMockFs();
      fs.writeFile.mockResolvedValue(undefined);
      const repo = new JSONWorldRepository(fs);
      const world = createTestWorld();

      await repo.save('/path/to/file.json', world);

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith('/path/to/file.json', expect.any(String));

      // 書き込まれた文字列が有効なJSONか確認
      const writtenJson = fs.writeFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenJson);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.features).toHaveLength(1);
    });

    it('ファイルシステムエラーを伝播する', async () => {
      const fs = createMockFs();
      fs.writeFile.mockRejectedValue(new Error('Write failed'));
      const repo = new JSONWorldRepository(fs);

      await expect(repo.save('/path', World.createEmpty())).rejects.toThrow('Write failed');
    });
  });

  describe('load', () => {
    it('JSONファイルからWorldを読み込む', async () => {
      const fs = createMockFs();
      const original = createTestWorld();
      fs.readFile.mockResolvedValue(serialize(original));
      const repo = new JSONWorldRepository(fs);

      const loaded = await repo.load('/path/to/file.json');

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.json');
      expect(loaded.version).toBe('1.0.0');
      expect(loaded.features.size).toBe(1);
      expect(loaded.vertices.size).toBe(1);
    });

    it('不正なJSONでエラーを投げる', async () => {
      const fs = createMockFs();
      fs.readFile.mockResolvedValue('not valid json');
      const repo = new JSONWorldRepository(fs);

      await expect(repo.load('/path')).rejects.toThrow('Invalid JSON format');
    });

    it('バージョン不整合でエラーを投げる', async () => {
      const fs = createMockFs();
      fs.readFile.mockResolvedValue(JSON.stringify({ version: '99.0.0' }));
      const repo = new JSONWorldRepository(fs);

      await expect(repo.load('/path')).rejects.toThrow('Unsupported version');
    });

    it('ファイルシステムエラーを伝播する', async () => {
      const fs = createMockFs();
      fs.readFile.mockRejectedValue(new Error('File not found'));
      const repo = new JSONWorldRepository(fs);

      await expect(repo.load('/path')).rejects.toThrow('File not found');
    });

    it('saveしたWorldをloadで正確に復元できる', async () => {
      const fs = createMockFs();
      let savedData = '';
      fs.writeFile.mockImplementation(async (_path: string, data: string) => {
        savedData = data;
      });
      fs.readFile.mockImplementation(async () => savedData);

      const repo = new JSONWorldRepository(fs);
      const original = createTestWorld();

      await repo.save('/test.json', original);
      const loaded = await repo.load('/test.json');

      expect(loaded.features.size).toBe(original.features.size);
      expect(loaded.vertices.size).toBe(original.vertices.size);
      expect(loaded.layers).toHaveLength(original.layers.length);

      const originalFeature = original.features.get('f1')!;
      const loadedFeature = loaded.features.get('f1')!;
      expect(loadedFeature.featureType).toBe(originalFeature.featureType);
      expect(loadedFeature.anchors[0].property.name).toBe(originalFeature.anchors[0].property.name);
    });
  });
});
