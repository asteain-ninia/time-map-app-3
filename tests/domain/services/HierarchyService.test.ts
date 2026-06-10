import { describe, it, expect } from 'vitest';
import {
  getParentFeature,
  getChildFeatures,
  hasChildren,
  hasParent,
  getRootFeatures,
  getDescendants,
  getAncestors,
  deriveParentShape,
  deriveDepth,
  validateHierarchy,
  isShapeEditable,
  isSplittable,
  planFeatureRemoval,
  buildParentChildLink,
  buildParentChildUnlink,
  buildDirectlyGovernedDefaultName,
  resolvePolygonAnchorPolygons,
} from '@domain/services/HierarchyService';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor, createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import { Coordinate } from '@domain/value-objects/Coordinate';

// --- ヘルパー ---

const time = new TimePoint(2000);

function makePolygonFeature(
  id: string,
  parentId: string | null,
  childIds: string[],
  vertexIds: string[] = ['v1', 'v2', 'v3']
): Feature {
  const ring = new Ring('r1', vertexIds, 'territory', null);
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: new TimePoint(1900) },
      { name: id, description: '' },
      { type: 'Polygon', rings: [ring] },
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

function makePointFeature(
  id: string,
  parentId: string | null = null,
  childIds: string[] = []
): Feature {
  return new Feature(id, 'Point', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: new TimePoint(1900) },
      { name: id, description: '' },
      { type: 'Point', vertexId: 'v1' },
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

function makeVertices(coords: [string, number, number][]): Map<string, Coordinate> {
  return new Map(coords.map(([id, x, y]) => [id, new Coordinate(x, y)]));
}

// --- テスト ---

describe('HierarchyService', () => {
  // 基本的な階層: country → [province1, province2]
  const province1 = makePolygonFeature('province1', 'country', [], ['v1', 'v2', 'v3']);
  const province2 = makePolygonFeature('province2', 'country', [], ['v4', 'v5', 'v6']);
  const country = makePolygonFeature('country', null, ['province1', 'province2']);
  const independent = makePolygonFeature('independent', null, []);
  const allFeatures = [country, province1, province2, independent];

  describe('getParentFeature', () => {
    it('子地物の親を取得できる', () => {
      const parent = getParentFeature(province1, allFeatures, time);
      expect(parent?.id).toBe('country');
    });

    it('親のない地物はundefined', () => {
      expect(getParentFeature(country, allFeatures, time)).toBeUndefined();
    });

    it('存在しない時間点ではundefined', () => {
      const futureTime = new TimePoint(1800); // 錨の開始(1900)より前
      expect(getParentFeature(province1, allFeatures, futureTime)).toBeUndefined();
    });
  });

  describe('getChildFeatures', () => {
    it('親地物の子を取得できる', () => {
      const children = getChildFeatures(country, allFeatures, time);
      expect(children.map(c => c.id).sort()).toEqual(['province1', 'province2']);
    });

    it('子のない地物は空配列', () => {
      expect(getChildFeatures(independent, allFeatures, time)).toHaveLength(0);
    });

    it('リーフノードは空配列', () => {
      expect(getChildFeatures(province1, allFeatures, time)).toHaveLength(0);
    });
  });

  describe('hasChildren / hasParent', () => {
    it('子を持つ地物はtrue', () => {
      expect(hasChildren(country, time)).toBe(true);
    });

    it('子のない地物はfalse', () => {
      expect(hasChildren(province1, time)).toBe(false);
    });

    it('親を持つ地物はtrue', () => {
      expect(hasParent(province1, time)).toBe(true);
    });

    it('親のない地物はfalse', () => {
      expect(hasParent(country, time)).toBe(false);
    });
  });

  describe('getRootFeatures', () => {
    it('ルート地物のみ返す', () => {
      const roots = getRootFeatures(allFeatures, time);
      expect(roots.map(f => f.id).sort()).toEqual(['country', 'independent']);
    });

    it('存在しない時間点では空配列', () => {
      expect(getRootFeatures(allFeatures, new TimePoint(1800))).toHaveLength(0);
    });
  });

  describe('getDescendants', () => {
    it('直接の子孫を取得できる', () => {
      const descendants = getDescendants(country, allFeatures, time);
      expect(descendants.map(d => d.id).sort()).toEqual(['province1', 'province2']);
    });

    it('深い階層の子孫を再帰的に取得できる', () => {
      // country → province1 → city
      const city = makePolygonFeature('city', 'province1', []);
      const province1WithChild = makePolygonFeature('province1', 'country', ['city']);
      const deepFeatures = [country, province1WithChild, province2, city];

      const descendants = getDescendants(country, deepFeatures, time);
      expect(descendants.map(d => d.id).sort()).toEqual(['city', 'province1', 'province2']);
    });

    it('リーフノードは空配列', () => {
      expect(getDescendants(province1, allFeatures, time)).toHaveLength(0);
    });
  });

  describe('getAncestors', () => {
    it('直接の祖先を取得できる', () => {
      const ancestors = getAncestors(province1, allFeatures, time);
      expect(ancestors.map(a => a.id)).toEqual(['country']);
    });

    it('深い階層の祖先を取得できる', () => {
      const city = makePolygonFeature('city', 'province1', []);
      const province1WithChild = makePolygonFeature('province1', 'country', ['city']);
      const deepFeatures = [country, province1WithChild, province2, city];

      const ancestors = getAncestors(city, deepFeatures, time);
      expect(ancestors.map(a => a.id)).toEqual(['province1', 'country']);
    });

    it('ルート地物は空配列', () => {
      expect(getAncestors(country, allFeatures, time)).toHaveLength(0);
    });
  });

  describe('cycle guard（§6.4.14）', () => {
    // 壊れたデータ（循環親子参照）でも無限ループ／スタックオーバーフローせず
    // 有限結果を返すことを確認する（手作りフィクスチャへの二重防御）。
    it('getAncestors: 2 要素の循環 parentId（A→B→A）でも有限結果', () => {
      const a = makePolygonFeature('A', 'B', []);
      const b = makePolygonFeature('B', 'A', []);
      const ancestors = getAncestors(a, [a, b], time);
      // B を 1 度辿った後、A は visited 済みで break。無限ループしない。
      expect(ancestors.map((f) => f.id)).toEqual(['B']);
    });

    it('getAncestors: 自己親（A→A）でも有限結果（空）', () => {
      const a = makePolygonFeature('A', 'A', []);
      expect(getAncestors(a, [a], time)).toHaveLength(0);
    });

    it('getDescendants: 2 要素の循環 childIds（A→B→A）でも有限結果', () => {
      const a = makePolygonFeature('A', null, ['B']);
      const b = makePolygonFeature('B', 'A', ['A']);
      const descendants = getDescendants(a, [a, b], time);
      // B を辿った先で A は visited 済みのため skip。無限ループしない。
      expect(descendants.map((f) => f.id)).toEqual(['B']);
    });

    it('getDescendants: 自己子（A→A）でも有限結果（空）', () => {
      const a = makePolygonFeature('A', null, ['A']);
      expect(getDescendants(a, [a], time)).toHaveLength(0);
    });
  });

  describe('deriveParentShape', () => {
    const vertices = makeVertices([
      ['v1', 0, 0], ['v2', 10, 0], ['v3', 10, 10],
      ['v4', 10, 0], ['v5', 20, 0], ['v6', 20, 10],
    ]);

    it('子地物の和を計算する', () => {
      const result = deriveParentShape(country, allFeatures, vertices, time);
      expect(result.isEmpty).toBe(false);
      expect(result.rings.length).toBeGreaterThan(0);
    });

    it('子のない地物は空結果', () => {
      const result = deriveParentShape(independent, allFeatures, vertices, time);
      expect(result.isEmpty).toBe(true);
      expect(result.rings).toHaveLength(0);
    });

    it('子が1つの場合はその形状をそのまま返す', () => {
      const singleParent = makePolygonFeature('sp', null, ['province1']);
      const features = [singleParent, province1];
      const result = deriveParentShape(singleParent, features, vertices, time);
      expect(result.isEmpty).toBe(false);
      expect(result.rings.length).toBeGreaterThan(0);
    });

    it('子がポリゴンでない場合はスキップする', () => {
      const pointChild = makePointFeature('pc', 'parent1');
      const parent = makePolygonFeature('parent1', null, ['pc']);
      const features = [parent, pointChild];
      const result = deriveParentShape(parent, features, vertices, time);
      expect(result.isEmpty).toBe(true);
    });

    it('頂点が解決できない場合はスキップする', () => {
      const emptyVertices = new Map<string, Coordinate>();
      const result = deriveParentShape(country, allFeatures, emptyVertices, time);
      expect(result.isEmpty).toBe(true);
    });

    it('子1件が離れた territory を2本持つ場合に飛び地が片落ちしない（§6.6.2 / §6.6.5）', () => {
      // 飛び地ケース: 1 つの子リーフが territory リングを 2 本持つ（離れた領土）。
      // 旧実装は shape.rings を平坦化して 1 polygon 扱いし、2 本目の territory を hole として
      // 誤解釈していた。territory ごとに polygon を分離して polygonUnionAll に渡すことで、
      // 飛び地の 2 本目の territory が hole に化けず親の派生形状に正しく取り込まれる。
      const islandLeaf = new Feature('island', 'Polygon', [
        new FeatureAnchor(
          'island-a1',
          { start: new TimePoint(1900) },
          { name: 'island', description: '' },
          {
            type: 'Polygon',
            rings: [
              new Ring('island-t1', ['iv1', 'iv2', 'iv3', 'iv4'], 'territory', null),
              new Ring('island-t2', ['iv5', 'iv6', 'iv7', 'iv8'], 'territory', null),
            ],
          },
          createAnchorPlacement('exclave-parent', [])
        ),
      ]);
      const parent = makePolygonFeature('exclave-parent', null, ['island']);
      const verts = makeVertices([
        ['iv1', 0, 0], ['iv2', 10, 0], ['iv3', 10, 10], ['iv4', 0, 10],
        ['iv5', 100, 0], ['iv6', 110, 0], ['iv7', 110, 10], ['iv8', 100, 10],
      ]);

      const result = deriveParentShape(parent, [parent, islandLeaf], verts, time);
      expect(result.isEmpty).toBe(false);
      // 飛び地の 2 territory が両方残ること（フラット化後）
      expect(result.rings.length).toBe(2);
      // 2 つの territory の経度範囲が分離している（左端 x が異なる）
      const xExtents = result.rings.map((r) => Math.min(...r.map((p) => p.x)));
      expect(new Set(xExtents).size).toBe(2);
    });

    it('離れた子の和は MultiPolygon を保持する（§6.6.5 / §6.6.9）', () => {
      // 2 個の離れた正方形を子に持つコンテナを与え、和が単一ポリゴンに潰されないこと。
      const square1Vertices: [string, number, number][] = [
        ['s1-v1', 0, 0],
        ['s1-v2', 10, 0],
        ['s1-v3', 10, 10],
        ['s1-v4', 0, 10],
      ];
      const square2Vertices: [string, number, number][] = [
        ['s2-v1', 100, 0],
        ['s2-v2', 110, 0],
        ['s2-v3', 110, 10],
        ['s2-v4', 100, 10],
      ];
      const square1 = makePolygonFeature('s1', 'multi', [], ['s1-v1', 's1-v2', 's1-v3', 's1-v4']);
      const square2 = makePolygonFeature('s2', 'multi', [], ['s2-v1', 's2-v2', 's2-v3', 's2-v4']);
      const multi = makePolygonFeature('multi', null, ['s1', 's2']);
      const verts = makeVertices([...square1Vertices, ...square2Vertices]);

      const result = deriveParentShape(multi, [multi, square1, square2], verts, time);
      expect(result.isEmpty).toBe(false);
      // territory リングが 2 本残ること（フラット化後）
      expect(result.rings.length).toBe(2);
      const xExtents = result.rings.map((r) => Math.min(...r.map((p) => p.x)));
      // ふたつの離れた territory の左端 x が異なる
      expect(new Set(xExtents).size).toBe(2);
    });

    it('集約地物（子コンテナ）の孫リーフ形状を再帰下降で取り込む（§6.6.9 多段階層）', () => {
      // 階層: root → midContainer (shape なし) → leaf1 + leaf2
      const leaf1Verts: [string, number, number][] = [
        ['l1-v1', 0, 0],
        ['l1-v2', 10, 0],
        ['l1-v3', 10, 10],
      ];
      const leaf2Verts: [string, number, number][] = [
        ['l2-v1', 100, 0],
        ['l2-v2', 110, 0],
        ['l2-v3', 110, 10],
      ];
      const leaf1 = makePolygonFeature('leaf1', 'mid', [], ['l1-v1', 'l1-v2', 'l1-v3']);
      const leaf2 = makePolygonFeature('leaf2', 'mid', [], ['l2-v1', 'l2-v2', 'l2-v3']);
      // mid は集約地物: shape なし + childIds = [leaf1, leaf2]
      const mid = new Feature('mid', 'Polygon', [
        new FeatureAnchor(
          'mid-a1',
          { start: new TimePoint(1900) },
          { name: 'mid', description: '' },
          undefined,
          createAnchorPlacement('root', ['leaf1', 'leaf2'])
        ),
      ]);
      const root = makePolygonFeature('root', null, ['mid']);
      const verts = makeVertices([...leaf1Verts, ...leaf2Verts]);

      const result = deriveParentShape(root, [root, mid, leaf1, leaf2], verts, time);
      expect(result.isEmpty).toBe(false);
      // 孫リーフ 2 個の和 = MultiPolygon territory 2 本
      expect(result.rings.length).toBe(2);
    });

    it('循環親子参照でも無限ループせず有限結果を返す（§6.4.14）', () => {
      // a → b → a の循環。validateHierarchy で検出されるべき不正データだが、
      // シリアライズを通らない直接構築経路でも runtime 安全性を保つ。
      const a = makePolygonFeature('a', 'b', ['b'], ['v1', 'v2', 'v3']);
      const b = makePolygonFeature('b', 'a', ['a'], ['v4', 'v5', 'v6']);
      const verts = makeVertices([
        ['v1', 0, 0], ['v2', 10, 0], ['v3', 10, 10],
        ['v4', 20, 0], ['v5', 30, 0], ['v6', 30, 10],
      ]);

      const result = deriveParentShape(a, [a, b], verts, time);
      // visited セットで a→b→a の戻り辺が遮断され、b の resolveChildPolygonsForUnion 内で
      // deriveParentPolygonsInternal(a, visited={a, b}) が早期 return → a の shape rings が
      // 移行期間ノード fallback として持ち上がり、b の polygonUnionAll 結果 → root の結果も
      // a の shape rings になる（b の shape ではない）。重要なのは無限再帰せず有限結果が返ること。
      expect(result.isEmpty).toBe(false);
      expect(result.rings.length).toBeGreaterThanOrEqual(1);
    });

    it('移行期間ノードの子: 派生空なら自身の shape rings を fallback として採用（§6.6.9）', () => {
      // 子 transitional は shape あり + childIds 非空。しかし transitional の子は
      // features 配列に含まれない → 派生空 → transitional 自身の shape を採用。
      const transitionalVerts: [string, number, number][] = [
        ['t-v1', 0, 0],
        ['t-v2', 10, 0],
        ['t-v3', 10, 10],
      ];
      const transitional = makePolygonFeature(
        'trans',
        'parent',
        ['missing-grandchild'],
        ['t-v1', 't-v2', 't-v3']
      );
      const parent = makePolygonFeature('parent', null, ['trans']);
      const verts = makeVertices(transitionalVerts);

      const result = deriveParentShape(parent, [parent, transitional], verts, time);
      expect(result.isEmpty).toBe(false);
      expect(result.rings.length).toBeGreaterThanOrEqual(1);
      // transitional の shape rings の経度範囲（0..10）が反映される
      const xs = result.rings.flatMap((r) => r.map((p) => p.x));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(10);
    });
  });

  describe('deriveDepth', () => {
    // 基本階層: country (root) → [province1, province2]
    it('ルート地物（parentId === null）の depth は 0', () => {
      expect(deriveDepth(country, allFeatures, time)).toBe(0);
    });

    it('直接の子の depth は 1', () => {
      expect(deriveDepth(province1, allFeatures, time)).toBe(1);
      expect(deriveDepth(province2, allFeatures, time)).toBe(1);
    });

    it('独立した最上位地物の depth も 0', () => {
      expect(deriveDepth(independent, allFeatures, time)).toBe(0);
    });

    it('多段階層では親の depth + 1 を返す（§2.1 / 現状.md §6.3）', () => {
      // country (0) → province1 (1) → city (2) → district (3)
      const district = makePolygonFeature('district', 'city', []);
      const city = makePolygonFeature('city', 'province1', ['district']);
      const province1WithChild = makePolygonFeature('province1', 'country', ['city']);
      const features = [country, province1WithChild, province2, city, district];

      expect(deriveDepth(country, features, time)).toBe(0);
      expect(deriveDepth(province1WithChild, features, time)).toBe(1);
      expect(deriveDepth(city, features, time)).toBe(2);
      expect(deriveDepth(district, features, time)).toBe(3);
    });

    it('対象時刻に有効錨がない地物は undefined', () => {
      // 錨の開始(1900)より前
      const pastTime = new TimePoint(1800);
      expect(deriveDepth(country, allFeatures, pastTime)).toBeUndefined();
      expect(deriveDepth(province1, allFeatures, pastTime)).toBeUndefined();
    });

    it('parentId が指す親が allFeatures に存在しない場合は undefined（壊れたデータ）', () => {
      const orphan = makePolygonFeature('orphan', 'nonexistent', []);
      expect(deriveDepth(orphan, [orphan], time)).toBeUndefined();
    });

    it('parentId が指す親の有効錨が時刻外で取得できない場合は undefined', () => {
      // 子は時刻 2000 でアクティブ（start=1900）だが、親は start=2200 のみアクティブ。
      // この fixture でなければ「子自身の anchor 不在」分岐に倒れて
      // 親方向の有効錨欠落分岐を踏まない（pastTime=1800 では子も親も非アクティブ）。
      const futureParent = new Feature('future-parent', 'Polygon', [
        new FeatureAnchor(
          'future-parent-a1',
          { start: new TimePoint(2200) },
          { name: 'future-parent', description: '' },
          {
            type: 'Polygon',
            rings: [new Ring('fp-r1', ['v1', 'v2', 'v3'], 'territory', null)],
          },
          createAnchorPlacement(null, ['child-of-future'])
        ),
      ]);
      const childOfFuture = makePolygonFeature('child-of-future', 'future-parent', []);
      expect(deriveDepth(childOfFuture, [futureParent, childOfFuture], time)).toBeUndefined();
    });

    it('循環親子参照でも無限ループせず undefined を返す（§6.4.14）', () => {
      // a → b → a の循環
      const a = makePolygonFeature('a', 'b', ['b']);
      const b = makePolygonFeature('b', 'a', ['a']);
      // 無限再帰せず有限時間内に undefined を返すこと
      expect(deriveDepth(a, [a, b], time)).toBeUndefined();
      expect(deriveDepth(b, [a, b], time)).toBeUndefined();
    });

    it('自己参照（parentId === 自身のid）も undefined を返す（§6.4.14）', () => {
      const selfRef = makePolygonFeature('selfref', 'selfref', []);
      expect(deriveDepth(selfRef, [selfRef], time)).toBeUndefined();
    });
  });

  describe('validateHierarchy', () => {
    it('正常な階層はエラーなし', () => {
      expect(validateHierarchy(allFeatures, time)).toHaveLength(0);
    });

    it('存在しない親を検出する', () => {
      const orphan = makePolygonFeature('orphan', 'nonexistent', []);
      const errors = validateHierarchy([orphan], time);
      expect(errors.some(e => e.type === 'parent_not_found')).toBe(true);
    });

    it('自己参照を検出する', () => {
      const selfRef = makePolygonFeature('self', 'self', []);
      const errors = validateHierarchy([selfRef], time);
      expect(errors.some(e => e.type === 'self_reference')).toBe(true);
    });

    it('循環参照を検出する', () => {
      const a = makePolygonFeature('a', 'b', ['b']);
      const b = makePolygonFeature('b', 'a', ['a']);
      const errors = validateHierarchy([a, b], time);
      expect(errors.some(e => e.type === 'circular_reference')).toBe(true);
    });

    it('ポリゴンでない親を検出する', () => {
      const pointParent = makePointFeature('pp', null, ['child1']);
      const child = makePolygonFeature('child1', 'pp', []);
      const errors = validateHierarchy([pointParent, child], time);
      expect(errors.some(e => e.type === 'parent_not_polygon')).toBe(true);
    });

    it('ポリゴンでない子を検出する', () => {
      const parent = makePolygonFeature('parent', null, ['pc']);
      const pointChild = makePointFeature('pc', 'parent');
      const errors = validateHierarchy([parent, pointChild], time);
      expect(errors.some(e => e.type === 'child_not_polygon')).toBe(true);
    });
  });

  describe('isShapeEditable', () => {
    it('リーフノードは編集可能', () => {
      expect(isShapeEditable(province1, time)).toBe(true);
    });

    it('子を持つ地物は編集不可', () => {
      expect(isShapeEditable(country, time)).toBe(false);
    });

    it('独立した地物は編集可能', () => {
      expect(isShapeEditable(independent, time)).toBe(true);
    });
  });

  describe('isSplittable', () => {
    it('リーフポリゴンは分裂可能', () => {
      expect(isSplittable(province1, time)).toBe(true);
    });

    it('子を持つポリゴンは分裂不可', () => {
      expect(isSplittable(country, time)).toBe(false);
    });

    it('ポイント地物は分裂不可', () => {
      const point = makePointFeature('p1');
      expect(isSplittable(point, time)).toBe(false);
    });
  });

  // 削除 = 全時間軸からの消滅（要件定義書 §2.1: 全時刻を通じた参照の再編 +
  // 集約地物が下位領域を全て失った場合の自動消滅）
  describe('planFeatureRemoval', () => {
    function makeContainerFeature(
      id: string,
      parentId: string | null,
      childIds: string[]
    ): Feature {
      return new Feature(id, 'Polygon', [
        new FeatureAnchor(
          `${id}-a1`,
          { start: new TimePoint(1900) },
          { name: id, description: '' },
          undefined,
          createAnchorPlacement(parentId, childIds)
        ),
      ]);
    }

    function toMap(...features: Feature[]): Map<string, Feature> {
      return new Map(features.map(f => [f.id, f]));
    }

    it('親の childIds から削除地物を除去する（兄弟が残るケース = B31）', () => {
      const parent = makeContainerFeature('p', null, ['c1', 'c2']);
      const c1 = makePolygonFeature('c1', 'p', []);
      const c2 = makePolygonFeature('c2', 'p', []);

      const plan = planFeatureRemoval('c1', toMap(parent, c1, c2));

      expect(plan.deletedFeatureIds).toEqual(['c1']);
      const updatedParent = plan.modifiedFeatures.find(f => f.id === 'p')!;
      expect(updatedParent.anchors[0].placement.childIds).toEqual(['c2']);
    });

    it('子の parentId をクリアし isTopLevel 不変条件を再構築する', () => {
      const parent = makeContainerFeature('p', null, ['c1', 'c2']);
      const c1 = makePolygonFeature('c1', 'p', []);
      const c2 = makePolygonFeature('c2', 'p', []);

      const plan = planFeatureRemoval('p', toMap(parent, c1, c2));

      expect(plan.deletedFeatureIds).toEqual(['p']);
      for (const childId of ['c1', 'c2']) {
        const updated = plan.modifiedFeatures.find(f => f.id === childId)!;
        expect(updated.anchors[0].placement.parentId).toBeNull();
        expect(updated.anchors[0].placement.isTopLevel).toBe(true);
      }
    });

    it('特定時刻の有効錨に限定せず全錨から参照を掃除する', () => {
      // 親 p: 錨1 (childIds=[x, y]) + 錨2 (childIds=[x]) — 錨2 は剪定で消える
      const parent = new Feature('p', 'Polygon', [
        new FeatureAnchor(
          'p-a1',
          { start: new TimePoint(1900), end: new TimePoint(1950) },
          { name: 'p', description: '' },
          undefined,
          createAnchorPlacement(null, ['x', 'y'])
        ),
        new FeatureAnchor(
          'p-a2',
          { start: new TimePoint(1950) },
          { name: 'p', description: '' },
          undefined,
          createAnchorPlacement(null, ['x'])
        ),
      ]);
      const x = makePolygonFeature('x', 'p', []);
      const y = makePolygonFeature('y', 'p', []);

      const plan = planFeatureRemoval('x', toMap(parent, x, y));

      const updatedParent = plan.modifiedFeatures.find(f => f.id === 'p')!;
      expect(updatedParent.anchors).toHaveLength(1);
      expect(updatedParent.anchors[0].id).toBe('p-a1');
      expect(updatedParent.anchors[0].placement.childIds).toEqual(['y']);
    });

    it('集約地物は最後の子を失うと連鎖消滅し、祖父母の参照も掃除される', () => {
      // g (集約) → p (集約) → x (末端): x 削除で p・g が連鎖消滅
      const grandParent = makeContainerFeature('g', null, ['p']);
      const parent = makeContainerFeature('p', 'g', ['x']);
      const x = makePolygonFeature('x', 'p', []);

      const plan = planFeatureRemoval('x', toMap(grandParent, parent, x));

      expect([...plan.deletedFeatureIds].sort()).toEqual(['g', 'p', 'x']);
      expect(plan.modifiedFeatures).toHaveLength(0);
    });

    it('shape を持つ親（移行期間ノード）は最後の子を失っても消滅せず末端地物へ戻る', () => {
      const parent = makePolygonFeature('p', null, ['x']);
      const x = makePolygonFeature('x', 'p', []);

      const plan = planFeatureRemoval('x', toMap(parent, x));

      expect(plan.deletedFeatureIds).toEqual(['x']);
      const updatedParent = plan.modifiedFeatures.find(f => f.id === 'p')!;
      expect(updatedParent.anchors[0].placement.childIds).toEqual([]);
      expect(updatedParent.anchors[0].shape).toBeDefined();
    });

    it('参照を持たない地物は同一インスタンスのまま modified に含まれない', () => {
      const unrelated = makePolygonFeature('u', null, []);
      const target = makePolygonFeature('t', null, []);

      const plan = planFeatureRemoval('t', toMap(unrelated, target));

      expect(plan.deletedFeatureIds).toEqual(['t']);
      expect(plan.modifiedFeatures).toHaveLength(0);
    });

    it('循環親子参照を含む壊れたデータでも無限ループしない（§6.4.14 二重防御）', () => {
      const a = makePolygonFeature('a', 'b', ['b']);
      const b = makePolygonFeature('b', 'a', ['a']);

      const plan = planFeatureRemoval('a', toMap(a, b));

      expect(plan.deletedFeatureIds).toEqual(['a']);
      const updatedB = plan.modifiedFeatures.find(f => f.id === 'b')!;
      expect(updatedB.anchors[0].placement.parentId).toBeNull();
      expect(updatedB.anchors[0].placement.childIds).toEqual([]);
    });

    it('入力の features マップを変異しない（純粋関数）', () => {
      const parent = makeContainerFeature('p', null, ['c1', 'c2']);
      const c1 = makePolygonFeature('c1', 'p', []);
      const c2 = makePolygonFeature('c2', 'p', []);
      const input = toMap(parent, c1, c2);

      planFeatureRemoval('c1', input);

      expect(input.size).toBe(3);
      expect(input.get('p')).toBe(parent);
    });
  });

  describe('buildParentChildLink', () => {
    it('親子関係を設定する錨更新を生成する', () => {
      const result = buildParentChildLink(independent, province1, time);
      expect(result).toBeDefined();
      expect(result!.parentAnchor.placement.childIds).toContain('province1');
      expect(result!.childAnchor.placement.parentId).toBe('independent');
    });

    it('存在しない時間点ではundefined', () => {
      expect(buildParentChildLink(independent, province1, new TimePoint(1800))).toBeUndefined();
    });
  });

  describe('buildParentChildUnlink', () => {
    it('親子関係を解除する錨更新を生成する', () => {
      const result = buildParentChildUnlink(country, province1, time);
      expect(result).toBeDefined();
      expect(result!.parentAnchor.placement.childIds).not.toContain('province1');
      expect(result!.childAnchor.placement.parentId).toBeNull();
    });

    it('存在しない時間点ではundefined', () => {
      expect(buildParentChildUnlink(country, province1, new TimePoint(1800))).toBeUndefined();
    });
  });

  // 直轄領のデフォルト名称（要件定義書 §2.1 line 228）。application / presentation 両層で共有する
  // 命名規則を一元化した（二重ハードコードのドリフト防止）。
  describe('buildDirectlyGovernedDefaultName', () => {
    it('元名に「 直轄領」を付与する', () => {
      expect(buildDirectlyGovernedDefaultName('日本')).toBe('日本 直轄領');
    });

    it('元名が空なら先頭空白を避け「直轄領」のみ', () => {
      expect(buildDirectlyGovernedDefaultName('')).toBe('直轄領');
      expect(buildDirectlyGovernedDefaultName('   ')).toBe('直轄領');
    });
  });

  // ポリゴン錨の rings → polygon-clipping 互換の「1 territory + 直下 holes」解決（§6.6.2）。
  // 直轄領差分の subject/clip が共有する解決規則（filter 規則）を単体で pin する
  // （§6.6.9: subject 側が別実装へ戻る回帰の検知。Phase 4-4b-1 追補申し送り）。
  describe('resolvePolygonAnchorPolygons', () => {
    function makeRingsAnchor(rings: Ring[]): FeatureAnchor {
      return new FeatureAnchor(
        'a1',
        { start: time },
        { name: 'f', description: '' },
        { type: 'Polygon', rings },
        createAnchorPlacement(null, [])
      );
    }

    const squareVertices = makeVertices([
      ['v1', 0, 0], ['v2', 10, 0], ['v3', 10, 10], ['v4', 0, 10],
      ['h1', 2, 2], ['h2', 6, 2], ['h3', 6, 6], ['h4', 2, 6],
      ['w1', 20, 0], ['w2', 30, 0], ['w3', 30, 10], ['w4', 20, 10],
    ]);

    it('territory と直下の hole を 1 polygon（[territory, ...holes]）へ束ねる', () => {
      const anchor = makeRingsAnchor([
        new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('h', ['h1', 'h2', 'h3', 'h4'], 'hole', 't1'),
      ]);
      const polygons = resolvePolygonAnchorPolygons(anchor, squareVertices);
      expect(polygons).toHaveLength(1);
      expect(polygons[0]).toHaveLength(2);
      expect(polygons[0][0]).toHaveLength(4);
    });

    it('複数 territory（飛び地）は polygon 単位で分離し、hole は parentId の territory にのみ付く', () => {
      const anchor = makeRingsAnchor([
        new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('t2', ['w1', 'w2', 'w3', 'w4'], 'territory', null),
        new Ring('h', ['h1', 'h2', 'h3', 'h4'], 'hole', 't1'),
      ]);
      const polygons = resolvePolygonAnchorPolygons(anchor, squareVertices);
      expect(polygons).toHaveLength(2);
      // t1 側は territory + hole、t2 側は territory のみ
      expect(polygons[0]).toHaveLength(2);
      expect(polygons[1]).toHaveLength(1);
    });

    it('欠落頂点は座標解決から脱落し、全欠落で 3 頂点未満になった territory は除外する', () => {
      const anchor = makeRingsAnchor([
        new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('t-missing', ['m1', 'm2', 'm3'], 'territory', null),
      ]);
      const polygons = resolvePolygonAnchorPolygons(anchor, squareVertices);
      expect(polygons).toHaveLength(1);
      expect(polygons[0][0]).toHaveLength(4);
    });

    it('3 頂点未満の退化 territory / hole は除外する', () => {
      const anchor = makeRingsAnchor([
        new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('t-deg', ['w1', 'w2'], 'territory', null),
        new Ring('h-deg', ['h1', 'h2'], 'hole', 't1'),
      ]);
      const polygons = resolvePolygonAnchorPolygons(anchor, squareVertices);
      expect(polygons).toHaveLength(1);
      expect(polygons[0]).toHaveLength(1);
    });

    it('parentId が null または存在しないリングを指す hole は捨てる', () => {
      const anchor = makeRingsAnchor([
        new Ring('t1', ['v1', 'v2', 'v3', 'v4'], 'territory', null),
        new Ring('h-null', ['h1', 'h2', 'h3', 'h4'], 'hole', null),
        new Ring('h-orphan', ['h1', 'h2', 'h3', 'h4'], 'hole', 'ghost-ring'),
      ]);
      const polygons = resolvePolygonAnchorPolygons(anchor, squareVertices);
      expect(polygons).toHaveLength(1);
      expect(polygons[0]).toHaveLength(1);
    });

    it('shape なし錨・Polygon 以外の shape は空配列を返す', () => {
      const containerAnchor = new FeatureAnchor(
        'a-container',
        { start: time },
        { name: 'c', description: '' },
        undefined,
        createAnchorPlacement(null, ['child'])
      );
      expect(resolvePolygonAnchorPolygons(containerAnchor, squareVertices)).toEqual([]);

      const pointAnchor = new FeatureAnchor(
        'a-point',
        { start: time },
        { name: 'p', description: '' },
        { type: 'Point', vertexId: 'v1' },
        createAnchorPlacement(null, [])
      );
      expect(resolvePolygonAnchorPolygons(pointAnchor, squareVertices)).toEqual([]);
    });
  });
});
