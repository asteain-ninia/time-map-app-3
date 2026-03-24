import { describe, it, expect } from 'vitest';
import { Ring } from '@domain/value-objects/Ring';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import {
  getShapeVertexGroups,
  getUniqueVertexIds,
  getShapeEdges,
} from '@infrastructure/rendering/vertexHandleUtils';

describe('vertexHandleUtils', () => {
  // --- getShapeVertexGroups ---

  describe('getShapeVertexGroups', () => {
    it('Point: 単一頂点IDを返す', () => {
      const shape: FeatureShape = { type: 'Point', vertexId: 'v1' };
      expect(getShapeVertexGroups(shape)).toEqual([['v1']]);
    });

    it('LineString: 頂点ID列を1グループで返す', () => {
      const shape: FeatureShape = { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] };
      expect(getShapeVertexGroups(shape)).toEqual([['v1', 'v2', 'v3']]);
    });

    it('Polygon: リングごとにグループを返す', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null),
          new Ring('r2', ['v4', 'v5', 'v6'], 'hole', 'r1'),
        ],
      };
      expect(getShapeVertexGroups(shape)).toEqual([
        ['v1', 'v2', 'v3'],
        ['v4', 'v5', 'v6'],
      ]);
    });
  });

  // --- getUniqueVertexIds ---

  describe('getUniqueVertexIds', () => {
    it('Point: 1つのIDを返す', () => {
      const shape: FeatureShape = { type: 'Point', vertexId: 'v1' };
      expect(getUniqueVertexIds(shape)).toEqual(['v1']);
    });

    it('LineString: 全IDを返す', () => {
      const shape: FeatureShape = { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] };
      expect(getUniqueVertexIds(shape)).toEqual(['v1', 'v2', 'v3']);
    });

    it('Polygon: リング間で重複を排除する', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null),
          new Ring('r2', ['v2', 'v4', 'v5'], 'hole', 'r1'),
        ],
      };
      const ids = getUniqueVertexIds(shape);
      expect(ids).toHaveLength(5);
      expect(new Set(ids)).toEqual(new Set(['v1', 'v2', 'v3', 'v4', 'v5']));
    });
  });

  // --- getShapeEdges ---

  describe('getShapeEdges', () => {
    it('Point: エッジなし', () => {
      const shape: FeatureShape = { type: 'Point', vertexId: 'v1' };
      expect(getShapeEdges(shape)).toEqual([]);
    });

    it('LineString: 隣接頂点間のエッジ（開いた列）', () => {
      const shape: FeatureShape = { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] };
      expect(getShapeEdges(shape)).toEqual([
        { v1: 'v1', v2: 'v2' },
        { v1: 'v2', v2: 'v3' },
      ]);
    });

    it('LineString: 2頂点では1エッジ', () => {
      const shape: FeatureShape = { type: 'LineString', vertexIds: ['v1', 'v2'] };
      expect(getShapeEdges(shape)).toEqual([{ v1: 'v1', v2: 'v2' }]);
    });

    it('Polygon: リングは閉じたエッジ列（最後→最初のエッジを含む）', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)],
      };
      expect(getShapeEdges(shape)).toEqual([
        { v1: 'v1', v2: 'v2' },
        { v1: 'v2', v2: 'v3' },
        { v1: 'v3', v2: 'v1' },
      ]);
    });

    it('Polygon: 複数リングの全エッジを返す', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null),
          new Ring('r2', ['v4', 'v5', 'v6'], 'hole', 'r1'),
        ],
      };
      const edges = getShapeEdges(shape);
      expect(edges).toHaveLength(6); // 3 edges per ring
      // 外周リング
      expect(edges[0]).toEqual({ v1: 'v1', v2: 'v2' });
      expect(edges[2]).toEqual({ v1: 'v3', v2: 'v1' });
      // 穴リング
      expect(edges[3]).toEqual({ v1: 'v4', v2: 'v5' });
      expect(edges[5]).toEqual({ v1: 'v6', v2: 'v4' });
    });

    it('Polygon: 2頂点のリングは閉じない', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [new Ring('r1', ['v1', 'v2'], 'territory', null)],
      };
      // 2頂点ではリングとして閉じない（length < 3）
      expect(getShapeEdges(shape)).toEqual([{ v1: 'v1', v2: 'v2' }]);
    });

    it('LineString: 1頂点ではエッジなし', () => {
      const shape: FeatureShape = { type: 'LineString', vertexIds: ['v1'] };
      expect(getShapeEdges(shape)).toEqual([]);
    });

    it('Polygon: 4頂点リングでは4エッジ', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [new Ring('r1', ['v1', 'v2', 'v3', 'v4'], 'territory', null)],
      };
      expect(getShapeEdges(shape)).toEqual([
        { v1: 'v1', v2: 'v2' },
        { v1: 'v2', v2: 'v3' },
        { v1: 'v3', v2: 'v4' },
        { v1: 'v4', v2: 'v1' },
      ]);
    });
  });
});
