import { describe, it, expect } from 'vitest';
import {
  geoToSvgX,
  geoToSvgY,
  buildRingPath,
  buildPolygonPath,
  buildLinePoints,
  wrapLongitudeNearReference,
  unwrapLongitudeSequence,
} from '@infrastructure/rendering/featureRenderingUtils';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';

/** テスト用の頂点マップを作成 */
function makeVertices(
  ...defs: Array<[string, number, number]>
): ReadonlyMap<string, Vertex> {
  const map = new Map<string, Vertex>();
  for (const [id, lon, lat] of defs) {
    map.set(id, new Vertex(id, new Coordinate(lon, lat)));
  }
  return map;
}

describe('geoToSvgX', () => {
  it('経度0 → SVG x=180', () => {
    expect(geoToSvgX(0)).toBe(180);
  });

  it('経度-180 → SVG x=0', () => {
    expect(geoToSvgX(-180)).toBe(0);
  });

  it('経度180 → SVG x=360', () => {
    expect(geoToSvgX(180)).toBe(360);
  });
});

describe('geoToSvgY', () => {
  it('緯度0 → SVG y=90', () => {
    expect(geoToSvgY(0)).toBe(90);
  });

  it('緯度90（北極） → SVG y=0', () => {
    expect(geoToSvgY(90)).toBe(0);
  });

  it('緯度-90（南極） → SVG y=180', () => {
    expect(geoToSvgY(-90)).toBe(180);
  });
});

describe('wrapLongitudeNearReference', () => {
  it('参照値に近い周回へ寄せる', () => {
    expect(wrapLongitudeNearReference(-170, 175)).toBe(190);
  });

  it('すでに近い場合はそのまま返す', () => {
    expect(wrapLongitudeNearReference(20, 30)).toBe(20);
  });
});

describe('unwrapLongitudeSequence', () => {
  it('東西端またぎの経度列を連続化する', () => {
    expect(unwrapLongitudeSequence([170, -170, -160])).toEqual([170, 190, 200]);
  });

  it('西から東へまたぐ場合も連続化する', () => {
    expect(unwrapLongitudeSequence([-170, 170, 160])).toEqual([-170, -190, -200]);
  });
});

describe('buildRingPath', () => {
  it('3頂点の閉じたパスを生成する', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 10, 0],
      ['v3', 10, 10]
    );
    const path = buildRingPath(['v1', 'v2', 'v3'], vertices);
    expect(path).toBe('M180 90 L190 90 L190 80 Z');
  });

  it('頂点が3未満なら空文字を返す', () => {
    const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
    expect(buildRingPath(['v1', 'v2'], vertices)).toBe('');
  });

  it('頂点が0なら空文字を返す', () => {
    const vertices = makeVertices();
    expect(buildRingPath([], vertices)).toBe('');
  });

  it('存在しない頂点IDはスキップされる', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 10, 0],
      ['v3', 10, 10]
    );
    // v_missing は存在しないが、残り3頂点で有効なパスになる
    const path = buildRingPath(['v1', 'v_missing', 'v2', 'v3'], vertices);
    expect(path).toBe('M180 90 L190 90 L190 80 Z');
  });

  it('存在しない頂点を除くと3未満になる場合は空文字', () => {
    const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
    const path = buildRingPath(['v1', 'v_missing', 'v2'], vertices);
    expect(path).toBe('');
  });

  it('東西端をまたぐリングを短い経路で生成する', () => {
    const vertices = makeVertices(
      ['v1', 170, 0],
      ['v2', -170, 0],
      ['v3', -170, 10]
    );
    const path = buildRingPath(['v1', 'v2', 'v3'], vertices);
    expect(path).toBe('M350 90 L370 90 L370 80 Z');
  });
});

describe('buildPolygonPath', () => {
  it('単一リングのパスを生成する', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 10, 0],
      ['v3', 10, 10]
    );
    const shape = {
      type: 'Polygon' as const,
      rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)],
    };
    const path = buildPolygonPath(shape, vertices);
    expect(path).toBe('M180 90 L190 90 L190 80 Z');
  });

  it('領土リングと穴リングを結合する（evenodd用）', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 20, 0],
      ['v3', 20, 20],
      ['h1', 5, 5],
      ['h2', 10, 5],
      ['h3', 10, 10]
    );
    const shape = {
      type: 'Polygon' as const,
      rings: [
        new Ring('outer', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('hole', ['h1', 'h2', 'h3'], 'hole', 'outer'),
      ],
    };
    const path = buildPolygonPath(shape, vertices);
    // 2つのリングがスペースで区切られている
    const parts = path.split(' Z ');
    expect(parts.length).toBe(2);
  });

  it('頂点不足のリングはスキップされる', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 10, 0],
      ['v3', 10, 10]
    );
    const shape = {
      type: 'Polygon' as const,
      rings: [
        new Ring('valid', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('invalid', ['v1', 'v2'], 'hole', 'valid'), // 2頂点 → スキップ
      ],
    };
    const path = buildPolygonPath(shape, vertices);
    expect(path).toBe('M180 90 L190 90 L190 80 Z');
  });

  it('全リングが無効なら空文字', () => {
    const vertices = makeVertices(['v1', 0, 0]);
    const shape = {
      type: 'Polygon' as const,
      rings: [new Ring('r1', ['v1'], 'territory', null)],
    };
    expect(buildPolygonPath(shape, vertices)).toBe('');
  });

  it('東西端またぎの穴リングを外周と同じラップに揃える', () => {
    const vertices = makeVertices(
      ['v1', 170, -10],
      ['v2', -170, -10],
      ['v3', -170, 10],
      ['v4', 170, 10],
      ['h1', -175, -5],
      ['h2', 175, -5],
      ['h3', 175, 5],
      ['h4', -175, 5]
    );
    const shape = {
      type: 'Polygon' as const,
      rings: [
        new Ring('outer', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('hole', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer'),
      ],
    };

    expect(buildPolygonPath(shape, vertices)).toBe(
      'M350 100 L370 100 L370 80 L350 80 Z M365 95 L355 95 L355 85 L365 85 Z'
    );
  });
});

describe('buildLinePoints', () => {
  it('ポリライン用のポイント文字列を生成する', () => {
    const vertices = makeVertices(
      ['v1', 0, 0],
      ['v2', 10, 20],
      ['v3', -30, -45]
    );
    const points = buildLinePoints(['v1', 'v2', 'v3'], vertices);
    expect(points).toBe('180,90 190,70 150,135');
  });

  it('頂点がなければ空文字', () => {
    const vertices = makeVertices();
    expect(buildLinePoints([], vertices)).toBe('');
  });

  it('存在しない頂点IDはスキップされる', () => {
    const vertices = makeVertices(['v1', 0, 0], ['v2', 10, 0]);
    const points = buildLinePoints(['v1', 'v_missing', 'v2'], vertices);
    expect(points).toBe('180,90 190,90');
  });

  it('東西端をまたぐラインを短い経路で生成する', () => {
    const vertices = makeVertices(['v1', 170, 0], ['v2', -170, 0]);
    const points = buildLinePoints(['v1', 'v2'], vertices);
    expect(points).toBe('350,90 370,90');
  });
});
