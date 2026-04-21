import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveLoadUseCase, type DialogPort } from '@application/SaveLoadUseCase';
import type { WorldRepository } from '@domain/repositories/WorldRepository';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Layer } from '@domain/entities/Layer';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { eventBus } from '@application/EventBus';

function createMockRepository(): WorldRepository & {
  load: ReturnType<typeof vi.fn>;
  loadWithReport?: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  return {
    load: vi.fn(),
    save: vi.fn(),
  };
}

function createMockDialog(): DialogPort & {
  showOpenDialog: ReturnType<typeof vi.fn>;
  showSaveDialog: ReturnType<typeof vi.fn>;
} {
  return {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  };
}

function createTestWorld(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));
  vertices.set('v2', new Vertex('v2', new Coordinate(30, 40)));

  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(1000) },
    { name: '城', description: '' },
    { type: 'Point', vertexId: 'v1' },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const features = new Map<string, Feature>();
  features.set('f1', new Feature('f1', 'Point', [anchor]));

  const layers = [
    new Layer('l1', 'レイヤー1', 0),
    new Layer('l2', 'レイヤー2', 1),
  ];

  return new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);
}

function createTestWorldWithSharedVertices(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));
  vertices.set('v2', new Vertex('v2', new Coordinate(10, 20)));
  vertices.set('v3', new Vertex('v3', new Coordinate(30, 40)));

  const anchor1 = new FeatureAnchor(
    'a1',
    { start: new TimePoint(1000) },
    { name: '国A', description: '' },
    { type: 'Point', vertexId: 'v1' },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const anchor2 = new FeatureAnchor(
    'a2',
    { start: new TimePoint(1000) },
    { name: '国B', description: '' },
    { type: 'Point', vertexId: 'v2' },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const features = new Map<string, Feature>();
  features.set('f1', new Feature('f1', 'Point', [anchor1]));
  features.set('f2', new Feature('f2', 'Point', [anchor2]));

  const layers = [new Layer('l1', 'レイヤー1', 0)];

  const sharedGroups = new Map<string, SharedVertexGroup>();
  sharedGroups.set('sg-1', new SharedVertexGroup('sg-1', ['v1', 'v2'], new Coordinate(10, 20)));

  return new World('1.0.0', vertices, features, layers, sharedGroups, [], DEFAULT_METADATA);
}

describe('SaveLoadUseCase', () => {
  let repo: ReturnType<typeof createMockRepository>;
  let dialog: ReturnType<typeof createMockDialog>;
  let addFeature: AddFeatureUseCase;
  let manageLayers: ManageLayersUseCase;
  let navigateTime: NavigateTimeUseCase;
  let useCase: SaveLoadUseCase;

  beforeEach(() => {
    repo = createMockRepository();
    dialog = createMockDialog();
    addFeature = new AddFeatureUseCase();
    manageLayers = new ManageLayersUseCase();
    navigateTime = new NavigateTimeUseCase();
    useCase = new SaveLoadUseCase(repo, dialog, addFeature, manageLayers, navigateTime);
    eventBus.clear();
  });

  describe('save', () => {
    it('パス未設定時はsaveAsにフォールバックする', async () => {
      dialog.showSaveDialog.mockResolvedValue('/test/file.json');
      repo.save.mockResolvedValue(undefined);

      const result = await useCase.save();

      expect(dialog.showSaveDialog).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('パス設定済みならダイアログなしで上書き保存する', async () => {
      // まずパスを設定
      dialog.showSaveDialog.mockResolvedValue('/test/file.json');
      repo.save.mockResolvedValue(undefined);
      await useCase.saveAs();

      // 2回目はダイアログなし
      dialog.showSaveDialog.mockClear();
      await useCase.save();

      expect(dialog.showSaveDialog).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('保存後にworld:savedイベントが発行される', async () => {
      const listener = vi.fn();
      eventBus.on('world:saved', listener);

      dialog.showSaveDialog.mockResolvedValue('/test/file.json');
      repo.save.mockResolvedValue(undefined);
      await useCase.saveAs();

      expect(listener).toHaveBeenCalledWith({ filePath: '/test/file.json' });
    });

    it('ダイアログキャンセル時はfalseを返す', async () => {
      dialog.showSaveDialog.mockResolvedValue(null);

      const result = await useCase.saveAs();

      expect(result).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('open', () => {
    it('ファイルを読み込んで状態を復元する', async () => {
      const world = createTestWorld();
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);

      const result = await useCase.open();

      expect(result).toBe(true);
      expect(repo.load).toHaveBeenCalledWith('/test/file.json');
      expect(useCase.getCurrentFilePath()).toBe('/test/file.json');
    });

    it('読み込み後にworld:loadedイベントが発行される', async () => {
      const listener = vi.fn();
      eventBus.on('world:loaded', listener);

      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(createTestWorld());
      await useCase.open();

      expect(listener).toHaveBeenCalledWith({
        filePath: '/test/file.json',
        compatibilityWarnings: [],
      });
    });

    it('読み込み時の互換性警告がworld:loadedイベントに含まれる', async () => {
      const listener = vi.fn();
      eventBus.on('world:loaded', listener);
      repo.loadWithReport = vi.fn().mockResolvedValue({
        world: createTestWorld(),
        compatibilityWarnings: ['旧形式を変換しました。'],
      });

      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      await useCase.open();

      expect(repo.load).not.toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith({
        filePath: '/test/file.json',
        compatibilityWarnings: ['旧形式を変換しました。'],
      });
    });

    it('ダイアログキャンセル時はfalseを返す', async () => {
      dialog.showOpenDialog.mockResolvedValue(null);

      const result = await useCase.open();

      expect(result).toBe(false);
      expect(repo.load).not.toHaveBeenCalled();
    });

    it('読み込んだ地物がAddFeatureUseCaseに反映される', async () => {
      const world = createTestWorld();
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);

      await useCase.open();

      const features = addFeature.getFeatures();
      expect(features).toHaveLength(1);
      expect(features[0].id).toBe('f1');
      expect(features[0].anchors[0].property.name).toBe('城');

      const vertices = addFeature.getVertices();
      expect(vertices.size).toBe(2);
      expect(vertices.get('v1')!.x).toBe(10);
    });

    it('読み込んだレイヤーがManageLayersUseCaseに反映される', async () => {
      const world = createTestWorld();
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);

      await useCase.open();

      const layers = manageLayers.getLayers();
      expect(layers).toHaveLength(2);
      expect(layers[0].name).toBe('レイヤー1');
      expect(layers[1].name).toBe('レイヤー2');
    });
  });

  describe('assembleWorld', () => {
    it('各ユースケースの状態からWorldを組み立てる', () => {
      manageLayers.addLayer('l1', 'テスト');
      addFeature.addPoint(new Coordinate(5, 10), 'l1', new TimePoint(100));

      const world = useCase.assembleWorld();

      expect(world.version).toBe('1.0.0');
      expect(world.layers).toHaveLength(1);
      expect(world.features.size).toBe(1);
      expect(world.vertices.size).toBe(1);
    });

    it('空の状態でもWorldを組み立てられる', () => {
      const world = useCase.assembleWorld();

      expect(world.version).toBe('1.0.0');
      expect(world.layers).toHaveLength(0);
      expect(world.features.size).toBe(0);
      expect(world.vertices.size).toBe(0);
    });
  });

  describe('loadFromPath', () => {
    it('パス指定で直接読み込みできる', async () => {
      repo.load.mockResolvedValue(createTestWorld());

      const result = await useCase.loadFromPath('/direct/path.json');

      expect(result).toBe(true);
      expect(useCase.getCurrentFilePath()).toBe('/direct/path.json');
    });
  });

  describe('restore後のID採番', () => {
    it('復元後に追加した地物のIDが衝突しない', async () => {
      const world = createTestWorld();
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);
      await useCase.open();

      // 復元後に新しい地物を追加
      const newFeature = addFeature.addPoint(
        new Coordinate(50, 60),
        'l1',
        new TimePoint(2000)
      );

      // 新しいIDが既存と衝突しない
      expect(newFeature.id).not.toBe('f1');
      const allFeatures = addFeature.getFeatures();
      const ids = allFeatures.map(f => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('SharedVertexGroups', () => {
    it('assembleWorldがSharedVertexGroupsを含める', () => {
      // restoreで共有頂点グループを含むデータを設定
      const world = createTestWorldWithSharedVertices();
      addFeature.restore(world.features, world.vertices, world.sharedVertexGroups);
      manageLayers.restore(world.layers);

      const assembled = useCase.assembleWorld();

      expect(assembled.sharedVertexGroups.size).toBe(1);
      const group = assembled.sharedVertexGroups.get('sg-1');
      expect(group).toBeDefined();
      expect(group!.vertexIds).toEqual(['v1', 'v2']);
      expect(group!.representativeCoordinate.x).toBe(10);
    });

    it('読み込んだSharedVertexGroupsがAddFeatureUseCaseに反映される', async () => {
      const world = createTestWorldWithSharedVertices();
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);

      await useCase.open();

      const groups = addFeature.getSharedVertexGroups();
      expect(groups.size).toBe(1);
      expect(groups.get('sg-1')!.vertexIds).toEqual(['v1', 'v2']);
    });

    it('SharedVertexGroupsが空でも正常に動作する', () => {
      const world = useCase.assembleWorld();
      expect(world.sharedVertexGroups.size).toBe(0);
    });
  });

  describe('metadata', () => {
    it('setMetadataで設定したメタデータがassembleWorldに反映される', () => {
      const customMeta = {
        ...DEFAULT_METADATA,
        worldName: 'テスト世界',
        worldDescription: '説明文',
        sliderMin: 500,
        sliderMax: 5000,
      };
      useCase.setMetadata(customMeta);

      const world = useCase.assembleWorld();

      expect(world.metadata.worldName).toBe('テスト世界');
      expect(world.metadata.worldDescription).toBe('説明文');
      expect(world.metadata.sliderMin).toBe(500);
      expect(world.metadata.sliderMax).toBe(5000);
    });

    it('読み込み後にgetMetadataで復元されたメタデータを取得できる', async () => {
      const customMeta = {
        ...DEFAULT_METADATA,
        worldName: '読み込みテスト',
        sliderMax: 8000,
      };
      const world = new World(
        '1.0.0', new Map(), new Map(), [], new Map(), [], customMeta
      );
      dialog.showOpenDialog.mockResolvedValue('/test/file.json');
      repo.load.mockResolvedValue(world);

      await useCase.open();

      const meta = useCase.getMetadata();
      expect(meta.worldName).toBe('読み込みテスト');
      expect(meta.sliderMax).toBe(8000);
    });

    it('初期メタデータはDEFAULT_METADATAと一致する', () => {
      const meta = useCase.getMetadata();
      expect(meta.worldName).toBe(DEFAULT_METADATA.worldName);
      expect(meta.sliderMin).toBe(DEFAULT_METADATA.sliderMin);
      expect(meta.sliderMax).toBe(DEFAULT_METADATA.sliderMax);
    });
  });

  describe('resetProjectState', () => {
    it('新規プロジェクト開始時に保存先パスとメタデータを初期化する', async () => {
      dialog.showSaveDialog.mockResolvedValue('/saved/path.json');
      repo.save.mockResolvedValue(undefined);
      await useCase.saveAs();

      useCase.setMetadata({
        ...DEFAULT_METADATA,
        worldName: '既存プロジェクト',
        worldDescription: '旧設定',
        sliderMin: 100,
        sliderMax: 900,
        settings: {
          ...DEFAULT_METADATA.settings,
          gridColor: '#123456',
        },
      });

      useCase.resetProjectState();

      expect(useCase.getCurrentFilePath()).toBeNull();
      expect(useCase.getMetadata()).toEqual(DEFAULT_METADATA);
    });
  });

  describe('getCurrentFilePath', () => {
    it('初期状態はnull', () => {
      expect(useCase.getCurrentFilePath()).toBeNull();
    });

    it('保存後にパスが設定される', async () => {
      dialog.showSaveDialog.mockResolvedValue('/saved/path.json');
      repo.save.mockResolvedValue(undefined);
      await useCase.saveAs();

      expect(useCase.getCurrentFilePath()).toBe('/saved/path.json');
    });
  });
});
