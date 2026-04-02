import { describe, it, expect, vi, afterEach } from 'vitest';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { eventBus } from '@application/EventBus';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('ManageLayersUseCase', () => {
  let useCase: ManageLayersUseCase;

  afterEach(() => {
    eventBus.clear();
  });

  describe('addLayer', () => {
    it('レイヤーを追加できる', () => {
      useCase = new ManageLayersUseCase();
      const layer = useCase.addLayer('l1', '国家');
      expect(layer.id).toBe('l1');
      expect(layer.name).toBe('国家');
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(1.0);
    });

    it('追加順に序列が割り振られる', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.addLayer('l2', '地方');
      const layers = useCase.getLayers();
      expect(layers[0].order).toBe(0);
      expect(layers[1].order).toBe(1);
    });

    it('getLayers で一覧を取得できる', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.addLayer('l2', '地方');
      expect(useCase.getLayers().length).toBe(2);
    });

    it('layers:changed イベントを発行する', () => {
      useCase = new ManageLayersUseCase();
      const listener = vi.fn();
      const unsub = eventBus.on('layers:changed', listener);

      useCase.addLayer('l1', '国家');

      expect(listener).toHaveBeenCalledWith({});
      unsub();
    });
  });

  describe('getLayerById', () => {
    it('存在するIDのレイヤーを返す', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      expect(useCase.getLayerById('l1')?.name).toBe('国家');
    });

    it('存在しないIDなら undefined', () => {
      useCase = new ManageLayersUseCase();
      expect(useCase.getLayerById('xxx')).toBeUndefined();
    });
  });

  describe('toggleVisibility', () => {
    it('表示→非表示に切り替える', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.toggleVisibility('l1');
      expect(useCase.getLayerById('l1')?.visible).toBe(false);
    });

    it('非表示→表示に戻す', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.toggleVisibility('l1');
      useCase.toggleVisibility('l1');
      expect(useCase.getLayerById('l1')?.visible).toBe(true);
    });

    it('layer:visibilityChanged イベントを発行する', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      const listener = vi.fn();
      const unsub = eventBus.on('layer:visibilityChanged', listener);

      useCase.toggleVisibility('l1');

      expect(listener).toHaveBeenCalledWith({ layerId: 'l1', visible: false });
      unsub();
    });

    it('存在しないIDでは何もしない', () => {
      useCase = new ManageLayersUseCase();
      const listener = vi.fn();
      const unsub = eventBus.on('layer:visibilityChanged', listener);

      useCase.toggleVisibility('xxx');

      expect(listener).not.toHaveBeenCalled();
      unsub();
    });
  });

  describe('setOpacity', () => {
    it('透明度を変更する', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.setOpacity('l1', 0.5);
      expect(useCase.getLayerById('l1')?.opacity).toBe(0.5);
    });

    it('0未満は0にクランプする', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.setOpacity('l1', -0.5);
      expect(useCase.getLayerById('l1')?.opacity).toBe(0);
    });

    it('1超は1にクランプする', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.setOpacity('l1', 1.5);
      expect(useCase.getLayerById('l1')?.opacity).toBe(1);
    });
  });

  describe('rename', () => {
    it('レイヤー名を変更する', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      useCase.rename('l1', '帝国');
      expect(useCase.getLayerById('l1')?.name).toBe('帝国');
    });

    it('存在しないIDでは何もしない', () => {
      useCase = new ManageLayersUseCase();
      useCase.rename('xxx', '存在しない');
      expect(useCase.getLayers().length).toBe(0);
    });

    it('名前変更でも layers:changed を発行する', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '国家');
      const listener = vi.fn();
      const unsub = eventBus.on('layers:changed', listener);

      useCase.rename('l1', '帝国');

      expect(listener).toHaveBeenCalledWith({});
      unsub();
    });
  });

  describe('deleteLayer', () => {
    it('地物のないレイヤーを削除できる', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', '空レイヤー');

      const result = useCase.deleteLayer('l1', []);
      expect(result).toBe(true);
      expect(useCase.getLayers()).toHaveLength(0);
    });

    it('地物が所属するレイヤーは削除できない', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', 'テスト');

      const feature = new Feature('f1', 'Point', [
        new FeatureAnchor(
          'a1',
          { start: new TimePoint(2000) },
          { name: 'test', description: '' },
          { type: 'Point', vertexId: 'v1' },
          { layerId: 'l1', parentId: null, childIds: [] }
        ),
      ]);

      const result = useCase.deleteLayer('l1', [feature]);
      expect(result).toBe(false);
      expect(useCase.getLayers()).toHaveLength(1);
    });

    it('存在しないレイヤーIDはfalseを返す', () => {
      useCase = new ManageLayersUseCase();
      expect(useCase.deleteLayer('nonexistent', [])).toBe(false);
    });

    it('異なるレイヤーの地物は影響しない', () => {
      useCase = new ManageLayersUseCase();
      useCase.addLayer('l1', 'レイヤー1');
      useCase.addLayer('l2', 'レイヤー2');

      const feature = new Feature('f1', 'Point', [
        new FeatureAnchor(
          'a1',
          { start: new TimePoint(2000) },
          { name: 'test', description: '' },
          { type: 'Point', vertexId: 'v1' },
          { layerId: 'l2', parentId: null, childIds: [] }
        ),
      ]);

      // l1にはf1が所属していないので削除可能
      expect(useCase.deleteLayer('l1', [feature])).toBe(true);
      expect(useCase.getLayers()).toHaveLength(1);
    });
  });
});
