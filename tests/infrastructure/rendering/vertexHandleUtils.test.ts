import { describe, it, expect } from 'vitest';
import { Ring } from '@domain/value-objects/Ring';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import {
  getShapeVertexGroups,
  getUniqueVertexIds,
  getShapeEdges,
  getShapeEdgePositions,
  getShapeVertexPositions,
} from '@infrastructure/rendering/vertexHandleUtils';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';

function makeVertices(
  ...defs: Array<[string, number, number]>
): ReadonlyMap<string, Vertex> {
  const map = new Map<string, Vertex>();
  for (const [id, lon, lat] of defs) {
    map.set(id, new Vertex(id, new Coordinate(lon, lat)));
  }
  return map;
}

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

  describe('getShapeVertexPositions', () => {
    it('Point: 主表示帯の外へ出た頂点も生値経度のまま返す', () => {
      const shape: FeatureShape = { type: 'Point', vertexId: 'v1' };
      const vertices = makeVertices(['v1', 195, 0]);

      expect(getShapeVertexPositions(shape, vertices)).toEqual([
        { vertexId: 'v1', x: 195, y: 0 },
      ]);
    });

    it('東西端またぎの頂点も生値経度のまま返す', () => {
      const shape: FeatureShape = {
        type: 'LineString',
        vertexIds: ['v1', 'v2', 'v3'],
      };
      const vertices = makeVertices(
        ['v1', 170, 0],
        ['v2', 190, 0],
        ['v3', 200, 5]
      );

      expect(getShapeVertexPositions(shape, vertices)).toEqual([
        { vertexId: 'v1', x: 170, y: 0 },
        { vertexId: 'v2', x: 190, y: 0 },
        { vertexId: 'v3', x: 200, y: 5 },
      ]);
    });

    it('全頂点が180度を超えたラインでも生値経度を保持する', () => {
      const shape: FeatureShape = {
        type: 'LineString',
        vertexIds: ['v1', 'v2', 'v3'],
      };
      const vertices = makeVertices(
        ['v1', 185, 0],
        ['v2', 195, 0],
        ['v3', 205, 5]
      );

      expect(getShapeVertexPositions(shape, vertices)).toEqual([
        { vertexId: 'v1', x: 185, y: 0 },
        { vertexId: 'v2', x: 195, y: 0 },
        { vertexId: 'v3', x: 205, y: 5 },
      ]);
    });
  });

  describe('getShapeEdgePositions', () => {
    it('閉じリングの終端エッジをファントム経路にしない', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)],
      };
      const vertices = makeVertices(
        ['v1', 170, 0],
        ['v2', 190, 0],
        ['v3', 200, 10]
      );

      expect(getShapeEdgePositions(shape, vertices)).toEqual([
        { v1: 'v1', v2: 'v2', x1: 170, y1: 0, x2: 190, y2: 0 },
        { v1: 'v2', v2: 'v3', x1: 190, y1: 0, x2: 200, y2: 10 },
        { v1: 'v3', v2: 'v1', x1: 200, y1: 10, x2: 170, y2: 0 },
      ]);
    });

    it('穴リングも生値経度のまま保持する', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('outer', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
          new Ring('hole', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer'),
        ],
      };
      const vertices = makeVertices(
        ['v1', 170, -10],
        ['v2', 190, -10],
        ['v3', 190, 10],
        ['v4', 170, 10],
        ['h1', 185, -5],
        ['h2', 175, -5],
        ['h3', 175, 5],
        ['h4', 185, 5]
      );

      const positions = getShapeVertexPositions(shape, vertices);
      expect(positions).toContainEqual({ vertexId: 'h1', x: 185, y: -5 });
      expect(positions).toContainEqual({ vertexId: 'h2', x: 175, y: -5 });
      expect(positions).toContainEqual({ vertexId: 'h3', x: 175, y: 5 });
      expect(positions).toContainEqual({ vertexId: 'h4', x: 185, y: 5 });
    });
  });
});
