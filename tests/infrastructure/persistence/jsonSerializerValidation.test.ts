import { describe, it, expect } from 'vitest';
import { DEFAULT_METADATA } from '@domain/entities/World';
import { validateJsonWorld } from '@infrastructure/persistence/jsonSerializerValidation';
import type {
  JsonAnchorPlacement,
  JsonAnchorProperty,
  JsonFeature,
  JsonFeatureAnchor,
  JsonFeatureShape,
  JsonTimeRange,
  JsonWorld,
} from '@infrastructure/persistence/jsonSerializerTypes';

const TIME_RANGE = { start: { year: 100 } };
const PROPERTY: JsonAnchorProperty = { name: 'test', description: '' };

function createPlacement(overrides: Partial<JsonAnchorPlacement> = {}): JsonAnchorPlacement {
  return {
    parentId: null,
    childIds: [],
    isTopLevel: true,
    ...overrides,
  };
}

function createAnchor(
  shape: JsonFeatureShape | undefined,
  placement: JsonAnchorPlacement
): JsonFeatureAnchor {
  return {
    id: 'a1',
    timeRange: TIME_RANGE,
    property: PROPERTY,
    shape,
    placement,
  };
}

function createFeature(
  featureType: string,
  anchors: JsonFeatureAnchor[],
  id = 'f1'
): JsonFeature {
  return { id, featureType, anchors };
}

function createWorld(features: JsonFeature[]): JsonWorld {
  return {
    version: '1.0.0',
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 10, y: 0 },
      { id: 'v3', x: 0, y: 10 },
      { id: 'v4', x: 10, y: 10 },
    ],
    sharedVertexGroups: [],
    timelineMarkers: [],
    features,
    metadata: DEFAULT_METADATA,
  };
}

const TRIANGLE_RING = {
  id: 'r1',
  vertexIds: ['v1', 'v2', 'v3'],
  ringType: 'territory',
  parentId: null,
};

describe('validateJsonWorld - shape 保持規則 (Phase 2-C-4)', () => {
  describe('合格ケース', () => {
    it('Point feature が Point shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'Point', vertexId: 'v1' },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('Line feature が LineString shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('Polygon feature が Polygon shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('集約地物（Polygon + shape 欠落 + childIds 非空）はエラーが出ない', () => {
      const containerAnchor = createAnchor(
        undefined,
        createPlacement({ childIds: ['f-child'] })
      );
      const childAnchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement({ parentId: 'f-container', isTopLevel: false })
      );
      const world = createWorld([
        createFeature('Polygon', [containerAnchor], 'f-container'),
        createFeature('Polygon', [childAnchor], 'f-child'),
      ]);

      const errors = validateJsonWorld(world);

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });
  });

  describe('shape 欠落のエラー', () => {
    it('Polygon feature で shape 欠落かつ childIds 空の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" has no shape but is not a container (childIds is empty)'
      );
    });

    it('Point feature で shape 欠落の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" of type "Point" requires a shape'
      );
    });

    it('Line feature で shape 欠落の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" of type "Line" requires a shape'
      );
    });
  });

  describe('featureType と shape.type の不整合エラー', () => {
    it('Point feature に LineString shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "LineString" does not match featureType "Point"'
      );
    });

    it('Line feature に Polygon shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "Polygon" does not match featureType "Line"'
      );
    });

    it('Polygon feature に Point shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'Point', vertexId: 'v1' },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "Point" does not match featureType "Polygon"'
      );
    });
  });
});

/**
 * Phase 3-1: 階層参照の構造的健全性バリデーション（ロード時）。
 * 要件定義書 §2.5.2「データ読み込み時の詳細な挙動」のデータ整合性チェック
 * 「ツリー位相の不整合（…子の親側参照欠落、親の子側参照欠落 など）」のうち、
 * 各錨ローカルで完結する参照整合（存在・Polygon 型・自己参照・重複）を対象とする。
 * §2.1: 集約地物・上位領域を担えるのは Polygon のみ。開発ガイド §6.6.8。
 */
describe('validateJsonWorld - 階層参照の構造的健全性 (Phase 3-1)', () => {
  describe('合格ケース（正しいツリーを誤拒否しない）', () => {
    it('集約地物（コンテナ）+ 子 Polygon の正常な親子参照はエラーが出ない', () => {
      const container = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['child'] }))],
        'container'
      );
      const child = createFeature(
        'Polygon',
        [
          createAnchor(
            { type: 'Polygon', rings: [TRIANGLE_RING] },
            createPlacement({ parentId: 'container', isTopLevel: false })
          ),
        ],
        'child'
      );

      const errors = validateJsonWorld(createWorld([container, child]));

      expect(errors).toEqual([]);
    });

    it('多段階層（祖父→親→子、すべて Polygon）の参照はエラーが出ない', () => {
      const grandparent = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['parent'] }))],
        'grandparent'
      );
      const parent = createFeature(
        'Polygon',
        [
          createAnchor(
            undefined,
            createPlacement({ parentId: 'grandparent', childIds: ['child'], isTopLevel: false })
          ),
        ],
        'parent'
      );
      const child = createFeature(
        'Polygon',
        [
          createAnchor(
            { type: 'Polygon', rings: [TRIANGLE_RING] },
            createPlacement({ parentId: 'parent', isTopLevel: false })
          ),
        ],
        'child'
      );

      const errors = validateJsonWorld(createWorld([grandparent, parent, child]));

      expect(errors).toEqual([]);
    });

    it('親子関係を持たない単独地物はエラーが出ない', () => {
      const point = createFeature('Point', [
        createAnchor({ type: 'Point', vertexId: 'v1' }, createPlacement()),
      ]);

      const errors = validateJsonWorld(createWorld([point]));

      expect(errors).toEqual([]);
    });
  });

  describe('parentId の参照エラー', () => {
    it('parentId が自身を指す場合は自己参照エラー', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement({ parentId: 'f1', isTopLevel: false })
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain('Feature "f1" anchor "a1" references itself as parent');
    });

    it('parentId が存在しない地物を指す場合はエラー', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement({ parentId: 'ghost', isTopLevel: false })
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain('Feature "f1" anchor "a1" references non-existent parent "ghost"');
    });

    it('parentId が Polygon でない地物（Point）を指す場合はエラー', () => {
      const pointParent = createFeature(
        'Point',
        [createAnchor({ type: 'Point', vertexId: 'v1' }, createPlacement())],
        'point-parent'
      );
      const child = createFeature(
        'Polygon',
        [
          createAnchor(
            { type: 'Polygon', rings: [TRIANGLE_RING] },
            createPlacement({ parentId: 'point-parent', isTopLevel: false })
          ),
        ],
        'child'
      );

      const errors = validateJsonWorld(createWorld([pointParent, child]));

      expect(errors).toContain('Feature "child" anchor "a1" parent "point-parent" is not a Polygon');
    });
  });

  describe('childIds の参照エラー', () => {
    it('childIds に重複がある場合はエラー', () => {
      const container = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['child', 'child'] }))],
        'container'
      );
      const child = createFeature(
        'Polygon',
        [
          createAnchor(
            { type: 'Polygon', rings: [TRIANGLE_RING] },
            createPlacement({ parentId: 'container', isTopLevel: false })
          ),
        ],
        'child'
      );

      const errors = validateJsonWorld(createWorld([container, child]));

      expect(errors).toContain('Feature "container" anchor "a1" contains duplicate child "child"');
    });

    it('childIds に自身を含む場合は自己参照エラー', () => {
      const anchor = createAnchor(undefined, createPlacement({ childIds: ['f1'] }));
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain('Feature "f1" anchor "a1" references itself as child');
    });

    it('childIds が存在しない地物を指す場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement({ childIds: ['ghost'] }));
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor], 'container')]));

      expect(errors).toContain('Feature "container" anchor "a1" references non-existent child "ghost"');
    });

    it('childIds が Polygon でない地物（Point）を指す場合はエラー', () => {
      const container = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['point-child'] }))],
        'container'
      );
      const pointChild = createFeature(
        'Point',
        [createAnchor({ type: 'Point', vertexId: 'v1' }, createPlacement())],
        'point-child'
      );

      const errors = validateJsonWorld(createWorld([container, pointChild]));

      expect(errors).toContain('Feature "container" anchor "a1" child "point-child" is not a Polygon');
    });
  });

  describe('階層参加の型エラー（参加できるのは面情報 = Polygon のみ）', () => {
    it('childIds が非空だが地物自身が Polygon でない（Point）場合はエラー', () => {
      const pointWithChild = createFeature(
        'Point',
        [createAnchor({ type: 'Point', vertexId: 'v1' }, createPlacement({ childIds: ['child'] }))],
        'point-with-child'
      );
      const child = createFeature(
        'Polygon',
        [createAnchor({ type: 'Polygon', rings: [TRIANGLE_RING] }, createPlacement())],
        'child'
      );

      const errors = validateJsonWorld(createWorld([pointWithChild, child]));

      expect(errors).toContain(
        'Feature "point-with-child" anchor "a1" has children but feature type "Point" is not a Polygon'
      );
    });

    it('parentId が非 null だが地物自身が Polygon でない（Point）場合はエラー', () => {
      // 線情報・点情報は面情報の階層に参加できない（要件定義書 §2.1 line 160）。
      const polygonParent = createFeature(
        'Polygon',
        [createAnchor({ type: 'Polygon', rings: [TRIANGLE_RING] }, createPlacement())],
        'polygon-parent'
      );
      const pointWithParent = createFeature(
        'Point',
        [
          createAnchor(
            { type: 'Point', vertexId: 'v1' },
            createPlacement({ parentId: 'polygon-parent', isTopLevel: false })
          ),
        ],
        'point-with-parent'
      );

      const errors = validateJsonWorld(createWorld([polygonParent, pointWithParent]));

      expect(errors).toContain(
        'Feature "point-with-parent" anchor "a1" has a parent but feature type "Point" is not a Polygon'
      );
    });
  });

  /**
   * 開発ガイド §6.4.15「永続化 shim は read / write / validate / round-trip test を
   * 同じ変更単位で同期する」。新たな参照整合検証が正しいコンテナ＋子のツリーを
   * 誤拒否せず、再保存→再読込が往復することを固定する。
   */
  it('正常な親子構造の .gimoza は再保存→再読込が往復する（誤拒否しない）', async () => {
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const validHierarchyJson = JSON.stringify({
      version: '1.0.0',
      vertices: [
        { id: 'v1', x: 0, y: 0 },
        { id: 'v2', x: 10, y: 0 },
        { id: 'v3', x: 0, y: 10 },
      ],
      features: [
        {
          id: 'container',
          featureType: 'Polygon',
          anchors: [
            {
              id: 'ac',
              timeRange: { start: { year: 100 } },
              property: { name: 'コンテナ', description: '' },
              // 集約地物: shape フィールド自体を持たない
              placement: { parentId: null, childIds: ['child'], isTopLevel: true },
            },
          ],
        },
        {
          id: 'child',
          featureType: 'Polygon',
          anchors: [
            {
              id: 'ach',
              timeRange: { start: { year: 100 } },
              property: { name: '子', description: '' },
              shape: {
                type: 'Polygon',
                rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
              },
              placement: { parentId: 'container', childIds: [], isTopLevel: false },
            },
          ],
        },
      ],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    // 正常な親子構造 → in-memory World（誤拒否されない）
    const world = deserialize(validHierarchyJson);
    // in-memory → 再保存
    const resavedJsonString = serialize(world);
    const resaved = JSON.parse(resavedJsonString);

    // 再保存ファイルが validateJsonWorld を通る
    expect(validateJsonWorld(resaved)).toEqual([]);

    // 親子参照が保たれている
    expect(resaved.features.find((f: { id: string }) => f.id === 'container').anchors[0].placement.childIds).toEqual([
      'child',
    ]);
    expect(resaved.features.find((f: { id: string }) => f.id === 'child').anchors[0].placement.parentId).toBe(
      'container'
    );

    // さらに再ロードできる
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });
});

/**
 * Phase 3-2: 親子相互整合（双方向の参照欠落・時間区間カバレッジ）+ 循環検出（時間スライス）。
 * 要件定義書 §2.5.2 line 936「ツリー位相の不整合（…循環参照、子の親側参照欠落、親の子側参照欠落 など）」。
 * placement は錨ごとに時間依存のため、全錨の境界時刻で区切る時間スライスごとに評価する。
 * ランタイム版 `HierarchyService.validateHierarchy`（循環・親存在）/
 * `ReassignFeatureParentUseCase.validateChildReferences`（親→子整合）と判定を揃える。
 */
describe('validateJsonWorld - 親子相互整合・循環検出（時間スライス） (Phase 3-2)', () => {
  const POLY_SHAPE: JsonFeatureShape = { type: 'Polygon', rings: [TRIANGLE_RING] };

  function anchorAt(
    id: string,
    timeRange: JsonTimeRange,
    shape: JsonFeatureShape | undefined,
    placement: JsonAnchorPlacement
  ): JsonFeatureAnchor {
    return { id, timeRange, property: PROPERTY, shape, placement };
  }

  describe('合格ケース（正しいツリー・時変ツリーを誤拒否しない）', () => {
    it('時変連邦シナリオ（早期は最上位 / 後期は連邦の子）はエラーが出ない', () => {
      // c1 は [100,200) で最上位、[200,∞) で連邦 fed の子。fed は [200,∞) のみ存在。
      const fed = createFeature(
        'Polygon',
        [anchorAt('af', { start: { year: 200 } }, undefined, createPlacement({ childIds: ['c1'] }))],
        'fed'
      );
      const c1 = createFeature(
        'Polygon',
        [
          anchorAt('ac-early', { start: { year: 100 }, end: { year: 200 } }, POLY_SHAPE, createPlacement()),
          anchorAt(
            'ac-late',
            { start: { year: 200 } },
            POLY_SHAPE,
            createPlacement({ parentId: 'fed', isTopLevel: false })
          ),
        ],
        'c1'
      );

      const errors = validateJsonWorld(createWorld([fed, c1]));

      expect(errors).toEqual([]);
    });

    it('時変連邦シナリオは deserialize で例外を投げない', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const fed = createFeature(
        'Polygon',
        [anchorAt('af', { start: { year: 200 } }, undefined, createPlacement({ childIds: ['c1'] }))],
        'fed'
      );
      const c1 = createFeature(
        'Polygon',
        [
          anchorAt('ac-early', { start: { year: 100 }, end: { year: 200 } }, POLY_SHAPE, createPlacement()),
          anchorAt(
            'ac-late',
            { start: { year: 200 } },
            POLY_SHAPE,
            createPlacement({ parentId: 'fed', isTopLevel: false })
          ),
        ],
        'c1'
      );

      expect(() => deserialize(JSON.stringify(createWorld([fed, c1])))).not.toThrow();
    });

    it('複数の子を持つコンテナが双方向に整合していればエラーが出ない', () => {
      const container = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['c1', 'c2'] }))],
        'container'
      );
      const c1 = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'container', isTopLevel: false }))],
        'c1'
      );
      const c2 = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'container', isTopLevel: false }))],
        'c2'
      );

      const errors = validateJsonWorld(createWorld([container, c1, c2]));

      expect(errors).toEqual([]);
    });
  });

  describe('親の子側参照欠落（子が親を指すが親が子を列挙しない）', () => {
    it('子の parentId が指す親の childIds に当該子が含まれない場合はエラー', () => {
      // P は legit のみを子に持つ正当なコンテナ。C は P を親に指すが P は C を列挙しない。
      const parent = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['legit'] }))],
        'P'
      );
      const legit = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'P', isTopLevel: false }))],
        'legit'
      );
      const orphanChild = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'P', isTopLevel: false }))],
        'C'
      );

      const errors = validateJsonWorld(createWorld([parent, legit, orphanChild]));

      expect(errors).toContain(
        'Feature "C" anchor "a1" references parent "P" which does not list it as a child'
      );
    });
  });

  describe('子の親側参照欠落（親が子を列挙するが子が親を指さない）', () => {
    it('親の childIds に挙がる子の parentId が親を指していない場合はエラー', () => {
      // P は C を子に列挙するが、C は最上位（parentId=null）のまま P を指していない。
      const parent = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ childIds: ['C'] }))],
        'P'
      );
      const child = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement())],
        'C'
      );

      const errors = validateJsonWorld(createWorld([parent, child]));

      expect(errors).toContain(
        'Feature "P" anchor "a1" lists child "C" which does not reference it as parent'
      );
    });
  });

  describe('時間区間カバレッジ', () => {
    it('子が親を指す期間に親が存在しない時刻があるとエラー', () => {
      // C は [100,∞) で fed を親に指すが、fed は [100,200) のみ存在。T=200 で親が非有効。
      const fed = createFeature(
        'Polygon',
        [anchorAt('af', { start: { year: 100 }, end: { year: 200 } }, undefined, createPlacement({ childIds: ['C'] }))],
        'fed'
      );
      const child = createFeature(
        'Polygon',
        [anchorAt('ac', { start: { year: 100 } }, POLY_SHAPE, createPlacement({ parentId: 'fed', isTopLevel: false }))],
        'C'
      );

      const errors = validateJsonWorld(createWorld([fed, child]));

      expect(errors).toContain(
        'Feature "C" anchor "ac" references parent "fed" which is not active at the same time'
      );
    });

    it('親が子を列挙する期間に子が存在しない時刻があるとエラー', () => {
      // P は [100,∞) で C を子に列挙するが、C は [100,200) のみ存在。T=200 で子が非有効。
      const parent = createFeature(
        'Polygon',
        [anchorAt('ap', { start: { year: 100 } }, undefined, createPlacement({ childIds: ['C'] }))],
        'P'
      );
      const child = createFeature(
        'Polygon',
        [anchorAt('ac', { start: { year: 100 }, end: { year: 200 } }, POLY_SHAPE, createPlacement({ parentId: 'P', isTopLevel: false }))],
        'C'
      );

      const errors = validateJsonWorld(createWorld([parent, child]));

      expect(errors).toContain(
        'Feature "P" anchor "ap" lists child "C" which is not active at the same time'
      );
    });
  });

  describe('循環参照（時間スライス）', () => {
    it('相互参照の2地物循環を循環メンバーとして検出する', () => {
      // A↔B: 双方向参照は整合（reciprocal）だが親方向に循環する。
      const a = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ parentId: 'B', childIds: ['B'], isTopLevel: false }))],
        'A'
      );
      const b = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ parentId: 'A', childIds: ['A'], isTopLevel: false }))],
        'B'
      );

      const errors = validateJsonWorld(createWorld([a, b]));

      expect(errors).toContain('Feature "A" is part of a circular parent reference');
      expect(errors).toContain('Feature "B" is part of a circular parent reference');
    });

    it('循環へ流れ込むだけの尾は循環メンバーとして報告しない', () => {
      // A↔B が循環。D は A を親に指すが循環には乗っていない（尾）。
      const a = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ parentId: 'B', childIds: ['B', 'D'], isTopLevel: false }))],
        'A'
      );
      const b = createFeature(
        'Polygon',
        [createAnchor(undefined, createPlacement({ parentId: 'A', childIds: ['A'], isTopLevel: false }))],
        'B'
      );
      const d = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'A', isTopLevel: false }))],
        'D'
      );

      const errors = validateJsonWorld(createWorld([a, b, d]));

      expect(errors).toContain('Feature "A" is part of a circular parent reference');
      expect(errors).toContain('Feature "B" is part of a circular parent reference');
      expect(errors).not.toContain('Feature "D" is part of a circular parent reference');
    });

    it('自己親（parentId === 自身）は Phase 3-1 が報告し、循環としては併報しない', () => {
      // 自己ループは長さ1の循環だが、二重報告を避け循環チェックはスキップする
      // （JSDoc「自己参照は Phase 3-1 が報告するためスキップ」とコードを一致させる）。
      const selfParent = createFeature(
        'Polygon',
        [createAnchor(POLY_SHAPE, createPlacement({ parentId: 'self', isTopLevel: false }))],
        'self'
      );

      const errors = validateJsonWorld(createWorld([selfParent]));

      expect(errors).not.toContain('Feature "self" is part of a circular parent reference');
      // 拒否自体は Phase 3-1 の自己参照エラーで担保される
      expect(errors).toContain('Feature "self" anchor "a1" references itself as parent');
    });
  });
});

/**
 * Phase 2-D-6-3c で `JsonAnchorPlacement.layerId` を、Phase 2-D-7c-2b で
 * `JsonWorld.layers` フィールドを JSON 型から完全撤去した。
 * 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
 * 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
 * 現状.md §6.2「既存 .gimoza 互換性は破棄する（移行マイグレーションは実装しない）」。
 *
 * 旧 .gimoza（anchor.placement.layerId フィールドを含む形式）は読み込み時に
 * `SerializationError` で拒否される。
 *
 * 開発ガイド §6.4.15「永続化 shim は read / write / validate / round-trip test を
 * 同じ変更単位で同期する」に従い、本テストでは
 *   - 旧形式（layerId 含む）→ 読み込み拒否
 *   - 新形式（layerId なし）→ 読込 → 再保存 → 再読み込みが通る
 *   - 新形式の再保存ファイルに `placement.layerId` / `world.layers` が残っていない
 * を固定する。
 */
describe('互換破棄の検証 (Phase 2-D-6-3c / 2-D-7c-2b)', () => {
  it('旧形式（placement.layerId を含む）は読み込みエラーで拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const oldJsonString = JSON.stringify({
      version: '1.0.0',
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    expect(() => deserialize(oldJsonString)).toThrow(SerializationError);
    expect(() => deserialize(oldJsonString)).toThrow('placement.layerId を含む形式');
    expect(() => deserialize(oldJsonString)).toThrow('新規プロジェクトを開始してください');
  });

  it('カスタムレイヤーを持つ旧形式も同様に拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const oldJsonString = JSON.stringify({
      version: '1.0.0',
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { layerId: 'custom-layer', parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    expect(() => deserialize(oldJsonString)).toThrow(SerializationError);
    expect(() => deserialize(oldJsonString)).toThrow('placement.layerId を含む形式');
  });

  it('新形式（layerId なし）→ 再保存 → 再読み込みは正常に往復する', async () => {
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const newJsonString = JSON.stringify({
      version: '1.0.0',
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    // 新形式 → in-memory World
    const world = deserialize(newJsonString);
    // in-memory → 再保存
    const resavedJsonString = serialize(world);
    const resaved = JSON.parse(resavedJsonString);

    // 再保存ファイルの placement に layerId が含まれない
    const resavedPlacement = resaved.features[0].anchors[0].placement;
    expect('layerId' in resavedPlacement).toBe(false);

    // 再保存ファイルに world.layers フィールドも残らない（Phase 2-D-7c-2b で完全撤去）
    expect('layers' in resaved).toBe(false);

    // 再保存ファイルが validateJsonWorld を通る
    const errors = validateJsonWorld(resaved);
    expect(errors).toEqual([]);

    // さらにこのファイルを再ロードできる（例外を投げない）
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });

  it('中間形式（D-7c-2a 形式: layers: [...] を含むが placement.layerId なし）→ 再保存で layers キーが消える', async () => {
    // Phase 2-D-7c-2a で SaveLoadUseCase.assembleWorld が `layers: []` 固定値で出力していた
    // 期間に保存された .gimoza は v1.0.0 形式かつ `layers` フィールドを含むが
    // `placement.layerId` を含まない（中間形式）。本サブフェーズ後のコードでこれを開いて
    // 再保存できる（layers 中身は read 時に無視され、再保存ファイルから layers キーが消える）
    // ことを §6.4.15 round-trip テストとして固定する。
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const intermediateJsonString = JSON.stringify({
      version: '1.0.0',
      // 中間形式: layers フィールド自体は出力されていたが、中身は default 1 件のみ
      layers: [{ id: 'default', name: 'レイヤー1', order: 0, visible: true, opacity: 1.0 }],
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          // placement.layerId は含まない（D-6-3c 以降の形式）
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    // 中間形式 → in-memory World（layers は読み捨てられる）
    const world = deserialize(intermediateJsonString);
    // in-memory → 再保存
    const resavedJsonString = serialize(world);
    const resaved = JSON.parse(resavedJsonString);

    // 再保存ファイルに layers キーが含まれない
    expect('layers' in resaved).toBe(false);

    // 地物本体は維持される
    expect(resaved.features).toHaveLength(1);
    expect(resaved.features[0].id).toBe('f1');

    // 再保存ファイルが validateJsonWorld を通る
    const errors = validateJsonWorld(resaved);
    expect(errors).toEqual([]);

    // さらに再ロードできる
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });
});

/**
 * Phase 2-D-7c-1 で `jsonSerializerMigration.ts` から旧形式変換ロジック（anchors 欠落の
 * 単一地物変換、`shape.type: 'Line'` → `'LineString'` 変換、`ringType` 推測、`timeRange` /
 * `property` 直下 fallback など）を撤去した。`resolveVersion` で旧バージョン（0.x / version 欠落）は
 * 先に拒否されるため migration 経路には到達しないが、`version: '1.0.0'` のまま旧構造を含む
 * 入力（手編集 JSON / 外部生成 JSON）は migration 内部で `SerializationError` 即拒否となる。
 *
 * 開発ガイド §6.4.15「永続化 shim は read / write / validate / round-trip test を
 * 同じ変更単位で同期する」に従い、削除した分岐の拒否挙動を直接固定する。
 */
describe('v1.0.0 旧構造の拒否 (Phase 2-D-7c-1)', () => {
  function baseV1Payload(): Record<string, unknown> {
    return {
      version: '1.0.0',
      vertices: [
        { id: 'v1', x: 0, y: 0 },
        { id: 'v2', x: 10, y: 0 },
        { id: 'v3', x: 0, y: 10 },
      ],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    };
  }

  it('features[].anchors 欠落（旧形式の単一地物構造）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Point',
        // anchors フィールド自体を欠落させる（旧 normalizeLegacyFeatureAnchor の入力経路）
        timeRange: { start: { year: 100 } },
        property: { name: 'test', description: '' },
        shape: { type: 'Point', vertexId: 'v1' },
        placement: { parentId: null, childIds: [], isTopLevel: true },
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    expect(() => deserialize(payload)).toThrow('features[0].anchors must be an array');
  });

  it('shape.type: "Line"（旧形式の shape タイプ表記）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Line',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          // 旧形式の shape.type: 'Line'。新形式は 'LineString'
          shape: { type: 'Line', vertexIds: ['v1', 'v2'] },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    // 新コードの normalizeShape は shape.type === 'Line' をそのまま { type: 'Line' } として返し、
    // 後段の validateShapePresence で featureType: 'Line' に対応する 'LineString' との不整合として拒否される
    // （migration sweep 後に shape.type 検証が validation 側で動いていることを明示）
    expect(() => deserialize(payload)).toThrow('shape.type "Line" does not match featureType "Line"');
  });

  it('Polygon リングの ringType 欠落（旧形式の位置依存推測）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Polygon',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: {
            type: 'Polygon',
            rings: [{
              id: 'r1',
              vertexIds: ['v1', 'v2', 'v3'],
              // ringType フィールド欠落
              parentId: null,
            }],
          },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    expect(() => deserialize(payload)).toThrow('ringType');
  });

  // 旧 normalizeTimeRange は anchor.timeRange が無いとき、地物・錨直下の `time` /
  // `startYear` / `endYear` フィールドへフォールバックしていた。これらは Phase 2-D-7c-1 で
  // 全削除済み。各バリアント（timeRange 欠落のみ / 旧 time フィールド存在 / 旧 startYear 存在）
  // を直接押さえる。
  describe('anchor の timeRange / 旧 time / 旧 startYear（旧形式の時間 fallback）', () => {
    function payloadWithTimeOverride(timeFields: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            ...timeFields,
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('timeRange フィールド欠落のみは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({});

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });

    it('旧形式 time フィールド（timeRange なし + time: { year } 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({ time: { year: 100 } });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });

    it('旧形式 startYear / endYear フィールド（timeRange なし + startYear/endYear 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({ startYear: 1200, endYear: 1500 });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });
  });

  // 旧 normalizeAnchorProperty は anchor.property が無いとき、地物直下の `properties[0]`
  // 配列の先頭要素へフォールバックしていた。Phase 2-D-7c-1 で削除済み。
  describe('anchor の property / 旧 properties[0] 配列（旧形式の property fallback）', () => {
    function payloadWithPropertyOverride(extra: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            ...extra,
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('property フィールド欠落のみは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithPropertyOverride({});

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('property');
    });

    it('旧形式 properties[0] 配列（property なし + properties: [{ name }] 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithPropertyOverride({
        properties: [{ name: 'legacy-name', description: 'legacy-desc' }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('property');
    });
  });

  // 旧 normalizeFeatureType は `'LineString'` / `'point'` / `'line'` / `'polygon'` を
  // 新形式の PascalCase へ補正していた。Phase 2-D-7c-1 で削除済み。
  describe('featureType の旧形式表記（LineString / 小文字）', () => {
    function payloadWithFeatureType(featureType: string, shape: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType,
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape,
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('featureType: "LineString" は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('LineString', { type: 'LineString', vertexIds: ['v1', 'v2'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: LineString');
    });

    it('featureType: "point" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('point', { type: 'Point', vertexId: 'v1' });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: point');
    });

    it('featureType: "line" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('line', { type: 'LineString', vertexIds: ['v1', 'v2'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: line');
    });

    it('featureType: "polygon" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('polygon', {
        type: 'Polygon',
        rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: polygon');
    });
  });

  // 旧 hasShapeSource は anchor.shape が無くても、anchor 直下の `vertexIds` / `rings` /
  // `vertexId` を「shape 直書き」として認識し、`normalizeShape(shape=undefined, fallbackSource=record)`
  // で fallbackSource からリングや頂点を読みに行く経路を持っていた。Phase 2-D-7c-1 で削除済み。
  describe('anchor 直下の旧形式 shape 表現（shape 欠落 + 直下 vertexIds / rings / vertexId）', () => {
    function payloadWithAnchorShapeFields(featureType: string, anchorShapeFields: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType,
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            // shape フィールド自体は欠落させ、旧形式の anchor 直下フィールドで形状を表現
            ...anchorShapeFields,
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('Polygon + anchor 直下 vertexIds 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Polygon', { vertexIds: ['v1', 'v2', 'v3'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      // shape 欠落 + childIds 空 → 「is not a container」エラー
      expect(() => deserialize(payload)).toThrow('has no shape but is not a container');
    });

    it('Polygon + anchor 直下 rings 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Polygon', {
        rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('has no shape but is not a container');
    });

    it('Point + anchor 直下 vertexId 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Point', { vertexId: 'v1' });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      // shape 欠落 + Point → 「requires a shape」エラー
      expect(() => deserialize(payload)).toThrow('requires a shape');
    });
  });

  it('Polygon の vertexIds 直下指定（旧形式の領土リング直書き、shape 内）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Polygon',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          // 旧形式: shape.rings ではなく shape.vertexIds で領土リングを直書き
          // 新コードでは shape.rings 配列が無いため normalizeShape は空 Polygon（{ type: 'Polygon' }、
          // rings undefined）を返し、後段の validation で領土リング欠落として拒否される
          shape: { type: 'Polygon', vertexIds: ['v1', 'v2', 'v3'] },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
  });
});
