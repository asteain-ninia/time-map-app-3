import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import type { AnchorProperty, AnchorPlacement, FeatureShape } from '@domain/value-objects/FeatureAnchor';

const defaultProperty: AnchorProperty = { name: 'テスト国', description: '' };
const defaultShape: FeatureShape = { type: 'Point', vertexId: 'v1' };
const defaultPlacement: AnchorPlacement = { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true };

function anchor(id: string, startYear: number, endYear?: number, name?: string): FeatureAnchor {
  return new FeatureAnchor(
    id,
    { start: new TimePoint(startYear), end: endYear !== undefined ? new TimePoint(endYear) : undefined },
    name ? { name, description: '' } : defaultProperty,
    defaultShape,
    defaultPlacement
  );
}

describe('Feature', () => {
  describe('getActiveAnchor', () => {
    const feature = new Feature('f1', 'Point', [
      anchor('a1', 1000, 1500),
      anchor('a2', 1500, 2000),
    ]);

    it('該当時間の錨を返す', () => {
      expect(feature.getActiveAnchor(new TimePoint(1200))?.id).toBe('a1');
    });

    it('複数の錨がある場合、後の錨を優先する（逆順探索）', () => {
      expect(feature.getActiveAnchor(new TimePoint(1500))?.id).toBe('a2');
    });

    it('範囲外なら undefined', () => {
      expect(feature.getActiveAnchor(new TimePoint(500))).toBeUndefined();
    });

    it('全錨の終了時刻以降なら undefined', () => {
      expect(feature.getActiveAnchor(new TimePoint(2000))).toBeUndefined();
    });
  });

  describe('existsAt', () => {
    const feature = new Feature('f1', 'Point', [
      anchor('a1', 1000, 2000),
    ]);

    it('錨の範囲内なら true', () => {
      expect(feature.existsAt(new TimePoint(1500))).toBe(true);
    });

    it('錨の範囲外なら false', () => {
      expect(feature.existsAt(new TimePoint(500))).toBe(false);
    });
  });

  describe('getNameAt', () => {
    const feature = new Feature('f1', 'Polygon', [
      anchor('a1', 1000, 1500, '旧名'),
      anchor('a2', 1500, 2000, '新名'),
    ]);

    it('該当時間の名前を返す', () => {
      expect(feature.getNameAt(new TimePoint(1200))).toBe('旧名');
      expect(feature.getNameAt(new TimePoint(1700))).toBe('新名');
    });

    it('範囲外なら undefined', () => {
      expect(feature.getNameAt(new TimePoint(500))).toBeUndefined();
    });
  });

  describe('withAnchors', () => {
    const feature = new Feature('f1', 'Point', [anchor('a1', 1000, 2000)]);

    it('新しい錨リストで新インスタンスを返す', () => {
      const newAnchors = [anchor('a2', 3000, 4000)];
      const updated = feature.withAnchors(newAnchors);
      expect(updated.anchors.length).toBe(1);
      expect(updated.anchors[0].id).toBe('a2');
      expect(updated.id).toBe('f1');
    });

    it('元のインスタンスは変更しない', () => {
      feature.withAnchors([]);
      expect(feature.anchors.length).toBe(1);
    });
  });
});
