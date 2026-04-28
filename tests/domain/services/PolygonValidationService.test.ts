import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { validatePolygonFeature } from '@domain/services/PolygonValidationService';

const time100 = new TimePoint(100);

function makeVertex(id: string, x: number, y: number): Vertex {
  return new Vertex(id, new Coordinate(x, y));
}

function makePolygonFeature(
  featureId: string,
  layerId: string,
  rings: readonly {
    id: string;
    vertexIds: string[];
    ringType: 'territory' | 'hole';
    parentId: string | null;
  }[]
): Feature {
  return new Feature(featureId, 'Polygon', [
    new FeatureAnchor(
      `${featureId}-anchor`,
      { start: time100 },
      { name: featureId, description: '' },
      {
        type: 'Polygon',
        rings: rings.map((ring) => new Ring(ring.id, ring.vertexIds, ring.ringType, ring.parentId)),
      },
      { layerId, parentId: null, childIds: [], isTopLevel: true }
    ),
  ]);
}

function makePointFeature(featureId: string, layerId: string, vertexId: string): Feature {
  return new Feature(featureId, 'Point', [
    new FeatureAnchor(
      `${featureId}-anchor`,
      { start: time100 },
      { name: featureId, description: '' },
      { type: 'Point', vertexId },
      { layerId, parentId: null, childIds: [], isTopLevel: true }
    ),
  ]);
}

describe('PolygonValidationService', () => {
  it('正常なポリゴンならisValid=trueを返す', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
      ['a4', makeVertex('a4', 0, 10)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'ring-1', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);

    expect(validatePolygonFeature(feature, [feature], vertices, time100)).toEqual({
      selfIntersectingRingIds: [],
      ringValidationErrors: [],
      conflicts: [],
      isValid: true,
    });
  });

  it('非ポリゴン地物は検証をスキップしてisValid=trueを返す', () => {
    const vertices = new Map<string, Vertex>([
      ['p1', makeVertex('p1', 0, 0)],
    ]);
    const feature = makePointFeature('point-1', 'layer-1', 'p1');

    expect(validatePolygonFeature(feature, [feature], vertices, time100)).toEqual({
      selfIntersectingRingIds: [],
      ringValidationErrors: [],
      conflicts: [],
      isValid: true,
    });
  });

  it('自己交差リングをselfIntersectingRingIdsへ含める', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 10)],
      ['a3', makeVertex('a3', 10, 0)],
      ['a4', makeVertex('a4', 0, 10)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'ring-bowtie', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);

    const result = validatePolygonFeature(feature, [feature], vertices, time100);

    expect(result.isValid).toBe(false);
    expect(result.selfIntersectingRingIds).toEqual(['ring-bowtie']);
  });

  it('リング階層不正をringValidationErrorsへ含める', () => {
    const vertices = new Map<string, Vertex>([
      ['o1', makeVertex('o1', 0, 0)],
      ['o2', makeVertex('o2', 20, 0)],
      ['o3', makeVertex('o3', 20, 20)],
      ['o4', makeVertex('o4', 0, 20)],
      ['h1', makeVertex('h1', 4, 4)],
      ['h2', makeVertex('h2', 16, 4)],
      ['h3', makeVertex('h3', 24, 16)],
      ['h4', makeVertex('h4', 4, 16)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['o1', 'o2', 'o3', 'o4'], ringType: 'territory', parentId: null },
      { id: 'hole', vertexIds: ['h1', 'h2', 'h3', 'h4'], ringType: 'hole', parentId: 'outer' },
    ]);

    const result = validatePolygonFeature(feature, [feature], vertices, time100);

    expect(result.isValid).toBe(false);
    expect(result.ringValidationErrors.some((error) => error.message.includes('親リングの内部に完全に収まっていません'))).toBe(true);
  });

  it('同一レイヤー重複をconflictsへ含める', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
      ['a4', makeVertex('a4', 0, 10)],
      ['b1', makeVertex('b1', 5, 0)],
      ['b2', makeVertex('b2', 15, 0)],
      ['b3', makeVertex('b3', 15, 10)],
      ['b4', makeVertex('b4', 5, 10)],
    ]);
    const target = makePolygonFeature('polygon-target', 'layer-1', [
      { id: 'ring-a', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);
    const other = makePolygonFeature('polygon-other', 'layer-1', [
      { id: 'ring-b', vertexIds: ['b1', 'b2', 'b3', 'b4'], ringType: 'territory', parentId: null },
    ]);

    const result = validatePolygonFeature(target, [target, other], vertices, time100);

    expect(result.isValid).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].featureIdA).toBe('polygon-target');
    expect(result.conflicts[0].featureIdB).toBe('polygon-other');
  });

  it('存在しない頂点IDを含むリングではエラーを投げる', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'ring-1', vertexIds: ['a1', 'missing', 'a2', 'a3'], ringType: 'territory', parentId: null },
    ]);

    expect(() => validatePolygonFeature(feature, [feature], vertices, time100))
      .toThrow('Vertex "missing" not found');
  });
});
