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
import { Layer } from '@domain/entities/Layer';
import { TimePoint } from '@domain/value-objects/TimePoint';

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
    { layerId, parentId: null, childIds: [] }
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
    { layerId, parentId: null, childIds: [] }
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
    { layerId, parentId: null, childIds: [] }
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
    // 点(15, 0), 線分(0,0)-(10,0): 端点(10,0)が最近傍、距離5
    expect(pointToSegmentDistance(15, 0, 0, 0, 10, 0)).toBe(5);
  });

  it('線分の垂直方向の場合', () => {
    // 点(5, 3), 水平線分(0,0)-(10,0): 垂直距離3
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
  const layer = new Layer('l1', 'レイヤー1', 0);

  describe('点情報のヒットテスト', () => {
    it('閾値内のクリックでヒットする', () => {
      const vertices = makeVertices(['v1', 10, 20]);
      const feature = makePointFeature('p1', 'v1', 'l1');
      const result = hitTest(
        new Coordinate(10.5, 20.5),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('p1');
    });

    it('閾値外のクリックでヒットしない', () => {
      const vertices = makeVertices(['v1', 10, 20]);
      const feature = makePointFeature('p1', 'v1', 'l1');
      const result = hitTest(
        new Coordinate(15, 25),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
      expect(result).toBeNull();
    });
  });

  describe('線情報のヒットテスト', () => {
    it('線の近くのクリックでヒットする', () => {
      const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
      const feature = makeLineFeature('ln1', ['v1', 'v2'], 'l1');
      const result = hitTest(
        new Coordinate(5, 0.3),
        [feature],
        vertices,
        [layer],
        time,
        0.5
      );
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('ln1');
    });

    it('線から遠いクリックでヒットしない', () => {
      const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
      const feature = makeLineFeature('ln1', ['v1', 'v2'], 'l1');
      const result = hitTest(
        new Coordinate(5, 5),
        [feature],
        vertices,
        [layer],
        time,
        0.5
      );
      expect(result).toBeNull();
    });

    it('東西端をまたぐ線でも seam 付近のクリックでヒットする', () => {
      const vertices = makeVertices(['v1', 170, 0], ['v2', -170, 0]);
      const feature = makeLineFeature('ln-wrap', ['v1', 'v2'], 'l1');
      const result = hitTest(
        new Coordinate(179, 0.2),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
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
      const feature = makePolygonFeature('pg1', ['v1', 'v2', 'v3', 'v4'], 'l1');
      const result = hitTest(
        new Coordinate(5, 5),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
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
      const feature = makePolygonFeature('pg1', ['v1', 'v2', 'v3', 'v4'], 'l1');
      const result = hitTest(
        new Coordinate(15, 15),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
      expect(result).toBeNull();
    });

    it('東西端をまたぐポリゴン内部のクリックでヒットする', () => {
      const vertices = makeVertices(
        ['v1', 170, -10],
        ['v2', -170, -10],
        ['v3', -170, 10],
        ['v4', 170, 10]
      );
      const feature = makePolygonFeature('pg-wrap', ['v1', 'v2', 'v3', 'v4'], 'l1');
      const result = hitTest(
        new Coordinate(179, 0),
        [feature],
        vertices,
        [layer],
        time,
        1.0
      );
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('pg-wrap');
    });
  });

  describe('レイヤーとフィルタリング', () => {
    it('非表示レイヤーの地物はヒットしない', () => {
      const hiddenLayer = layer.withVisible(false);
      const vertices = makeVertices(['v1', 10, 20]);
      const feature = makePointFeature('p1', 'v1', 'l1');
      const result = hitTest(
        new Coordinate(10, 20),
        [feature],
        vertices,
        [hiddenLayer],
        time,
        1.0
      );
      expect(result).toBeNull();
    });

    it('上位レイヤーの地物が優先される', () => {
      const layer1 = new Layer('l1', 'レイヤー1', 0);
      const layer2 = new Layer('l2', 'レイヤー2', 1);
      const vertices = makeVertices(['v1', 5, 5], ['v2', 5, 5]);
      const f1 = makePointFeature('p1', 'v1', 'l1');
      const f2 = makePointFeature('p2', 'v2', 'l2');
      const result = hitTest(
        new Coordinate(5, 5),
        [f1, f2],
        vertices,
        [layer1, layer2],
        time,
        1.0
      );
      expect(result).not.toBeNull();
      expect(result!.featureId).toBe('p2'); // layer2(order=1)が優先
    });

    it('現在時刻でアクティブでない地物はヒットしない', () => {
      const vertices = makeVertices(['v1', 10, 20]);
      const anchor = new FeatureAnchor(
        'a1',
        { start: new TimePoint(1000) }, // 時刻1000以降のみ有効
        { name: 'future', description: '' },
        { type: 'Point', vertexId: 'v1' },
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const feature = new Feature('p1', 'Point', [anchor]);
      const result = hitTest(
        new Coordinate(10, 20),
        [feature],
        vertices,
        [layer],
        new TimePoint(500), // 時刻500ではアクティブでない
        1.0
      );
      expect(result).toBeNull();
    });

    it('地物がなければnull', () => {
      const result = hitTest(
        new Coordinate(5, 5),
        [],
        new Map(),
        [layer],
        time,
        1.0
      );
      expect(result).toBeNull();
    });
  });
});
