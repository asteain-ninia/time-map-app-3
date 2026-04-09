import { describe, expect, it } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { SaveLoadUseCase } from '@application/SaveLoadUseCase';
import {
  FeatureQueryService,
  LayerQueryService,
  TimelineQueryService,
  ProjectQueryService,
} from '@application/queries';
import { Feature } from '@domain/entities/Feature';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { ConfigManager } from '@infrastructure/ConfigManager';

describe('Query services', () => {
  it('FeatureQueryServiceは地物ゼロ時に空配列を返す', () => {
    const query = new FeatureQueryService(new AddFeatureUseCase());

    expect(query.getFeatures()).toEqual([]);
  });

  it('FeatureQueryServiceの返り値配列を変更しても内部状態へ影響しない', () => {
    const addFeature = new AddFeatureUseCase();
    const feature = addFeature.addPoint(
      new Coordinate(10, 20),
      'layer-1',
      new TimePoint(1200)
    );
    const query = new FeatureQueryService(addFeature);
    const features = query.getFeatures() as Feature[];

    features.length = 0;

    expect(query.getFeatures()).toHaveLength(1);
    expect(query.getFeatureById(feature.id)?.id).toBe(feature.id);
  });

  it('FeatureQueryServiceは地物とスナップショット化された頂点情報を返す', () => {
    const addFeature = new AddFeatureUseCase();
    const feature = addFeature.addPoint(
      new Coordinate(10, 20),
      'layer-1',
      new TimePoint(1200)
    );

    addFeature.restore(
      addFeature.getFeaturesMap(),
      addFeature.getVertices(),
      new Map([
        [
          'shared-1',
          new SharedVertexGroup(
            'shared-1',
            ['v-1'],
            new Coordinate(10, 20)
          ),
        ],
      ])
    );

    const query = new FeatureQueryService(addFeature);
    const vertices = query.getVertices() as Map<string, unknown>;
    const sharedGroups = query.getSharedVertexGroups() as Map<string, unknown>;

    vertices.clear();
    sharedGroups.clear();

    expect(query.getFeatureById(feature.id)?.id).toBe(feature.id);
    expect(addFeature.getVertices().size).toBe(1);
    expect(addFeature.getSharedVertexGroups().size).toBe(1);
  });

  it('LayerQueryServiceはレイヤー一覧のコピーとID検索を返す', () => {
    const manageLayers = new ManageLayersUseCase();
    manageLayers.addLayer('layer-1', '第1層');
    manageLayers.addLayer('layer-2', '第2層');

    const query = new LayerQueryService(manageLayers);
    const layers = [...query.getLayers()];
    layers.length = 0;

    expect(query.getLayerById('layer-2')?.name).toBe('第2層');
    expect(manageLayers.getLayers()).toHaveLength(2);
  });

  it('LayerQueryServiceはレイヤーがない場合に空配列を返す', () => {
    const query = new LayerQueryService(new ManageLayersUseCase());

    expect(query.getLayers()).toEqual([]);
  });

  it('LayerQueryServiceは存在しないIDにundefinedを返す', () => {
    const manageLayers = new ManageLayersUseCase();
    manageLayers.addLayer('layer-1', '第1層');

    const query = new LayerQueryService(manageLayers);

    expect(query.getLayerById('missing-layer')).toBeUndefined();
  });

  it('TimelineQueryServiceは現在時刻を追従する', () => {
    const navigateTime = new NavigateTimeUseCase(new TimePoint(1200, 2, 3));
    const query = new TimelineQueryService(navigateTime);

    navigateTime.navigateTo(new TimePoint(1300, 4, 5));

    expect(query.getCurrentTime().year).toBe(1300);
    expect(query.getCurrentTime().month).toBe(4);
    expect(query.getCurrentTime().day).toBe(5);
  });

  it('TimelineQueryServiceは初期時刻をそのまま返す', () => {
    const query = new TimelineQueryService(new NavigateTimeUseCase());

    expect(query.getCurrentTime()).toEqual(new TimePoint(1000));
  });

  it('ProjectQueryServiceはメタデータ・設定・保存先・アプリ設定を返す', async () => {
    const addFeature = new AddFeatureUseCase();
    const manageLayers = new ManageLayersUseCase();
    const navigateTime = new NavigateTimeUseCase();
    const configManager = new ConfigManager();
    const projectMetadata = {
      ...DEFAULT_METADATA,
      worldName: 'テスト世界',
      settings: {
        ...DEFAULT_METADATA.settings,
        customPalettes: ['海洋::#112244,#334466'],
      },
    };

    const repository = {
      load: async () => new World(
        '1.0.0',
        new Map(),
        new Map(),
        [],
        new Map(),
        [],
        projectMetadata
      ),
      save: async () => undefined,
    };
    const dialog = {
      showOpenDialog: async () => 'world.json',
      showSaveDialog: async () => null,
    };

    const saveLoad = new SaveLoadUseCase(
      repository,
      dialog,
      addFeature,
      manageLayers,
      navigateTime
    );

    saveLoad.setMetadata(projectMetadata);
    configManager.updateAppConfig({
      snapDistancePx: 72,
      renderFps: 30,
    });

    await saveLoad.open();

    const query = new ProjectQueryService(saveLoad, configManager);
    const settings = query.getSettings();
    const metadata = query.getMetadata();
    (settings.customPalettes as string[]).push('破壊::#000000,#111111');
    (metadata.settings.customPalettes as string[]).push('破壊::#222222,#333333');

    expect(query.getMetadata().worldName).toBe('テスト世界');
    expect(query.getCurrentFilePath()).toBe('world.json');
    expect(query.getSettings().customPalettes).toEqual(['海洋::#112244,#334466']);
    expect(query.getAppConfig().snapDistancePx).toBe(72);
    expect(query.getAppConfig().renderFps).toBe(30);
  });

  it('ProjectQueryServiceはメタデータと設定をそれぞれ独立して返す', () => {
    const addFeature = new AddFeatureUseCase();
    const manageLayers = new ManageLayersUseCase();
    const navigateTime = new NavigateTimeUseCase();
    const configManager = new ConfigManager();
    const metadata = {
      ...DEFAULT_METADATA,
      worldName: '検証世界',
      settings: {
        ...DEFAULT_METADATA.settings,
        gridInterval: 25,
        customPalettes: ['夜明け::#111111,#eeeeee'],
      },
    };
    const saveLoad = new SaveLoadUseCase(
      {
        load: async () => World.createEmpty(),
        save: async () => undefined,
      },
      {
        showOpenDialog: async () => null,
        showSaveDialog: async () => null,
      },
      addFeature,
      manageLayers,
      navigateTime
    );

    saveLoad.setMetadata(metadata);

    const query = new ProjectQueryService(saveLoad, configManager);

    expect(query.getMetadata().worldName).toBe('検証世界');
    expect(query.getSettings().gridInterval).toBe(25);
    expect(query.getSettings().customPalettes).toEqual(['夜明け::#111111,#eeeeee']);
  });
});
