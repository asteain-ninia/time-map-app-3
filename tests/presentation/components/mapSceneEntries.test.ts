import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type {
  AnchorPlacement,
  AnchorProperty,
  FeatureShape,
} from '@domain/value-objects/FeatureAnchor';
import { collectMapSceneEntries } from '@presentation/components/mapSceneEntries';

const property: AnchorProperty = { name: '地物', description: '' };

/** テスト用空 vertexCoordinates（Polygon entry の rings 解決が空配列になる前提のケース向け） */
const emptyVertexCoords: ReadonlyMap<string, Coordinate> = new Map();

function placement(parentId: string | null = null, childIds: readonly string[] = []): AnchorPlacement {
  return { parentId, childIds, isTopLevel: parentId === null };
}

function pointShape(vertexId: string): FeatureShape {
  return { type: 'Point', vertexId };
}

function polygonShape(vertexIds: readonly string[]): FeatureShape {
  return {
    type: 'Polygon',
    rings: [{ type: 'territory', vertexIds: [...vertexIds] }],
  };
}

function makeAnchor(
  anchorId: string,
  start: number,
  end: number,
  shape: FeatureShape | undefined,
  options: { parentId?: string | null; childIds?: readonly string[] } = {}
): FeatureAnchor {
  return new FeatureAnchor(
    anchorId,
    { start: new TimePoint(start), end: new TimePoint(end) },
    property,
    shape,
    placement(options.parentId ?? null, options.childIds ?? [])
  );
}

describe('collectMapSceneEntries', () => {
  it('アクティブ錨を持つ全地物に地図全体連番を割り当てる', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'))]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'))]),
    ];

    const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f2', 'f3']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1, 2]);
  });

  it('複数地物が混在しても地図全体で連番割当される', () => {
    // 旧モデルのレイヤー可視性フィルタを持たないため、全アクティブ地物が同一の連番で
    // 並ぶ。Point / LineString の自動色割当に直接影響する。
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'))]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'))]),
      new Feature('f4', 'Point', [makeAnchor('a4', 1000, 2000, pointShape('v4'))]),
    ];

    const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1, 2, 3]);
  });

  it('shape を持たない錨（コンテナ）は除外する', () => {
    const features = [
      new Feature('leaf', 'Polygon', [
        makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3'])),
      ]),
      new Feature('container', 'Polygon', [
        makeAnchor('a2', 1000, 2000, undefined, { childIds: ['leaf'] }),
      ]),
    ];

    const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['leaf']);
  });

  it('現在時刻にアクティブ錨が無い地物は除外する', () => {
    const features = [
      // 1000..2000 に存在
      new Feature('past', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      // 3000..4000 に存在
      new Feature('future', 'Point', [makeAnchor('a2', 3000, 4000, pointShape('v2'))]),
      // 1000..4000 に存在
      new Feature('always', 'Point', [makeAnchor('a3', 1000, 4000, pointShape('v3'))]),
    ];

    const entries = collectMapSceneEntries(features, new TimePoint(2500), emptyVertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['always']);
    expect(entries[0].featureIndex).toBe(0);
  });

  it('features 空配列なら空エントリ列を返す', () => {
    expect(collectMapSceneEntries([], new TimePoint(1500), emptyVertexCoords)).toEqual([]);
  });

  it('currentTime が undefined なら空エントリ列を返す', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
    ];
    expect(collectMapSceneEntries(features, undefined, emptyVertexCoords)).toEqual([]);
  });

  it('入力順を保持する', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'))]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'))]),
      new Feature('f4', 'Point', [makeAnchor('a4', 1000, 2000, pointShape('v4'))]),
    ];

    const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  it('Polygon リーフは shape.rings を vertexCoordinates で解決した polygonRings を持つ', () => {
    const features = [
      new Feature('pg', 'Polygon', [
        makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3'])),
      ]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(5, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    expect(entries).toHaveLength(1);
    const polygonRings = entries[0].polygonRings;
    expect(polygonRings).not.toBeNull();
    expect(polygonRings).toHaveLength(1);
    expect(polygonRings![0]).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]);
  });

  it('Point / LineString entry の polygonRings は null', () => {
    const features = [
      new Feature('p1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
    ];
    const vertexCoords = new Map<string, Coordinate>([['v1', new Coordinate(5, 5)]]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    expect(entries[0].polygonRings).toBeNull();
  });
});
