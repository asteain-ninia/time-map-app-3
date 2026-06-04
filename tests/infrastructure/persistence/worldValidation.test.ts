import { describe, it, expect } from 'vitest';
import { validateParentChildUnion } from '@infrastructure/persistence/worldValidation';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import {
  FeatureAnchor,
  createAnchorPlacement,
  type TimeRange,
} from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';

// --- ヘルパー ---

const START = new TimePoint(1900);

function makeVertices(coords: [string, number, number][]): Map<string, Vertex> {
  return new Map(coords.map(([id, x, y]) => [id, new Vertex(id, new Coordinate(x, y))]));
}

/** 単一 territory ring を持つ Polygon 地物（リーフ or 移行期間ノード）。 */
function polygonFeature(
  id: string,
  parentId: string | null,
  childIds: string[],
  ringVertexIds: string[],
  timeRange: TimeRange = { start: START }
): Feature {
  const ring = new Ring(`${id}-r1`, ringVertexIds, 'territory', null);
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      timeRange,
      { name: id, description: '' },
      { type: 'Polygon', rings: [ring] },
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

/** 複数 territory ring（飛び地）を持つ Polygon 地物。 */
function multiTerritoryFeature(
  id: string,
  parentId: string | null,
  childIds: string[],
  territories: string[][]
): Feature {
  const rings = territories.map(
    (vertexIds, index) => new Ring(`${id}-r${index + 1}`, vertexIds, 'territory', null)
  );
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: START },
      { name: id, description: '' },
      { type: 'Polygon', rings },
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

/** 形状を持たない純粋な集約地物（コンテナ）。 */
function containerFeature(id: string, parentId: string | null, childIds: string[]): Feature {
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: START },
      { name: id, description: '' },
      undefined,
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

function buildWorld(features: Feature[], vertices: Map<string, Vertex>): World {
  return new World(
    '1.0.0',
    vertices,
    new Map(features.map((f) => [f.id, f])),
    new Map(),
    [],
    DEFAULT_METADATA
  );
}

// 共通頂点: 全体正方形 (0,0)-(10,10) を左右半分に割る
const VERTICES = makeVertices([
  // 親の全体正方形
  ['p1', 0, 0], ['p2', 10, 0], ['p3', 10, 10], ['p4', 0, 10],
  // 左半分 (0..5)
  ['l1', 0, 0], ['l2', 5, 0], ['l3', 5, 10], ['l4', 0, 10],
  // 右半分・全体 (5..10)
  ['r1', 5, 0], ['r2', 10, 0], ['r3', 10, 10], ['r4', 5, 10],
  // 右半分・部分 (5..8) — 隙間 (8..10) を残す
  ['rp2', 8, 0], ['rp3', 8, 10],
  // 離れた第2正方形 (20,0)-(30,10)
  ['q1', 20, 0], ['q2', 30, 0], ['q3', 30, 10], ['q4', 20, 10],
]);

const FULL_SQUARE = ['p1', 'p2', 'p3', 'p4'];
const LEFT_HALF = ['l1', 'l2', 'l3', 'l4'];
const RIGHT_HALF = ['r1', 'r2', 'r3', 'r4'];
const RIGHT_PARTIAL = ['r1', 'rp2', 'rp3', 'r4'];
const SECOND_SQUARE = ['q1', 'q2', 'q3', 'q4'];

describe('validateParentChildUnion', () => {
  describe('移行期間ノード（shape あり + childIds 非空）の親 ≡ 子の和', () => {
    it('shape が子の和と厳密一致するときエラーを出さない', () => {
      const parent = polygonFeature('parent', null, ['c1', 'c2'], FULL_SQUARE);
      const c1 = polygonFeature('c1', 'parent', [], LEFT_HALF);
      const c2 = polygonFeature('c2', 'parent', [], RIGHT_HALF);

      const errors = validateParentChildUnion(buildWorld([parent, c1, c2], VERTICES));

      expect(errors).toEqual([]);
    });

    it('子の和が shape に満たない（隙間）ときエラーを出す', () => {
      const parent = polygonFeature('parent', null, ['c1', 'c2'], FULL_SQUARE);
      const c1 = polygonFeature('c1', 'parent', [], LEFT_HALF);
      const c2 = polygonFeature('c2', 'parent', [], RIGHT_PARTIAL);

      const errors = validateParentChildUnion(buildWorld([parent, c1, c2], VERTICES));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('"parent"');
      expect(errors[0]).toContain('parent ≡ children union violated');
    });

    it('子の和が shape を超過（はみ出し）するときエラーを出す', () => {
      // 親の保持形状は左半分のみだが、子が全体を覆う → 子の和 > 親形状
      const parent = polygonFeature('parent', null, ['c1', 'c2'], LEFT_HALF);
      const c1 = polygonFeature('c1', 'parent', [], LEFT_HALF);
      const c2 = polygonFeature('c2', 'parent', [], RIGHT_HALF);

      const errors = validateParentChildUnion(buildWorld([parent, c1, c2], VERTICES));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('"parent"');
    });

    it('飛び地（MultiPolygon）の子の和が一致するときエラーを出さない', () => {
      // 親の保持形状 = 全体正方形 + 離れた第2正方形（2 territory）
      const parent = multiTerritoryFeature('parent', null, ['c1', 'c2'], [
        FULL_SQUARE,
        SECOND_SQUARE,
      ]);
      const c1 = polygonFeature('c1', 'parent', [], FULL_SQUARE);
      const c2 = polygonFeature('c2', 'parent', [], SECOND_SQUARE);

      const errors = validateParentChildUnion(buildWorld([parent, c1, c2], VERTICES));

      expect(errors).toEqual([]);
    });

    it('子の集約地物を再帰下降して孫の和と比較する', () => {
      // parent(shape 全体) → mid(コンテナ) → [c1 左, c2 右]
      const parent = polygonFeature('parent', null, ['mid'], FULL_SQUARE);
      const mid = containerFeature('mid', 'parent', ['c1', 'c2']);
      const c1 = polygonFeature('c1', 'mid', [], LEFT_HALF);
      const c2 = polygonFeature('c2', 'mid', [], RIGHT_HALF);

      const errors = validateParentChildUnion(buildWorld([parent, mid, c1, c2], VERTICES));

      expect(errors).toEqual([]);
    });
  });

  describe('検証対象外', () => {
    it('純粋な集約地物（shape なし）は検証しない', () => {
      // shape を持たないコンテナは子の和が形状の定義そのものなので常に整合
      const parent = containerFeature('parent', null, ['c1']);
      const c1 = polygonFeature('c1', 'parent', [], LEFT_HALF);

      const errors = validateParentChildUnion(buildWorld([parent, c1], VERTICES));

      expect(errors).toEqual([]);
    });

    it('末端地物（shape あり + 子なし）は検証しない', () => {
      const leaf = polygonFeature('leaf', null, [], FULL_SQUARE);

      const errors = validateParentChildUnion(buildWorld([leaf], VERTICES));

      expect(errors).toEqual([]);
    });
  });

  describe('時間スライス', () => {
    it('複数の境界時刻で違反が継続してもエラーは1回だけ報告する', () => {
      // 別地物の end 時刻で境界時刻が複数に分かれる。parent の単一錨は全スライスで有効。
      const parent = polygonFeature('parent', null, ['c1'], FULL_SQUARE);
      const c1 = polygonFeature('c1', 'parent', [], LEFT_HALF);
      const other = polygonFeature('other', null, [], SECOND_SQUARE, {
        start: START,
        end: new TimePoint(1950),
      });

      const errors = validateParentChildUnion(buildWorld([parent, c1, other], VERTICES));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('"parent"');
    });
  });
});

describe('deserialize 経由の親 ≡ 子の和検証（結合）', () => {
  it('移行期間ノードの shape が子の和と一致しない .gimoza を SerializationError で拒否する', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import(
      '@infrastructure/persistence/jsonSerializerErrors'
    );

    // parent(shape 全体, child c1) / c1(leaf 左半分) → 子の和(左半分) ≠ 親形状(全体)
    const json = {
      version: '1.0.0',
      vertices: [
        { id: 'p1', x: 0, y: 0 },
        { id: 'p2', x: 10, y: 0 },
        { id: 'p3', x: 10, y: 10 },
        { id: 'p4', x: 0, y: 10 },
        { id: 'l1', x: 0, y: 0 },
        { id: 'l2', x: 5, y: 0 },
        { id: 'l3', x: 5, y: 10 },
        { id: 'l4', x: 0, y: 10 },
      ],
      sharedVertexGroups: [],
      timelineMarkers: [],
      features: [
        {
          id: 'parent',
          featureType: 'Polygon',
          anchors: [
            {
              id: 'parent-a1',
              timeRange: { start: { year: 100 } },
              property: { name: 'parent', description: '' },
              shape: {
                type: 'Polygon',
                rings: [
                  { id: 'pr1', vertexIds: ['p1', 'p2', 'p3', 'p4'], ringType: 'territory', parentId: null },
                ],
              },
              placement: { parentId: null, childIds: ['c1'], isTopLevel: true },
            },
          ],
        },
        {
          id: 'c1',
          featureType: 'Polygon',
          anchors: [
            {
              id: 'c1-a1',
              timeRange: { start: { year: 100 } },
              property: { name: 'c1', description: '' },
              shape: {
                type: 'Polygon',
                rings: [
                  { id: 'cr1', vertexIds: ['l1', 'l2', 'l3', 'l4'], ringType: 'territory', parentId: null },
                ],
              },
              placement: { parentId: 'parent', childIds: [], isTopLevel: false },
            },
          ],
        },
      ],
      metadata: DEFAULT_METADATA,
    };

    expect(() => deserialize(JSON.stringify(json))).toThrow(SerializationError);
    expect(() => deserialize(JSON.stringify(json))).toThrow('parent ≡ children union violated');
  });
});
