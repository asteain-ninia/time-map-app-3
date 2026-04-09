import { describe, it, expect } from 'vitest';
import {
  detectSpatialConflicts,
  detectConflictsForFeature,
} from '@domain/services/ConflictDetectionService';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import type { FeatureShape, AnchorProperty, AnchorPlacement } from '@domain/value-objects/FeatureAnchor';

// ---- ヘルパー ----

const time100 = new TimePoint(100);

function makeVertex(id: string, x: number, y: number): Vertex {
  return new Vertex(id, new Coordinate(x, y));
}

function makePolygonFeature(
  featureId: string,
  layerId: string,
  vertexIds: string[],
  time: TimePoint = time100
): Feature {
  return makePolygonFeatureWithRings(featureId, layerId, [
    { id: 'ring-1', vertexIds, ringType: 'territory', parentId: null },
  ], time);
}

function makePolygonFeatureWithRings(
  featureId: string,
  layerId: string,
  rings: readonly {
    id: string;
    vertexIds: string[];
    ringType: 'territory' | 'hole';
    parentId: string | null;
  }[],
  time: TimePoint = time100
): Feature {
  const shape: FeatureShape = {
    type: 'Polygon',
    rings: rings.map((ring) => new Ring(ring.id, ring.vertexIds, ring.ringType, ring.parentId)),
  };
  const property: AnchorProperty = { name: 'test', description: '' };
  const placement: AnchorPlacement = { layerId, parentId: null, childIds: [] };
  const anchor = new FeatureAnchor('a-1', { start: time }, property, shape, placement);
  return new Feature(featureId, 'Polygon', [anchor]);
}

function makeLineFeature(
  featureId: string,
  layerId: string,
  vertexIds: string[],
  time: TimePoint = time100
): Feature {
  const shape: FeatureShape = { type: 'LineString', vertexIds };
  const property: AnchorProperty = { name: 'test', description: '' };
  const placement: AnchorPlacement = { layerId, parentId: null, childIds: [] };
  const anchor = new FeatureAnchor('a-1', { start: time }, property, shape, placement);
  return new Feature(featureId, 'Line', [anchor]);
}

// 2つの重なる正方形
const vertices = new Map<string, Vertex>([
  // squareA: (0,0)-(10,10)
  ['vA1', makeVertex('vA1', 0, 0)],
  ['vA2', makeVertex('vA2', 10, 0)],
  ['vA3', makeVertex('vA3', 10, 10)],
  ['vA4', makeVertex('vA4', 0, 10)],
  // squareB: (5,0)-(15,10) — squareAと重なる
  ['vB1', makeVertex('vB1', 5, 0)],
  ['vB2', makeVertex('vB2', 15, 0)],
  ['vB3', makeVertex('vB3', 15, 10)],
  ['vB4', makeVertex('vB4', 5, 10)],
  // squareC: (20,0)-(30,10) — 離れている
  ['vC1', makeVertex('vC1', 20, 0)],
  ['vC2', makeVertex('vC2', 30, 0)],
  ['vC3', makeVertex('vC3', 30, 10)],
  ['vC4', makeVertex('vC4', 20, 10)],
  // outerWithHole: (0,0)-(20,20)
  ['vD1', makeVertex('vD1', 0, 0)],
  ['vD2', makeVertex('vD2', 20, 0)],
  ['vD3', makeVertex('vD3', 20, 20)],
  ['vD4', makeVertex('vD4', 0, 20)],
  // hole: (5,5)-(15,15)
  ['vH1', makeVertex('vH1', 5, 5)],
  ['vH2', makeVertex('vH2', 15, 5)],
  ['vH3', makeVertex('vH3', 15, 15)],
  ['vH4', makeVertex('vH4', 5, 15)],
  // exclave in hole: (7,7)-(9,9)
  ['vI1', makeVertex('vI1', 7, 7)],
  ['vI2', makeVertex('vI2', 9, 7)],
  ['vI3', makeVertex('vI3', 9, 9)],
  ['vI4', makeVertex('vI4', 7, 9)],
  // polygon fully inside hole but outside exclave: (11,11)-(13,13)
  ['vP1', makeVertex('vP1', 11, 11)],
  ['vP2', makeVertex('vP2', 13, 11)],
  ['vP3', makeVertex('vP3', 13, 13)],
  ['vP4', makeVertex('vP4', 11, 13)],
  // polygon overlapping exclave: (8,8)-(10,10)
  ['vQ1', makeVertex('vQ1', 8, 8)],
  ['vQ2', makeVertex('vQ2', 10, 8)],
  ['vQ3', makeVertex('vQ3', 10, 10)],
  ['vQ4', makeVertex('vQ4', 8, 10)],
  // wrapped squareA: (190,0)-(200,10)
  ['vW1', makeVertex('vW1', 190, 0)],
  ['vW2', makeVertex('vW2', 200, 0)],
  ['vW3', makeVertex('vW3', 200, 10)],
  ['vW4', makeVertex('vW4', 190, 10)],
  // wrapped squareB: (-175,0)-(-165,10) -> +360 で wrapped squareA と重なる
  ['vX1', makeVertex('vX1', -175, 0)],
  ['vX2', makeVertex('vX2', -165, 0)],
  ['vX3', makeVertex('vX3', -165, 10)],
  ['vX4', makeVertex('vX4', -175, 10)],
]);

// ---- テスト ----

describe('ConflictDetectionService', () => {
  describe('detectSpatialConflicts', () => {
    it('同一レイヤーで重なるポリゴンを競合として検出する', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']);
      const result = detectSpatialConflicts([featureA, featureB], vertices, time100);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].featureIdA).toBe('f1');
      expect(result.conflicts[0].featureIdB).toBe('f2');
      expect(result.conflicts[0].layerId).toBe('layer-1');
    });

    it('異なるレイヤーのポリゴンは競合しない', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-2', ['vB1', 'vB2', 'vB3', 'vB4']);
      const result = detectSpatialConflicts([featureA, featureB], vertices, time100);

      expect(result.hasConflicts).toBe(false);
    });

    it('重ならないポリゴンは競合しない', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureC = makePolygonFeature('f3', 'layer-1', ['vC1', 'vC2', 'vC3', 'vC4']);
      const result = detectSpatialConflicts([featureA, featureC], vertices, time100);

      expect(result.hasConflicts).toBe(false);
    });

    it('ポリゴン以外の地物は無視される', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const lineFeature = makeLineFeature('f-line', 'layer-1', ['vB1', 'vB2']);
      const result = detectSpatialConflicts([featureA, lineFeature], vertices, time100);

      expect(result.hasConflicts).toBe(false);
    });

    it('指定時刻でアクティブでない地物は無視される', () => {
      const time200 = new TimePoint(200);
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4'], time100);
      const featureB = makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4'], time200);
      // time100ではfeatureBはまだアクティブ（start=200 > 100）
      const result = detectSpatialConflicts([featureA, featureB], vertices, time100);

      expect(result.hasConflicts).toBe(false);
    });

    it('3つのポリゴンで複数の競合を検出する', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']);
      const featureC = makePolygonFeature('f3', 'layer-1', ['vC1', 'vC2', 'vC3', 'vC4']);
      const result = detectSpatialConflicts([featureA, featureB, featureC], vertices, time100);

      // f1-f2は重なる、f1-f3とf2-f3は重ならない
      expect(result.conflicts.length).toBe(1);
    });

    it('targetLayerIdsでフィルタリングできる', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']);
      // layer-2のみ指定 → layer-1の競合は検出されない
      const result = detectSpatialConflicts(
        [featureA, featureB], vertices, time100, new Set(['layer-2'])
      );

      expect(result.hasConflicts).toBe(false);
    });

    it('空の地物リストでは競合なし', () => {
      const result = detectSpatialConflicts([], vertices, time100);
      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toEqual([]);
    });

    it('穴の内部にある別地物は競合として検出しない', () => {
      const featureWithHole = makePolygonFeatureWithRings('f-hole', 'layer-1', [
        { id: 'outer', vertexIds: ['vD1', 'vD2', 'vD3', 'vD4'], ringType: 'territory', parentId: null },
        { id: 'hole', vertexIds: ['vH1', 'vH2', 'vH3', 'vH4'], ringType: 'hole', parentId: 'outer' },
      ]);
      const featureInsideHole = makePolygonFeature('f-inside', 'layer-1', ['vP1', 'vP2', 'vP3', 'vP4']);

      const result = detectSpatialConflicts([featureWithHole, featureInsideHole], vertices, time100);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toEqual([]);
    });

    it('穴の中の飛び地と重なる別地物は競合として検出する', () => {
      const featureWithNestedTerritory = makePolygonFeatureWithRings('f-hole', 'layer-1', [
        { id: 'outer', vertexIds: ['vD1', 'vD2', 'vD3', 'vD4'], ringType: 'territory', parentId: null },
        { id: 'hole', vertexIds: ['vH1', 'vH2', 'vH3', 'vH4'], ringType: 'hole', parentId: 'outer' },
        { id: 'island', vertexIds: ['vI1', 'vI2', 'vI3', 'vI4'], ringType: 'territory', parentId: 'hole' },
      ]);
      const overlappingFeature = makePolygonFeature('f-overlap', 'layer-1', ['vQ1', 'vQ2', 'vQ3', 'vQ4']);

      const result = detectSpatialConflicts([featureWithNestedTerritory, overlappingFeature], vertices, time100);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].featureIdA).toBe('f-hole');
      expect(result.conflicts[0].featureIdB).toBe('f-overlap');
    });

    it('競合IDは一意である', () => {
      // 同じレイヤーに3つの重なるポリゴンを配置 → 3つの競合ペア
      const features = [
        makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']),
        makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']),
        // f3はf1とf2の中間に配置（両方と重なる）
        makePolygonFeature('f3', 'layer-1', ['vA2', 'vB2', 'vB3', 'vA3']),
      ];
      const result = detectSpatialConflicts(features, vertices, time100);
      const ids = result.conflicts.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('180度超に延伸したポリゴンと通常範囲のポリゴンの重なりも検出する', () => {
      const featureA = makePolygonFeature('f-wrap-a', 'layer-1', ['vW1', 'vW2', 'vW3', 'vW4']);
      const featureB = makePolygonFeature('f-wrap-b', 'layer-1', ['vX1', 'vX2', 'vX3', 'vX4']);

      const result = detectSpatialConflicts([featureA, featureB], vertices, time100);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].featureIdA).toBe('f-wrap-a');
      expect(result.conflicts[0].featureIdB).toBe('f-wrap-b');
    });
  });

  describe('detectConflictsForFeature', () => {
    it('特定の地物に関する競合のみ返す', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']);
      const featureC = makePolygonFeature('f3', 'layer-1', ['vC1', 'vC2', 'vC3', 'vC4']);

      const conflicts = detectConflictsForFeature(
        'f1', [featureA, featureB, featureC], vertices, time100
      );

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].featureIdA).toBe('f1');
      expect(conflicts[0].featureIdB).toBe('f2');
    });

    it('対象がポリゴンでなければ空配列', () => {
      const lineFeature = makeLineFeature('f-line', 'layer-1', ['vA1', 'vA2']);
      const conflicts = detectConflictsForFeature(
        'f-line', [lineFeature], vertices, time100
      );

      expect(conflicts).toEqual([]);
    });

    it('対象が存在しなければ空配列', () => {
      const conflicts = detectConflictsForFeature(
        'f-missing', [], vertices, time100
      );
      expect(conflicts).toEqual([]);
    });

    it('異なるレイヤーの地物とは競合しない', () => {
      const featureA = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const featureB = makePolygonFeature('f2', 'layer-2', ['vB1', 'vB2', 'vB3', 'vB4']);
      const conflicts = detectConflictsForFeature(
        'f1', [featureA, featureB], vertices, time100
      );

      expect(conflicts).toEqual([]);
    });

    it('一覧に未登録の仮想ポリゴンでも競合を検出できる', () => {
      const existing = makePolygonFeature('f1', 'layer-1', ['vA1', 'vA2', 'vA3', 'vA4']);
      const transient = makePolygonFeature('f-temp', 'layer-1', ['vB1', 'vB2', 'vB3', 'vB4']);

      const conflicts = detectConflictsForFeature(
        transient,
        [existing],
        vertices,
        time100,
        'layer-1'
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].featureIdA).toBe('f-temp');
      expect(conflicts[0].featureIdB).toBe('f1');
    });

    it('穴の内部にある別地物は対象地物の競合として返さない', () => {
      const featureWithHole = makePolygonFeatureWithRings('f-hole', 'layer-1', [
        { id: 'outer', vertexIds: ['vD1', 'vD2', 'vD3', 'vD4'], ringType: 'territory', parentId: null },
        { id: 'hole', vertexIds: ['vH1', 'vH2', 'vH3', 'vH4'], ringType: 'hole', parentId: 'outer' },
      ]);
      const featureInsideHole = makePolygonFeature('f-inside', 'layer-1', ['vP1', 'vP2', 'vP3', 'vP4']);

      const conflicts = detectConflictsForFeature(
        'f-inside',
        [featureWithHole, featureInsideHole],
        vertices,
        time100
      );

      expect(conflicts).toEqual([]);
    });

    it('180度超に延伸したポリゴンとの競合も対象地物ベースで検出できる', () => {
      const featureA = makePolygonFeature('f-wrap-a', 'layer-1', ['vW1', 'vW2', 'vW3', 'vW4']);
      const featureB = makePolygonFeature('f-wrap-b', 'layer-1', ['vX1', 'vX2', 'vX3', 'vX4']);

      const conflicts = detectConflictsForFeature(
        'f-wrap-a',
        [featureA, featureB],
        vertices,
        time100
      );

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].featureIdA).toBe('f-wrap-a');
      expect(conflicts[0].featureIdB).toBe('f-wrap-b');
    });
  });
});
