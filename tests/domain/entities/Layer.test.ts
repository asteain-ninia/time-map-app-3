import { describe, it, expect } from 'vitest';
import { Layer } from '@domain/entities/Layer';

describe('Layer', () => {
  const layer = new Layer('l1', '国家', 0, true, 0.8, '国家レイヤー');

  describe('constructor', () => {
    it('全プロパティを保持する', () => {
      expect(layer.id).toBe('l1');
      expect(layer.name).toBe('国家');
      expect(layer.order).toBe(0);
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(0.8);
      expect(layer.description).toBe('国家レイヤー');
    });

    it('デフォルト値が適用される', () => {
      const minimal = new Layer('l2', '地形', 1);
      expect(minimal.visible).toBe(true);
      expect(minimal.opacity).toBe(1.0);
      expect(minimal.description).toBe('');
    });
  });

  describe('withXxx メソッド', () => {
    it('withVisible', () => {
      const updated = layer.withVisible(false);
      expect(updated.visible).toBe(false);
      expect(updated.name).toBe('国家');
    });

    it('withOpacity', () => {
      const updated = layer.withOpacity(0.5);
      expect(updated.opacity).toBe(0.5);
    });

    it('withName', () => {
      const updated = layer.withName('地方');
      expect(updated.name).toBe('地方');
    });

    it('withOrder', () => {
      const updated = layer.withOrder(5);
      expect(updated.order).toBe(5);
    });

    it('元のインスタンスは変更しない', () => {
      layer.withVisible(false);
      layer.withOpacity(0.1);
      layer.withName('変更');
      layer.withOrder(99);
      expect(layer.visible).toBe(true);
      expect(layer.opacity).toBe(0.8);
      expect(layer.name).toBe('国家');
      expect(layer.order).toBe(0);
    });
  });

  describe('equals', () => {
    it('同じ id なら true', () => {
      const other = new Layer('l1', '別名', 99);
      expect(layer.equals(other)).toBe(true);
    });

    it('異なる id なら false', () => {
      const other = new Layer('l2', '国家', 0);
      expect(layer.equals(other)).toBe(false);
    });
  });
});
