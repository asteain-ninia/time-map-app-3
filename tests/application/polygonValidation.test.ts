import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  PolygonValidationError,
  collectImpactedFeatureIdsByVertexIds,
  createTransientPolygonFeature,
  validatePolygonFeatureIdsOrThrow,
  validatePolygonOrThrow,
} from '@application/polygonValidation';

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
      { layerId, parentId: null, childIds: [] }
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
      { layerId, parentId: null, childIds: [] }
    ),
  ]);
}

function makeLineFeature(featureId: string, layerId: string, vertexIds: string[]): Feature {
  return new Feature(featureId, 'Line', [
    new FeatureAnchor(
      `${featureId}-anchor`,
      { start: time100 },
      { name: featureId, description: '' },
      { type: 'LineString', vertexIds },
      { layerId, parentId: null, childIds: [] }
    ),
  ]);
}

describe('polygonValidation', () => {
  it('createTransientPolygonFeatureは3頂点から一時ポリゴンを生成する', () => {
    const { feature, vertices } = createTransientPolygonFeature(
      [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
      'layer-1',
      time100,
      'temp-feature',
      'temp-ring',
      'temp-v'
    );

    expect(feature.id).toBe('temp-feature');
    expect(feature.featureType).toBe('Polygon');
    expect(vertices.size).toBe(3);

    const anchor = feature.getActiveAnchor(time100);
    expect(anchor?.shape).toEqual({
      type: 'Polygon',
      rings: [new Ring('temp-ring', ['temp-v-0', 'temp-v-1', 'temp-v-2'], 'territory', null)],
    });
  });

  it('createTransientPolygonFeatureは緯度を±90にクランプする', () => {
    const { vertices } = createTransientPolygonFeature(
      [new Coordinate(0, 120), new Coordinate(10, -120), new Coordinate(20, 45)],
      'layer-1',
      time100
    );

    expect(vertices.get('temp-v-0')?.y).toBe(90);
    expect(vertices.get('temp-v-1')?.y).toBe(-90);
    expect(vertices.get('temp-v-2')?.y).toBe(45);
  });

  it('collectImpactedFeatureIdsByVertexIdsは該当頂点を持つ地物だけ返す', () => {
    const features = [
      makePolygonFeature('polygon-1', 'layer-1', [
        { id: 'ring-1', vertexIds: ['p1', 'p2', 'p3'], ringType: 'territory', parentId: null },
      ]),
      makePolygonFeature('polygon-2', 'layer-1', [
        { id: 'ring-2', vertexIds: ['q1', 'q2', 'q3'], ringType: 'territory', parentId: null },
      ]),
      makeLineFeature('line-1', 'layer-1', ['l1', 'l2']),
    ];

    expect(collectImpactedFeatureIdsByVertexIds(features, ['p2', 'l2'], time100)).toEqual([
      'polygon-1',
      'line-1',
    ]);
  });

  it('collectImpactedFeatureIdsByVertexIdsは該当なしなら空配列を返す', () => {
    const features = [
      makePolygonFeature('polygon-1', 'layer-1', [
        { id: 'ring-1', vertexIds: ['p1', 'p2', 'p3'], ringType: 'territory', parentId: null },
      ]),
    ];

    expect(collectImpactedFeatureIdsByVertexIds(features, ['missing'], time100)).toEqual([]);
  });

  it('collectImpactedFeatureIdsByVertexIdsはPointとLineStringとPolygonの全型を判定する', () => {
    const features = [
      makePointFeature('point-1', 'layer-1', 'point-v1'),
      makeLineFeature('line-1', 'layer-1', ['line-v1', 'line-v2']),
      makePolygonFeature('polygon-1', 'layer-1', [
        { id: 'ring-1', vertexIds: ['poly-v1', 'poly-v2', 'poly-v3'], ringType: 'territory', parentId: null },
      ]),
    ];

    expect(
      collectImpactedFeatureIdsByVertexIds(
        features,
        ['point-v1', 'line-v2', 'poly-v3'],
        time100
      )
    ).toEqual(['point-1', 'line-1', 'polygon-1']);
  });

  it('validatePolygonOrThrowは正常ポリゴンを通す', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
      ['a4', makeVertex('a4', 0, 10)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'ring-1', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);

    expect(() => validatePolygonOrThrow(feature, [feature], vertices, time100)).not.toThrow();
  });

  it('validatePolygonOrThrowは自己交差ポリゴンでPolygonValidationErrorを投げる', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 10)],
      ['a3', makeVertex('a3', 10, 0)],
      ['a4', makeVertex('a4', 0, 10)],
    ]);
    const feature = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'ring-1', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);

    expect(() => validatePolygonOrThrow(feature, [feature], vertices, time100))
      .toThrowError(new PolygonValidationError('ポリゴンが自己交差しています'));
  });

  it('validatePolygonOrThrowはリング階層不正でPolygonValidationErrorを投げる', () => {
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

    expect(() => validatePolygonOrThrow(feature, [feature], vertices, time100)).toThrowError(
      new PolygonValidationError('リング "hole" が親リングの内部に完全に収まっていません')
    );
  });

  it('validatePolygonOrThrowは同一レイヤー重複で相手IDを含むエラーを投げる', () => {
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

    expect(() => validatePolygonOrThrow(target, [target, other], vertices, time100))
      .toThrowError(new PolygonValidationError('ポリゴンが同一レイヤーの地物 "polygon-other" と重なっています'));
  });

  it('validatePolygonFeatureIdsOrThrowはLine地物をスキップする', () => {
    const vertices = new Map<string, Vertex>([
      ['l1', makeVertex('l1', 0, 0)],
      ['l2', makeVertex('l2', 10, 10)],
    ]);
    const line = makeLineFeature('line-1', 'layer-1', ['l1', 'l2']);

    expect(() => validatePolygonFeatureIdsOrThrow([line.id], [line], vertices, time100)).not.toThrow();
  });
});
