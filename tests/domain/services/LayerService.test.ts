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
  validateHierarchy,
  isShapeEditable,
  isSplittable,
  shouldParentDisappear,
  buildParentChildLink,
  buildParentChildUnlink,
} from '@domain/services/LayerService';
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
      createAnchorPlacement('l1', parentId, childIds)
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
      createAnchorPlacement('l1', parentId, childIds)
    ),
  ]);
}

function makeVertices(coords: [string, number, number][]): Map<string, Coordinate> {
  return new Map(coords.map(([id, x, y]) => [id, new Coordinate(x, y)]));
}

// --- テスト ---

describe('LayerService', () => {
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

  describe('shouldParentDisappear', () => {
    it('最後の子を除去すると親が消失する', () => {
      const singleParent = makePolygonFeature('sp', null, ['only_child']);
      const child = makePolygonFeature('only_child', 'sp', []);
      const features = [singleParent, child];
      expect(shouldParentDisappear(singleParent, features, 'only_child', time)).toBe(true);
    });

    it('子が残っていれば親は存続する', () => {
      expect(shouldParentDisappear(country, allFeatures, 'province1', time)).toBe(false);
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
});
