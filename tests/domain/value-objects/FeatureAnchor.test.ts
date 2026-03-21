import { describe, it, expect } from 'vitest';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { AnchorProperty, AnchorPlacement, FeatureShape, TimeRange } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';

function createAnchor(overrides?: {
  timeRange?: TimeRange;
  property?: AnchorProperty;
  shape?: FeatureShape;
  placement?: AnchorPlacement;
}): FeatureAnchor {
  return new FeatureAnchor(
    'a1',
    overrides?.timeRange ?? { start: new TimePoint(1000), end: new TimePoint(2000) },
    overrides?.property ?? { name: 'テスト国', description: '説明' },
    overrides?.shape ?? { type: 'Point', vertexId: 'v1' },
    overrides?.placement ?? { layerId: 'l1', parentId: null, childIds: [] }
  );
}

describe('FeatureAnchor', () => {
  describe('isActiveAt', () => {
    const anchor = createAnchor({
      timeRange: { start: new TimePoint(1000), end: new TimePoint(2000) },
    });

    it('開始時刻で有効', () => {
      expect(anchor.isActiveAt(new TimePoint(1000))).toBe(true);
    });

    it('範囲内で有効', () => {
      expect(anchor.isActiveAt(new TimePoint(1500))).toBe(true);
    });

    it('終了時刻では無効（半開区間）', () => {
      expect(anchor.isActiveAt(new TimePoint(2000))).toBe(false);
    });

    it('開始前では無効', () => {
      expect(anchor.isActiveAt(new TimePoint(999))).toBe(false);
    });

    it('終了時刻がない場合は開始以降すべて有効', () => {
      const openEnded = createAnchor({
        timeRange: { start: new TimePoint(1000) },
      });
      expect(openEnded.isActiveAt(new TimePoint(9999))).toBe(true);
    });
  });

  describe('withXxx メソッド（イミュータブル更新）', () => {
    const anchor = createAnchor();

    it('withTimeRange は時間範囲のみ変更する', () => {
      const newRange = { start: new TimePoint(500), end: new TimePoint(600) };
      const updated = anchor.withTimeRange(newRange);
      expect(updated.timeRange.start.year).toBe(500);
      expect(updated.property.name).toBe('テスト国');
      expect(updated.id).toBe('a1');
    });

    it('withProperty は属性のみ変更する', () => {
      const updated = anchor.withProperty({ name: '新名称', description: '新説明' });
      expect(updated.property.name).toBe('新名称');
      expect(updated.timeRange.start.year).toBe(1000);
    });

    it('withShape は形状のみ変更する', () => {
      const updated = anchor.withShape({ type: 'LineString', vertexIds: ['v1', 'v2'] });
      expect(updated.shape.type).toBe('LineString');
      expect(updated.property.name).toBe('テスト国');
    });

    it('withPlacement は所属のみ変更する', () => {
      const updated = anchor.withPlacement({ layerId: 'l2', parentId: 'p1', childIds: ['c1'] });
      expect(updated.placement.layerId).toBe('l2');
      expect(updated.placement.parentId).toBe('p1');
    });

    it('元のインスタンスは変更しない', () => {
      anchor.withProperty({ name: '変更', description: '' });
      expect(anchor.property.name).toBe('テスト国');
    });
  });
});
