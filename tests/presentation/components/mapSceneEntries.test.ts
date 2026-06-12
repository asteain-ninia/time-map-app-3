import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
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
  // shape 解決はリーフ単独描画・派生形状ルートとも `resolvePolygonAnchorPolygons`（B30 で
  // 統一）が `ring.ringType === 'territory'` を参照するため、Ring インスタンスで構築する。
  return {
    type: 'Polygon',
    rings: [new Ring(`r-${vertexIds.join('-')}`, [...vertexIds], 'territory', null)],
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

  it('派生形状を解決できない集約地物（vertexCoordinates 空）は除外する', () => {
    // child の vertexId が vertexCoordinates に存在しないため、deriveParentShape は空を返す。
    // shape を持たないコンテナで派生空 → 描画不能のため除外（開発ガイド §6.6.9）。
    // leaf は polygonRings が空配列でも entries に含める（旧挙動維持。リーフは shape を持つため
    // 「描画され得る対象」として扱う）。
    const features = [
      new Feature('leaf', 'Polygon', [
        makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3']), {
          parentId: 'container',
        }),
      ]),
      new Feature('container', 'Polygon', [
        makeAnchor('a2', 1000, 2000, undefined, { childIds: ['leaf'] }),
      ]),
    ];

    // emptyVertexCoords: leaf の頂点も派生も解決できない
    const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

    // container は派生空のため除外、leaf は polygonRings=[] でも含まれる
    expect(entries.map((e) => e.feature.id)).toEqual(['leaf']);
    expect(entries[0].polygonRings).toEqual([]);
  });

  it('集約地物（shape なし + childIds 非空）は派生形状を polygonRings に持つ', () => {
    const features = [
      new Feature('container', 'Polygon', [
        makeAnchor('a-c', 1000, 2000, undefined, { childIds: ['leaf'] }),
      ]),
      new Feature('leaf', 'Polygon', [
        makeAnchor('a-l', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
          parentId: 'container',
        }),
      ]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(10, 10)],
      ['v4', new Coordinate(0, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    // container と leaf 両方が含まれる（depth 順で container が先）
    expect(entries.map((e) => e.feature.id)).toEqual(['container', 'leaf']);
    // container の polygonRings は派生形状（子 leaf の和 = 10x10 矩形）
    const containerEntry = entries[0];
    expect(containerEntry.polygonRings).not.toBeNull();
    expect(containerEntry.polygonRings!.length).toBeGreaterThan(0);
    // 派生形状の外周頂点 x 座標は 0..10 の範囲
    const xs = containerEntry.polygonRings![0].map((c) => c.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
  });

  it('移行期間ノード（shape あり + childIds 非空）は派生形状を polygonRings に持つ', () => {
    // 親が広い shape を持つが、子は狭い領域。派生形状（子の和）が優先される。
    const features = [
      new Feature('transitional', 'Polygon', [
        // 親 shape: (-20..20)
        makeAnchor('a-t', 1000, 2000, polygonShape(['big1', 'big2', 'big3', 'big4']), {
          childIds: ['leaf'],
        }),
      ]),
      new Feature('leaf', 'Polygon', [
        // 子 shape: (0..10)
        makeAnchor('a-l', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
          parentId: 'transitional',
        }),
      ]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['big1', new Coordinate(-20, -20)],
      ['big2', new Coordinate(20, -20)],
      ['big3', new Coordinate(20, 20)],
      ['big4', new Coordinate(-20, 20)],
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(10, 10)],
      ['v4', new Coordinate(0, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);
    const transitionalEntry = entries.find((e) => e.feature.id === 'transitional');
    expect(transitionalEntry).toBeDefined();
    // 派生形状ベースなので X 範囲は 0..10
    const xs = transitionalEntry!.polygonRings![0].map((c) => c.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
  });

  it('depth 昇順で並ぶ（親→子）', () => {
    // features 入力順は子→親だが、depth 順で親が先に並ぶ
    const features = [
      new Feature('leaf', 'Polygon', [
        makeAnchor('a-l', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
          parentId: 'container',
        }),
      ]),
      new Feature('container', 'Polygon', [
        makeAnchor('a-c', 1000, 2000, undefined, { childIds: ['leaf'] }),
      ]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(10, 10)],
      ['v4', new Coordinate(0, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['container', 'leaf']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1]);
  });

  it('多段階層も depth 昇順で並ぶ', () => {
    // 入力順: 孫 → 親 → 祖父 → ルート（depth は 3 → 2 → 1 → 0）
    const features = [
      new Feature('grandchild', 'Polygon', [
        makeAnchor('a-gc', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
          parentId: 'parent',
        }),
      ]),
      new Feature('parent', 'Polygon', [
        makeAnchor('a-p', 1000, 2000, undefined, {
          childIds: ['grandchild'],
          parentId: 'grandparent',
        }),
      ]),
      new Feature('grandparent', 'Polygon', [
        makeAnchor('a-gp', 1000, 2000, undefined, { childIds: ['parent'] }),
      ]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(10, 10)],
      ['v4', new Coordinate(0, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual([
      'grandparent',
      'parent',
      'grandchild',
    ]);
  });

  it('同 depth の地物は入力順を保持する（安定ソート）', () => {
    // すべて parentId=null（depth=0）のリーフ。features 入力順がそのまま出力順になる。
    const features = [
      new Feature('f3', 'Polygon', [makeAnchor('a3', 1000, 2000, polygonShape(['v1', 'v2', 'v3']))]),
      new Feature('f1', 'Polygon', [makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3']))]),
      new Feature('f2', 'Polygon', [makeAnchor('a2', 1000, 2000, polygonShape(['v1', 'v2', 'v3']))]),
    ];
    const vertexCoords = new Map<string, Coordinate>([
      ['v1', new Coordinate(0, 0)],
      ['v2', new Coordinate(10, 0)],
      ['v3', new Coordinate(5, 10)],
    ]);

    const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

    expect(entries.map((e) => e.feature.id)).toEqual(['f3', 'f1', 'f2']);
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

  /**
   * Phase 2.5-B 規約: 「Polygon entry は必ず polygonRings !== null、Point/LineString entry は
   * 必ず polygonRings === null」。これは描画 (`FeatureRenderer`) / hitTest (`hitTestUtils`) /
   * ラベル (`LabelRenderer`) の 3 経路が `entry.polygonRings !== null` で polygon-like か
   * 判定する根拠（開発ガイド §6.6.9 適用パターン: 判定をデータ側に寄せる）。
   * 規約が崩れると判定基準のドリフトが再発するため、規約自体を unit テストで固定する。
   */
  describe('MapSceneEntry 規約: polygonRings の null/non-null は featureType と 1:1 対応', () => {
    it('Polygon リーフ entry は polygonRings !== null', () => {
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

      expect(entries[0].polygonRings).not.toBeNull();
    });

    it('Polygon リーフ entry は vertex 解決失敗でも polygonRings !== null（空配列で non-null を保証）', () => {
      const features = [
        new Feature('pg', 'Polygon', [
          makeAnchor('a1', 1000, 2000, polygonShape(['unresolved'])),
        ]),
      ];

      const entries = collectMapSceneEntries(features, new TimePoint(1500), emptyVertexCoords);

      expect(entries).toHaveLength(1);
      expect(entries[0].polygonRings).not.toBeNull();
      expect(entries[0].polygonRings).toEqual([]);
    });

    it('集約地物 entry は polygonRings !== null（派生形状解決済み）', () => {
      const features = [
        new Feature('container', 'Polygon', [
          makeAnchor('a-c', 1000, 2000, undefined, { childIds: ['leaf'] }),
        ]),
        new Feature('leaf', 'Polygon', [
          makeAnchor('a-l', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
            parentId: 'container',
          }),
        ]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(10, 10)],
        ['v4', new Coordinate(0, 10)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);
      const containerEntry = entries.find((e) => e.feature.id === 'container');

      expect(containerEntry).toBeDefined();
      expect(containerEntry!.polygonRings).not.toBeNull();
    });

    it('Point entry は polygonRings === null', () => {
      const features = [
        new Feature('p1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      ];
      const vertexCoords = new Map<string, Coordinate>([['v1', new Coordinate(0, 0)]]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].polygonRings).toBeNull();
    });

    it('LineString entry は polygonRings === null', () => {
      const lineAnchor = new FeatureAnchor(
        'a-line',
        { start: new TimePoint(1000), end: new TimePoint(2000) },
        property,
        { type: 'LineString', vertexIds: ['v1', 'v2'] },
        placement(null, [])
      );
      const features = [new Feature('ln', 'Line', [lineAnchor])];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].polygonRings).toBeNull();
    });
  });

  /**
   * Phase 2.5-C: `depth` フィールドは `HierarchyService.deriveDepth` の派生値を集約済みで
   * 保持する。経路ごとに deriveDepth を呼び直すと描画順ソート（ASC）と hitTest tie-break
   * （DESC）が同じ値を共有できなくなるため、入力時点で 1 回だけ計算して entry 側に寄せる
   * （開発ガイド §6.6.9 適用パターン）。
   */
  describe('MapSceneEntry 規約: depth フィールドは派生階層値を保持する', () => {
    it('最上位地物の depth は 0', () => {
      const features = [
        new Feature('root', 'Polygon', [
          makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3'])),
        ]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(5, 10)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].depth).toBe(0);
    });

    it('多段階層の depth が親→子で 0 → 1 → 2 と並ぶ', () => {
      const features = [
        new Feature('grandchild', 'Polygon', [
          makeAnchor('a-gc', 1000, 2000, polygonShape(['v1', 'v2', 'v3', 'v4']), {
            parentId: 'parent',
          }),
        ]),
        new Feature('parent', 'Polygon', [
          makeAnchor('a-p', 1000, 2000, undefined, {
            childIds: ['grandchild'],
            parentId: 'grandparent',
          }),
        ]),
        new Feature('grandparent', 'Polygon', [
          makeAnchor('a-gp', 1000, 2000, undefined, { childIds: ['parent'] }),
        ]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(10, 10)],
        ['v4', new Coordinate(0, 10)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries.map((e) => ({ id: e.feature.id, depth: e.depth }))).toEqual([
        { id: 'grandparent', depth: 0 },
        { id: 'parent', depth: 1 },
        { id: 'grandchild', depth: 2 },
      ]);
    });

    it('Point リーフの depth は 0', () => {
      const features = [
        new Feature('p1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'))]),
      ];
      const vertexCoords = new Map<string, Coordinate>([['v1', new Coordinate(0, 0)]]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].depth).toBe(0);
    });
  });

  /**
   * B30 解消（開発ガイド §6.6.9）: リーフ／移行期間ノード fallback の shape 解決は
   * `HierarchyService.resolvePolygonAnchorPolygons` の単一実装を共有し、描画側に
   * ローカル再実装を持たない。同関数の filter 規則（孤児 hole 除外 / 退化 territory の
   * polygon ごと除外 / territory + 直下 holes 順のフラット化）が描画経路にも適用される
   * ことを固定し、描画側ローカル再実装へ戻す回帰（解決規則のドリフト再発）を弾く。
   */
  describe('リーフ描画 rings の解決は HierarchyService と同一規則（B30 / §6.6.9）', () => {
    it('parentId を持たない孤児 hole は polygonRings から除外される', () => {
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('t1', ['v1', 'v2', 'v3'], 'territory', null),
          new Ring('h-orphan', ['v4', 'v5', 'v6'], 'hole', null),
        ],
      };
      const features = [
        new Feature('pg', 'Polygon', [makeAnchor('a1', 1000, 2000, shape)]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(5, 10)],
        ['v4', new Coordinate(2, 2)],
        ['v5', new Coordinate(4, 2)],
        ['v6', new Coordinate(3, 4)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].polygonRings).toEqual([
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
      ]);
    });

    it('親 territory が退化（3 頂点未満に解決）した場合は直下 hole ごと除外される', () => {
      // v-missing が vertexCoordinates に無いため territory t1 は 2 頂点に退化し polygon ごと
      // 除外。hole h1 自体は 3 頂点解決できても所属 polygon が消えるため描画されない
      // （hole 単独を塗り領域として描画しない）。
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('t1', ['v1', 'v2', 'v-missing'], 'territory', null),
          new Ring('h1', ['v4', 'v5', 'v6'], 'hole', 't1'),
        ],
      };
      const features = [
        new Feature('pg', 'Polygon', [makeAnchor('a1', 1000, 2000, shape)]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v4', new Coordinate(2, 2)],
        ['v5', new Coordinate(4, 2)],
        ['v6', new Coordinate(3, 4)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      // リーフは polygonRings === [] でも entry に含まれる（規約: non-null 維持）
      expect(entries).toHaveLength(1);
      expect(entries[0].polygonRings).toEqual([]);
    });

    it('飛び地は [territory, ...直下 holes] 単位の順でフラット化される（shape.rings のソース順ではない）', () => {
      // ソース順は t1, t2, h1(t1 直下) だが、polygon 単位の解決により t1, h1, t2 の順になる
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
          new Ring('t2', ['v8', 'v9', 'v10'], 'territory', null),
          new Ring('h1', ['v5', 'v6', 'v7'], 'hole', 't1'),
        ],
      };
      const features = [
        new Feature('pg', 'Polygon', [makeAnchor('a1', 1000, 2000, shape)]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(10, 10)],
        ['v4', new Coordinate(0, 10)],
        ['v5', new Coordinate(2, 2)],
        ['v6', new Coordinate(4, 2)],
        ['v7', new Coordinate(3, 4)],
        ['v8', new Coordinate(20, 0)],
        ['v9', new Coordinate(30, 0)],
        ['v10', new Coordinate(25, 10)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);

      expect(entries[0].polygonRings).toEqual([
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        [
          { x: 2, y: 2 },
          { x: 4, y: 2 },
          { x: 3, y: 4 },
        ],
        [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 25, y: 10 },
        ],
      ]);
    });

    it('移行期間ノードの fallback 解決にも同一規則（孤児 hole 除外）が適用される', () => {
      // shape あり + childIds 非空（移行期間ノード）で子の派生が空 → 自身の shape を
      // fallback 解決する経路。fallback もリーフ単独描画と同じ filter 規則を共有する。
      const shape: FeatureShape = {
        type: 'Polygon',
        rings: [
          new Ring('t1', ['v1', 'v2', 'v3'], 'territory', null),
          new Ring('h-orphan', ['v4', 'v5', 'v6'], 'hole', null),
        ],
      };
      const features = [
        new Feature('transition', 'Polygon', [
          makeAnchor('a-t', 1000, 2000, shape, { childIds: ['child'] }),
        ]),
        new Feature('child', 'Polygon', [
          makeAnchor('a-c', 1000, 2000, polygonShape(['unresolved']), {
            parentId: 'transition',
          }),
        ]),
      ];
      const vertexCoords = new Map<string, Coordinate>([
        ['v1', new Coordinate(0, 0)],
        ['v2', new Coordinate(10, 0)],
        ['v3', new Coordinate(5, 10)],
        ['v4', new Coordinate(2, 2)],
        ['v5', new Coordinate(4, 2)],
        ['v6', new Coordinate(3, 4)],
      ]);

      const entries = collectMapSceneEntries(features, new TimePoint(1500), vertexCoords);
      const transitionEntry = entries.find((e) => e.feature.id === 'transition');

      expect(transitionEntry).toBeDefined();
      expect(transitionEntry!.polygonRings).toEqual([
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
      ]);
    });
  });
});
