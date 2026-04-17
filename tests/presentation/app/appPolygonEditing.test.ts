import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { PolygonValidationError } from '@application/polygonValidation';
import {
  alignCoordinateNearReference,
  buildValidationVertices,
  collectSameLayerPolygonObstacleRings,
  getAnchorReferenceLongitude,
  getRingDrawingConstraintMessage,
  getRingDrawingTarget,
  getSelectedPolygonReferenceLongitude,
  getValidationMessage,
  resolveEdgeSlideCoordinate,
  validatePendingPolygon,
  validateRingDrawingVertex,
} from '@presentation/app/appPolygonEditing';

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

function createNestedVertices(): Map<string, Vertex> {
  return new Map<string, Vertex>([
    ['o1', makeVertex('o1', 0, 0)],
    ['o2', makeVertex('o2', 20, 0)],
    ['o3', makeVertex('o3', 20, 20)],
    ['o4', makeVertex('o4', 0, 20)],
    ['h1', makeVertex('h1', 4, 4)],
    ['h2', makeVertex('h2', 16, 4)],
    ['h3', makeVertex('h3', 16, 16)],
    ['h4', makeVertex('h4', 4, 16)],
  ]);
}

describe('appPolygonEditing', () => {
  it('PolygonValidationErrorのメッセージを優先して返す', () => {
    expect(getValidationMessage(new PolygonValidationError('重なりエラー'))).toBe('重なりエラー');
  });

  it('通常のErrorと不明値を安全なメッセージへ変換する', () => {
    expect(getValidationMessage(new Error('一般エラー'))).toBe('一般エラー');
    expect(getValidationMessage('unexpected')).toBe('形状を確定できません');
  });

  it('buildValidationVerticesは既存頂点更新と新規頂点追加を行う', () => {
    const existing = new Map<string, Vertex>([
      ['v1', makeVertex('v1', 0, 0)],
    ]);

    const result = buildValidationVertices(existing, [
      { vertexId: 'v1', coordinate: new Coordinate(5, 6) },
      { vertexId: 'v2', coordinate: new Coordinate(10, 120) },
    ]);

    expect(result.get('v1')?.coordinate).toEqual(new Coordinate(5, 6));
    expect(result.get('v2')?.coordinate).toEqual(new Coordinate(10, 90));
  });

  it('getRingDrawingTargetはポリゴン地物だけを返す', () => {
    const polygon = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['o1', 'o2', 'o3', 'o4'], ringType: 'territory', parentId: null },
    ]);
    const point = makePointFeature('point-1', 'layer-1', 'p1');

    expect(
      getRingDrawingTarget(
        [polygon, point],
        { type: 'auto', featureId: 'polygon-1', coords: [] },
        time100
      )?.feature.id
    ).toBe('polygon-1');
    expect(
      getRingDrawingTarget(
        [polygon, point],
        { type: 'auto', featureId: 'point-1', coords: [] },
        time100
      )
    ).toBeNull();
  });

  it('参照経度はPointとLineStringとPolygonの最初の頂点から解決する', () => {
    const vertices = new Map<string, Vertex>([
      ['p1', makeVertex('p1', 10, 10)],
      ['l1', makeVertex('l1', 20, 20)],
      ['l2', makeVertex('l2', 30, 30)],
      ['o1', makeVertex('o1', 40, 40)],
      ['o2', makeVertex('o2', 50, 50)],
      ['o3', makeVertex('o3', 60, 60)],
    ]);

    expect(
      getAnchorReferenceLongitude(makePointFeature('point-1', 'layer-1', 'p1').anchors[0], vertices)
    ).toBe(10);
    expect(
      getAnchorReferenceLongitude(makeLineFeature('line-1', 'layer-1', ['l1', 'l2']).anchors[0], vertices)
    ).toBe(20);
    expect(
      getAnchorReferenceLongitude(
        makePolygonFeature('polygon-1', 'layer-1', [
          { id: 'outer', vertexIds: ['o1', 'o2', 'o3'], ringType: 'territory', parentId: null },
        ]).anchors[0],
        vertices
      )
    ).toBe(40);
  });

  it('選択中ポリゴンの参照経度を返し、非ポリゴンはnullを返す', () => {
    const vertices = new Map<string, Vertex>([
      ['o1', makeVertex('o1', 40, 40)],
      ['o2', makeVertex('o2', 50, 50)],
      ['o3', makeVertex('o3', 60, 60)],
      ['p1', makeVertex('p1', 10, 10)],
    ]);
    const polygon = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['o1', 'o2', 'o3'], ringType: 'territory', parentId: null },
    ]);
    const point = makePointFeature('point-1', 'layer-1', 'p1');

    expect(getSelectedPolygonReferenceLongitude([polygon, point], 'polygon-1', time100, vertices)).toBe(40);
    expect(getSelectedPolygonReferenceLongitude([polygon, point], 'point-1', time100, vertices)).toBeNull();
  });

  it('alignCoordinateNearReferenceは最後の頂点近傍へ経度を寄せる', () => {
    expect(
      alignCoordinateNearReference(
        new Coordinate(-179, 5),
        [new Coordinate(179, 0)],
        null
      )
    ).toEqual(new Coordinate(181, 5));
  });

  it('穴/飛び地制約メッセージを配置モードごとに返す', () => {
    const vertices = createNestedVertices();
    const polygon = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['o1', 'o2', 'o3', 'o4'], ringType: 'territory', parentId: null },
      { id: 'hole', vertexIds: ['h1', 'h2', 'h3', 'h4'], ringType: 'hole', parentId: 'outer' },
    ]);
    const target = getRingDrawingTarget(
      [polygon],
      { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(2, 2)] },
      time100
    );

    expect(
      getRingDrawingConstraintMessage(
        target,
        { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(2, 2)] },
        vertices
      )
    ).toContain('領土リングの内部');
    expect(
      getRingDrawingConstraintMessage(
        getRingDrawingTarget(
          [polygon],
          { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(5, 5)] },
          time100
        ),
        { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(5, 5)] },
        vertices
      )
    ).toContain('穴リングの内部');
    expect(
      getRingDrawingConstraintMessage(
        getRingDrawingTarget(
          [polygon],
          { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(30, 30)] },
          time100
        ),
        { type: 'auto', featureId: 'polygon-1', coords: [new Coordinate(30, 30)] },
        vertices
      )
    ).toContain('ポリゴンの外部');
  });

  it('validateRingDrawingVertexは制約外の頂点を拒否する', () => {
    const vertices = createNestedVertices();
    const polygon = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['o1', 'o2', 'o3', 'o4'], ringType: 'territory', parentId: null },
      { id: 'hole', vertexIds: ['h1', 'h2', 'h3', 'h4'], ringType: 'hole', parentId: 'outer' },
    ]);
    const ringState = { type: 'auto' as const, featureId: 'polygon-1', coords: [new Coordinate(2, 2)] };
    const target = getRingDrawingTarget([polygon], ringState, time100);

    expect(validateRingDrawingVertex(new Coordinate(5, 5), target, ringState, vertices)).toContain(
      '領土リングの内部'
    );
    expect(validateRingDrawingVertex(new Coordinate(3, 3), target, ringState, vertices)).toBeNull();
  });

  it('validatePendingPolygonは正常形状を通し、重なりを拒否する', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
      ['a4', makeVertex('a4', 0, 10)],
    ]);
    const existing = makePolygonFeature('polygon-1', 'layer-1', [
      { id: 'outer', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);

    expect(
      validatePendingPolygon(
        [new Coordinate(20, 0), new Coordinate(30, 0), new Coordinate(30, 10), new Coordinate(20, 10)],
        'polygon',
        time100,
        'layer-1',
        [existing],
        vertices
      )
    ).toBeNull();
    expect(
      validatePendingPolygon(
        [new Coordinate(5, 0), new Coordinate(15, 0), new Coordinate(15, 10), new Coordinate(5, 10)],
        'polygon',
        time100,
        'layer-1',
        [existing],
        vertices
      )
    ).toContain('polygon-1');
  });

  it('同一レイヤーの他ポリゴンだけをエッジ滑り障害物として集める', () => {
    const vertices = new Map<string, Vertex>([
      ['a1', makeVertex('a1', 0, 0)],
      ['a2', makeVertex('a2', 10, 0)],
      ['a3', makeVertex('a3', 10, 10)],
      ['a4', makeVertex('a4', 0, 10)],
      ['b1', makeVertex('b1', 20, 0)],
      ['b2', makeVertex('b2', 30, 0)],
      ['b3', makeVertex('b3', 30, 10)],
      ['b4', makeVertex('b4', 20, 10)],
      ['c1', makeVertex('c1', 40, 0)],
      ['c2', makeVertex('c2', 50, 0)],
      ['c3', makeVertex('c3', 50, 10)],
      ['c4', makeVertex('c4', 40, 10)],
    ]);
    const source = makePolygonFeature('source', 'layer-1', [
      { id: 'source-ring', vertexIds: ['a1', 'a2', 'a3', 'a4'], ringType: 'territory', parentId: null },
    ]);
    const sameLayer = makePolygonFeature('same-layer', 'layer-1', [
      { id: 'same-ring', vertexIds: ['b1', 'b2', 'b3', 'b4'], ringType: 'territory', parentId: null },
    ]);
    const otherLayer = makePolygonFeature('other-layer', 'layer-2', [
      { id: 'other-ring', vertexIds: ['c1', 'c2', 'c3', 'c4'], ringType: 'territory', parentId: null },
    ]);

    const rings = collectSameLayerPolygonObstacleRings(
      [source, sameLayer, otherLayer],
      time100,
      vertices,
      new Set(['source']),
      new Coordinate(25, 5)
    );

    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual({ x: 20, y: 0 });
  });

  it('障害物内部へ入る頂点ドラッグ座標を境界へ滑らせる', () => {
    const result = resolveEdgeSlideCoordinate(
      new Coordinate(25, 2),
      [[
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
      ]]
    );

    expect(result.x).toBe(25);
    expect(result.y).toBe(0);
  });

  it('障害物を横切って反対側へ出る頂点ドラッグ座標は直前座標に留める', () => {
    const previous = new Coordinate(15, 5);
    const result = resolveEdgeSlideCoordinate(
      new Coordinate(35, 5),
      [[
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
      ]],
      previous
    );

    expect(result).toBe(previous);
  });

  it('障害物境界上から内部へ向かう頂点ドラッグ座標は直前座標に留める', () => {
    const previous = new Coordinate(20, 5);
    const result = resolveEdgeSlideCoordinate(
      new Coordinate(29, 5),
      [[
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
      ]],
      previous
    );

    expect(result).toBe(previous);
  });

  it('障害物境界上への頂点ドラッグ座標は直前座標へ戻さない', () => {
    const result = resolveEdgeSlideCoordinate(
      new Coordinate(20, 5),
      [[
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
      ]],
      new Coordinate(15, 5)
    );

    expect(result).toEqual(new Coordinate(20, 5));
  });
});
