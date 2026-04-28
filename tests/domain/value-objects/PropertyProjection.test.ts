import { describe, it, expect } from 'vitest';
import {
  PropertyProjection,
  projectFromAnchor,
  projectFromFeature,
  projectAtTime,
} from '@domain/value-objects/PropertyProjection';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import { Feature } from '@domain/entities/Feature';

// --- ヘルパー ---

function makeAnchor(id: string, startYear: number, endYear?: number): FeatureAnchor {
  return new FeatureAnchor(
    id,
    {
      start: new TimePoint(startYear),
      end: endYear !== undefined ? new TimePoint(endYear) : undefined,
    },
    {
      name: `Name-${id}`,
      description: `Desc-${id}`,
      style: { fillColor: '#ff0000', selectedFillColor: '#00ff00', autoColor: false, palette: 'default' },
      attributes: { population: 1000 },
    },
    {
      type: 'Polygon',
      rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)],
    },
    { layerId: 'layer1', parentId: 'parent1', childIds: ['child1', 'child2'], isTopLevel: false }
  );
}

// --- テスト ---

describe('PropertyProjection', () => {
  const anchor = makeAnchor('a1', 2000, 2100);
  const feature = new Feature('f1', 'Polygon', [
    makeAnchor('a1', 2000, 2050),
    makeAnchor('a2', 2050, 2100),
  ]);

  describe('projectFromAnchor', () => {
    it('錨からすべてのプロパティを投影する', () => {
      const proj = projectFromAnchor(anchor, 'f1', 'Polygon');
      expect(proj.anchorId).toBe('a1');
      expect(proj.featureId).toBe('f1');
      expect(proj.name).toBe('Name-a1');
      expect(proj.description).toBe('Desc-a1');
      expect(proj.start.year).toBe(2000);
      expect(proj.end?.year).toBe(2100);
      expect(proj.featureType).toBe('Polygon');
      expect(proj.layerId).toBe('layer1');
      expect(proj.parentId).toBe('parent1');
      expect(proj.childIds).toEqual(['child1', 'child2']);
      expect(proj.isTopLevel).toBe(false);
      expect(proj.style?.fillColor).toBe('#ff0000');
      expect(proj.attributes).toEqual({ population: 1000 });
    });

    it('endが未定義の錨', () => {
      const openAnchor = makeAnchor('a-open', 2000);
      const proj = projectFromAnchor(openAnchor, 'f2', 'Point');
      expect(proj.end).toBeUndefined();
    });

    it('属性がない錨はデフォルト空オブジェクト', () => {
      const simpleAnchor = new FeatureAnchor(
        'simple',
        { start: new TimePoint(2000) },
        { name: 'test', description: '' },
        { type: 'Point', vertexId: 'v1' },
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      );
      const proj = projectFromAnchor(simpleAnchor, 'f3', 'Point');
      expect(proj.attributes).toEqual({});
      expect(proj.style).toBeUndefined();
      expect(proj.parentId).toBeNull();
      expect(proj.childIds).toEqual([]);
      expect(proj.kind).toBeUndefined();
    });

    it('kind が錨に設定されていれば投影へ反映される', () => {
      const kindedAnchor = new FeatureAnchor(
        'kinded',
        { start: new TimePoint(2000) },
        { name: '東京都', description: '', kind: '都' },
        { type: 'Point', vertexId: 'v1' },
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      );
      const proj = projectFromAnchor(kindedAnchor, 'f-k', 'Point');
      expect(proj.kind).toBe('都');
    });
  });

  describe('projectFromFeature', () => {
    it('地物の全錨を投影する', () => {
      const projections = projectFromFeature(feature);
      expect(projections).toHaveLength(2);
      expect(projections[0].anchorId).toBe('a1');
      expect(projections[1].anchorId).toBe('a2');
      expect(projections[0].featureId).toBe('f1');
      expect(projections[0].featureType).toBe('Polygon');
    });

    it('錨のない地物は空配列', () => {
      const emptyFeature = new Feature('f-empty', 'Point', []);
      expect(projectFromFeature(emptyFeature)).toHaveLength(0);
    });
  });

  describe('projectAtTime', () => {
    it('指定時刻で有効な錨の投影を返す', () => {
      const proj = projectAtTime(feature, new TimePoint(2025));
      expect(proj).toBeDefined();
      expect(proj!.anchorId).toBe('a1');
    });

    it('2番目の錨の時間帯', () => {
      const proj = projectAtTime(feature, new TimePoint(2075));
      expect(proj).toBeDefined();
      expect(proj!.anchorId).toBe('a2');
    });

    it('地物が存在しない時刻はundefined', () => {
      expect(projectAtTime(feature, new TimePoint(1900))).toBeUndefined();
    });

    it('地物が存在しない時刻（終了後）はundefined', () => {
      expect(projectAtTime(feature, new TimePoint(2200))).toBeUndefined();
    });
  });

  describe('PropertyProjectionインスタンス', () => {
    it('読み取り専用であること（型レベルで保証）', () => {
      const proj = projectFromAnchor(anchor, 'f1', 'Polygon');
      // 型が正しいことを確認
      expect(proj).toBeInstanceOf(PropertyProjection);
    });
  });
});
