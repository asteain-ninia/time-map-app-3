import { describe, it, expect } from 'vitest';
import {
  geoDistance,
  pointToSegmentDistance,
  isPointInRing,
  hitTest,
} from '@infrastructure/rendering/hitTestUtils';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { collectMapSceneEntries } from '@presentation/components/mapSceneEntries';

/** テスト用頂点マップ */
function makeVertices(
  ...defs: Array<[string, number, number]>
): ReadonlyMap<string, Vertex> {
  const map = new Map<string, Vertex>();
  for (const [id, lon, lat] of defs) {
    map.set(id, new Vertex(id, new Coordinate(lon, lat)));
  }
  return map;
}

/** vertices Map から vertexCoordinates Map (Coordinate ベース) を作る */
function toCoordsMap(vertices: ReadonlyMap<string, Vertex>): ReadonlyMap<string, Coordinate> {
  const m = new Map<string, Coordinate>();
  for (const [id, v] of vertices) m.set(id, v.coordinate);
  return m;
}

/** テスト用ポイント地物 */
function makePointFeature(
  id: string,
  vertexId: string,
  layerId: string
): Feature {
  const anchor = new FeatureAnchor(
    `a-${id}`,
    { start: new TimePoint(0) },
    { name: id, description: '' },
    { type: 'Point', vertexId },
    { layerId, parentId: null, childIds: [], isTopLevel: true }
  );
  return new Feature(id, 'Point', [anchor]);
}

/** テスト用ライン地物 */
function makeLineFeature(
  id: string,
  vertexIds: string[],
  layerId: string
): Feature {
  const anchor = new FeatureAnchor(
    `a-${id}`,
    { start: new TimePoint(0) },
    { name: id, description: '' },
    { type: 'LineString', vertexIds },
    { layerId, parentId: null, childIds: [], isTopLevel: true }
  );
  return new Feature(id, 'Line', [anchor]);
}

/** テスト用ポリゴン地物 */
function makePolygonFeature(
  id: string,
  vertexIds: string[],
  layerId: string
): Feature {
  const ring = new Ring('r1', vertexIds, 'territory', null);
  const anchor = new FeatureAnchor(
    `a-${id}`,
    { start: new TimePoint(0) },
    { name: id, description: '' },
    { type: 'Polygon', rings: [ring] },
    { layerId, parentId: null, childIds: [], isTopLevel: true }
  );
  return new Feature(id, 'Polygon', [anchor]);
}

describe('geoDistance', () => {
  it('同一点なら距離0', () => {
    expect(geoDistance(10, 20, 10, 20)).toBe(0);
  });

  it('水平距離を正しく計算する', () => {
    expect(geoDistance(0, 0, 3, 4)).toBe(5);
  });
});

describe('pointToSegmentDistance', () => {
  it('線分上の点なら距離0', () => {
    expect(pointToSegmentDistance(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('線分の端点が最近傍の場合', () => {
    expect(pointToSegmentDistance(15, 0, 0, 0, 10, 0)).toBe(5);
  });

  it('線分の垂直方向の場合', () => {
    expect(pointToSegmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
  });

  it('線分が点に退化する場合', () => {
    expect(pointToSegmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});

describe('isPointInRing', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('内部の点はtrue', () => {
    expect(isPointInRing(5, 5, square)).toBe(true);
  });

  it('外部の点はfalse', () => {
    expect(isPointInRing(15, 5, square)).toBe(false);
  });

  it('辺の外側はfalse', () => {
    expect(isPointInRing(-1, 5, square)).toBe(false);
  });

  it('三角形の内部', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(isPointInRing(5, 3, triangle)).toBe(true);
    expect(isPointInRing(9, 9, triangle)).toBe(false);
  });
});

describe('hitTest', () => {
  const time = new TimePoint(500);

  describe('点情報のヒットテスト', () => {
    it('閾値内のクリックでヒットする', () => {
      const vertices = makeVertices(['v1', 10, 20]);
      const sceneEntries = collectMapSceneEntries(
        [makePointFeature('p1', 'v1', 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(10.5, 20.5), sceneEntries, vertices, 1.0);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('p1');
    });

    it('閾値外のクリックでヒットしない', () => {
      const vertices = makeVertices(['v1', 10, 20]);
      const sceneEntries = collectMapSceneEntries(
        [makePointFeature('p1', 'v1', 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(15, 25), sceneEntries, vertices, 1.0);
      expect(result).toBeNull();
    });

    it('隣接ラップ上の生値経度ポイントにもヒットする', () => {
      const vertices = makeVertices(['v1', 190, 20]);
      const sceneEntries = collectMapSceneEntries(
        [makePointFeature('p-wrap', 'v1', 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(-170.2, 20.1), sceneEntries, vertices, 0.5);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('p-wrap');
    });
  });

  describe('線情報のヒットテスト', () => {
    it('線の近くのクリックでヒットする', () => {
      const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
      const sceneEntries = collectMapSceneEntries(
        [makeLineFeature('ln1', ['v1', 'v2'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(5, 0.3), sceneEntries, vertices, 0.5);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('ln1');
    });

    it('線から遠いクリックでヒットしない', () => {
      const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
      const sceneEntries = collectMapSceneEntries(
        [makeLineFeature('ln1', ['v1', 'v2'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(5, 5), sceneEntries, vertices, 0.5);
      expect(result).toBeNull();
    });

    it('東西端をまたぐ線でも生値経度のまま seam 付近でヒットする', () => {
      const vertices = makeVertices(['v1', 170, 0], ['v2', 190, 0]);
      const sceneEntries = collectMapSceneEntries(
        [makeLineFeature('ln-wrap', ['v1', 'v2'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(179, 0.2), sceneEntries, vertices, 1.0);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('ln-wrap');
    });
  });

  describe('面情報のヒットテスト', () => {
    it('ポリゴン内部のクリックでヒットする', () => {
      const vertices = makeVertices(
        ['v1', 0, 0],
        ['v2', 10, 0],
        ['v3', 10, 10],
        ['v4', 0, 10]
      );
      const sceneEntries = collectMapSceneEntries(
        [makePolygonFeature('pg1', ['v1', 'v2', 'v3', 'v4'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(5, 5), sceneEntries, vertices, 1.0);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('pg1');
    });

    it('ポリゴン外部のクリックでヒットしない', () => {
      const vertices = makeVertices(
        ['v1', 0, 0],
        ['v2', 10, 0],
        ['v3', 10, 10],
        ['v4', 0, 10]
      );
      const sceneEntries = collectMapSceneEntries(
        [makePolygonFeature('pg1', ['v1', 'v2', 'v3', 'v4'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(15, 15), sceneEntries, vertices, 1.0);
      expect(result).toBeNull();
    });

    it('東西端をまたぐポリゴン内部のクリックでヒットする', () => {
      const vertices = makeVertices(
        ['v1', 170, -10],
        ['v2', 190, -10],
        ['v3', 190, 10],
        ['v4', 170, 10]
      );
      const sceneEntries = collectMapSceneEntries(
        [makePolygonFeature('pg-wrap', ['v1', 'v2', 'v3', 'v4'], 'l1')],
        time,
        toCoordsMap(vertices)
      );
      const result = hitTest(new Coordinate(179, 0), sceneEntries, vertices, 1.0);
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('pg-wrap');
    });

    it('東西端またぎの穴リング内部はヒットしない', () => {
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
      const shape = {
        type: 'Polygon' as const,
        rings: [
          new Ring('outer', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
          new Ring('hole', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer'),
        ],
      };
      const anchor = new FeatureAnchor(
        'a-hole-wrap',
        { start: new TimePoint(0) },
        { name: 'hole-wrap', description: '' },
        shape,
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      );
      const feature = new Feature('pg-hole-wrap', 'Polygon', [anchor]);
      const sceneEntries = collectMapSceneEntries([feature], time, toCoordsMap(vertices));

      const result = hitTest(new Coordinate(179, 0), sceneEntries, vertices, 1.0);

      expect(result).toBeNull();
    });

    it('東西端またぎの穴リング外側はヒットする', () => {
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
      const shape = {
        type: 'Polygon' as const,
        rings: [
          new Ring('outer', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
          new Ring('hole', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer'),
        ],
      };
      const anchor = new FeatureAnchor(
        'a-hole-wrap',
        { start: new TimePoint(0) },
        { name: 'hole-wrap', description: '' },
        shape,
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      );
      const feature = new Feature('pg-hole-wrap', 'Polygon', [anchor]);
      const sceneEntries = collectMapSceneEntries([feature], time, toCoordsMap(vertices));

      const result = hitTest(new Coordinate(171, 0), sceneEntries, vertices, 1.0);

      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('pg-hole-wrap');
    });

    it('主表示帯のクリックでも隣接ラップ上の生値ポリゴンにヒットする', () => {
      const vertices = makeVertices(
        ['v1', 350, -10],
        ['v2', 370, -10],
        ['v3', 370, 10],
        ['v4', 350, 10]
      );
      const sceneEntries = collectMapSceneEntries(
        [makePolygonFeature('pg-f4', ['v1', 'v2', 'v3', 'v4'], 'l1')],
        time,
        toCoordsMap(vertices)
      );

      const result = hitTest(new Coordinate(5, 0), sceneEntries, vertices, 1.0);

      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('pg-f4');
    });
  });

  describe('sceneEntries 経路の制約', () => {
    it('sceneEntries に含まれない地物はヒットしない', () => {
      // 描画対象外（sceneEntries に含まれない）地物は hitTest の対象にもならない。
      // これは「描画されないものはクリックできない」という対概念整合性を固定するテスト
      // （開発ガイド §6.1.2 / §6.6.9）。
      const vertices = makeVertices(['v1', 10, 20]);
      const sceneEntries: never[] = []; // 意図的に空
      const result = hitTest(new Coordinate(10, 20), sceneEntries, vertices, 1.0);
      expect(result).toBeNull();
    });

    it('sceneEntries が空ならnull', () => {
      const result = hitTest(new Coordinate(5, 5), [], new Map(), 1.0);
      expect(result).toBeNull();
    });
  });
});
