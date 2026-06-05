import { describe, it, expect } from 'vitest';
import {
  buildNewFeatureParentCandidateItems,
  buildParentCandidateItems,
  canTransferChildren,
  canTransferSelectedFeature,
  collectDescendantIds,
  getActivePolygonAnchor,
  getTransferFeatureIds,
  isLeafFromTime,
  resolveParentTransferSelection,
  resolveParentTransferTarget,
} from '@presentation/components/parentTransferDialogUtils';
import { Feature } from '@domain/entities/Feature';
import {
  FeatureAnchor,
  createAnchorPlacement,
  type AnchorPlacement,
} from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';

const time = new TimePoint(1000);
const futureTime = new TimePoint(1500);
const laterTime = new TimePoint(2000);

function makeFeature(
  id: string,
  parentId: string | null,
  childIds: readonly string[] = [],
  featureType: Feature['featureType'] = 'Polygon'
): Feature {
  const placement: AnchorPlacement = createAnchorPlacement(parentId, childIds);
  const shape = featureType === 'Polygon'
    ? { type: 'Polygon' as const, rings: [new Ring(`${id}-ring`, ['v1', 'v2', 'v3'], 'territory', null)] }
    : featureType === 'Point'
      ? { type: 'Point' as const, vertexId: 'v1' }
      : { type: 'LineString' as const, vertexIds: ['v1', 'v2'] };
  return new Feature(id, featureType, [
    new FeatureAnchor(
      `${id}-a1`,
      { start: time },
      { name: id, description: '' },
      shape,
      placement
    ),
  ]);
}

/**
 * 集約地物（コンテナ）を生成する。
 * Polygon 地物だが shape を持たず（`undefined`）、下位領域を持つ。
 * 形状は子の和として実行時に導出される（要件定義書 §4.1 / 現状.md §6.4）。
 */
function makeContainer(
  id: string,
  parentId: string | null,
  childIds: readonly string[]
): Feature {
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: time },
      { name: id, description: '' },
      undefined,
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

describe('parentTransferDialogUtils', () => {
  it('選択地物と下位領域の移動可否と対象IDを返す', () => {
    const leaf = makeFeature('leaf', 'parent');
    const parent = makeFeature('parent', null, ['leaf']);

    expect(canTransferSelectedFeature(leaf, time)).toBe(true);
    expect(canTransferChildren(leaf, time, [leaf, parent])).toBe(false);
    expect(getTransferFeatureIds(leaf, time, 'selected')).toEqual(['leaf']);

    expect(canTransferSelectedFeature(parent, time)).toBe(false);
    expect(canTransferChildren(parent, time, [leaf, parent])).toBe(true);
    expect(getTransferFeatureIds(parent, time, 'children')).toEqual(['leaf']);
  });

  it('指定時刻以降の未来錨に下位領域がある場合はリーフ扱いにしない', () => {
    const feature = new Feature('feature', 'Polygon', [
      new FeatureAnchor(
        'feature-a1',
        { start: time, end: futureTime },
        { name: 'feature', description: '' },
        { type: 'Polygon', rings: [new Ring('feature-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
      new FeatureAnchor(
        'feature-a2',
        { start: futureTime },
        { name: 'feature', description: '' },
        { type: 'Polygon', rings: [new Ring('feature-r2', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: ['future-child'], isTopLevel: true }
      ),
    ]);

    expect(isLeafFromTime(feature, time)).toBe(false);
    expect(canTransferSelectedFeature(feature, time)).toBe(false);
  });

  it('下位領域すべての対象子が指定時刻以降リーフでなければ一括所属変更を無効にする', () => {
    const parent = makeFeature('parent', null, ['child']);
    const child = makeFeature('child', 'parent', ['grandchild']);
    const grandchild = makeFeature('grandchild', 'child');

    expect(canTransferChildren(parent, time, [parent, child, grandchild])).toBe(false);
  });

  it('親候補から移動対象・子孫・非ポリゴンを除外する', () => {
    const root = makeFeature('root', null, ['moving']);
    const moving = makeFeature('moving', 'root', ['descendant']);
    const descendant = makeFeature('descendant', 'moving');
    const candidate = makeFeature('candidate', null);
    const point = makeFeature('point', null, [], 'Point');

    const candidates = buildParentCandidateItems({
      features: [root, moving, descendant, candidate, point],
      time,
      movingFeatureIds: ['moving'],
    });

    expect(candidates.map((item) => item.id).sort()).toEqual(['candidate', 'root']);
  });

  it('親候補から将来期間カバー検証を満たさない地物を除外する', () => {
    const moving = new Feature('moving', 'Polygon', [
      new FeatureAnchor(
        'moving-a1',
        { start: time },
        { name: 'moving', description: '' },
        { type: 'Polygon', rings: [new Ring('moving-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const shortParent = new Feature('short-parent', 'Polygon', [
      new FeatureAnchor(
        'short-parent-a1',
        { start: time, end: futureTime },
        { name: 'short-parent', description: '' },
        { type: 'Polygon', rings: [new Ring('short-parent-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const durableParent = makeFeature('durable-parent', null);

    const candidates = buildParentCandidateItems({
      features: [moving, shortParent, durableParent],
      time,
      movingFeatureIds: ['moving'],
    });

    expect(candidates.map((item) => item.id)).toEqual(['durable-parent']);
  });

  it('新規面の親候補には指定時刻から永続する面情報だけを返す', () => {
    const shortParent = new Feature('short-parent', 'Polygon', [
      new FeatureAnchor(
        'short-parent-a1',
        { start: time, end: futureTime },
        { name: '短期親', description: '' },
        { type: 'Polygon', rings: [new Ring('short-parent-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const durableParent = makeFeature('durable-parent', null);
    const point = makeFeature('point', null, [], 'Point');

    const candidates = buildNewFeatureParentCandidateItems({
      features: [shortParent, durableParent, point],
      time,
    });

    expect(candidates).toEqual([
      { id: 'durable-parent', name: 'durable-parent' },
    ]);
  });

  it('新規面の親候補を名称順に並べる', () => {
    const beta = new Feature('beta', 'Polygon', [
      new FeatureAnchor(
        'beta-a1',
        { start: time },
        { name: 'ベータ', description: '' },
        { type: 'Polygon', rings: [new Ring('beta-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const alpha = new Feature('alpha', 'Polygon', [
      new FeatureAnchor(
        'alpha-a1',
        { start: time },
        { name: 'アルファ', description: '' },
        { type: 'Polygon', rings: [new Ring('alpha-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);

    const candidates = buildNewFeatureParentCandidateItems({
      features: [beta, alpha],
      time,
    });

    expect(candidates.map((item) => item.id)).toEqual(['alpha', 'beta']);
  });

  it('子孫IDを再帰的に収集する', () => {
    const root = makeFeature('root', null, ['child']);
    const child = makeFeature('child', 'root', ['grandchild']);
    const grandchild = makeFeature('grandchild', 'child');

    expect([...collectDescendantIds('root', [root, child, grandchild], time)].sort())
      .toEqual(['child', 'grandchild']);
  });

  it('所属変更後に旧親が消えた場合は新親へ選択を寄せる', () => {
    const newParent = makeFeature('new-parent', null, ['child']);
    const child = new Feature('child', 'Polygon', [
      new FeatureAnchor(
        'child-a1',
        { start: time, end: laterTime },
        { name: 'child', description: '' },
        { type: 'Polygon', rings: [new Ring('child-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: 'new-parent', childIds: [], isTopLevel: false }
      ),
    ]);

    expect(resolveParentTransferSelection({
      features: [newParent, child],
      time: futureTime,
      currentSelectedFeatureId: 'old-parent',
      movedFeatureIds: ['child'],
      newParentId: 'new-parent',
    })).toBe('new-parent');
  });
});

describe('resolveParentTransferTarget — 新しい親の 3 択解決 (Phase 4-2 / 4-3a)', () => {
  const candidates = [
    { id: 'cand-a', name: 'A' },
    { id: 'cand-b', name: 'B' },
  ];

  it("'root'（独立）は reassign / newParentId=null を返す", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'root',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
      })
    ).toEqual({ type: 'reassign', newParentId: null });
  });

  it("'existing'（割譲・帰属・直轄化）は候補内の有効な選択のみ解決する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'existing',
        selectedExistingParentId: 'cand-b',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
      })
    ).toEqual({ type: 'reassign', newParentId: 'cand-b' });
  });

  it("'existing' で未選択・候補外は null（確定不可）を返す", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'existing',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
      })
    ).toBeNull();
    expect(
      resolveParentTransferTarget({
        mode: 'existing',
        selectedExistingParentId: 'unknown',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
      })
    ).toBeNull();
  });

  it("'new'（連邦化）は名称が非空のとき createNewParent を解決する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '合衆国',
        newParentKind: '連邦',
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '合衆国', kind: '連邦' } });
  });

  it("'new' は名称・種別の前後空白を除去する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '  合衆国  ',
        newParentKind: '  連邦  ',
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '合衆国', kind: '連邦' } });
  });

  it("'new' は種別が空のとき kind を未設定にする", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '合衆国',
        newParentKind: '   ',
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '合衆国' } });
  });

  it("'new' は名称が空（または空白のみ）のとき null（確定不可）を返す", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '連邦',
      })
    ).toBeNull();
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '   ',
        newParentKind: '',
      })
    ).toBeNull();
  });
});

describe('parentTransferDialogUtils 集約地物（コンテナ）の受容 (Phase 2.5-E)', () => {
  it('コンテナ（shape なし）はリーフ扱いせず、選択地物のみの所属変更を無効にする', () => {
    const container = makeContainer('container', null, ['leaf']);
    const leaf = makeFeature('leaf', 'container');

    // 本変更（Phase 2.5-E）の本質を pin する負のコントロール:
    // コンテナ錨が受容される（旧実装は shape なしを null で弾いていたため、ここで fail する）。
    // これにより以降の「錨は取れるが非リーフ」の判定経路が旧実装と弁別される。
    expect(getActivePolygonAnchor(container, time)).not.toBeNull();
    // 対概念の同期（開発ガイド §6.0.1 検出観点2）: 錨は取れるが childIds 非空なのでリーフではない
    expect(isLeafFromTime(container, time)).toBe(false);
    expect(canTransferSelectedFeature(container, time)).toBe(false);
    // コンテナ自身の所属変更（連邦への編入など）は Phase 4 で扱うため、ここでは無効のまま
    expect(canTransferSelectedFeature(leaf, time)).toBe(true);
  });

  it('コンテナの下位領域すべての所属変更を許容する（子がすべてリーフのとき）', () => {
    const container = makeContainer('container', null, ['leaf-a', 'leaf-b']);
    const leafA = makeFeature('leaf-a', 'container');
    const leafB = makeFeature('leaf-b', 'container');

    expect(canTransferChildren(container, time, [container, leafA, leafB])).toBe(true);
    expect(getTransferFeatureIds(container, time, 'children')).toEqual(['leaf-a', 'leaf-b']);
  });

  it('子に非リーフ（移行期間ノード）が混ざるコンテナは一括所属変更を無効にする', () => {
    const container = makeContainer('container', null, ['mid']);
    const mid = makeFeature('mid', 'container', ['grandchild']);
    const grandchild = makeFeature('grandchild', 'mid');

    expect(canTransferChildren(container, time, [container, mid, grandchild])).toBe(false);
  });

  it('コンテナを所属変更の親候補として提示する', () => {
    const container = makeContainer('container', null, ['existing']);
    const existing = makeFeature('existing', 'container');
    const moving = makeFeature('moving', null);

    const candidates = buildParentCandidateItems({
      features: [container, existing, moving],
      time,
      movingFeatureIds: ['moving'],
    });

    expect(candidates.map((item) => item.id)).toContain('container');
  });

  it('コンテナを新規面の親候補として提示する', () => {
    const container = makeContainer('container', null, ['existing']);
    const existing = makeFeature('existing', 'container');

    const candidates = buildNewFeatureParentCandidateItems({
      features: [container, existing],
      time,
    });

    expect(candidates.map((item) => item.id)).toContain('container');
  });
});
