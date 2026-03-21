import { describe, it, expect, vi, afterEach } from 'vitest';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { eventBus } from '@application/EventBus';

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
  });
});
