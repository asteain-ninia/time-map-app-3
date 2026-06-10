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
  resolveDirectlyGovernedDefault,
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
    expect(canTransferChildren(leaf, time)).toBe(false);
    expect(getTransferFeatureIds(leaf, time, 'selected')).toEqual(['leaf']);

    expect(canTransferSelectedFeature(parent, time)).toBe(false);
    expect(canTransferChildren(parent, time)).toBe(true);
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

  it('下位領域すべては直接の子の末端/集約を問わず許容する（Phase 4-4 多層コンテナ）', () => {
    // 旧実装は「直接の子がすべて末端」を要求し、子に集約地物を含む多層コンテナを操作不能にしていた。
    // Phase 4-4: canTransferChildren は対象が直接の下位領域を 1 つ以上持つことのみを要件とする
    // （子が集約地物でも移動可。多層の所属変更そのものは ReassignFeatureParentUseCase のテストで固定）。
    const parent = makeFeature('parent', null, ['mid', 'leaf']);

    expect(canTransferChildren(parent, time)).toBe(true);
    expect(getTransferFeatureIds(parent, time, 'children')).toEqual(['mid', 'leaf']);
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

describe('resolveParentTransferTarget — 新しい親の 3 択解決 (Phase 4-2 / 4-3a / 4-3 自治化)', () => {
  const candidates = [
    { id: 'cand-a', name: 'A' },
    { id: 'cand-b', name: 'B' },
  ];

  // 連邦化（新規最上位コンテナ）= 新規コンテナの所属は root。既定の 4-3a 経路。
  // newParentParentCandidates（自治化の所属先候補）は root では参照されないが、署名上必須。
  const rootPlacement = {
    newParentPlacementMode: 'root' as const,
    selectedNewParentParentId: '',
    newParentParentCandidates: candidates,
  };

  it("'root'（独立）は reassign / newParentId=null を返す", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'root',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
        ...rootPlacement,
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
        ...rootPlacement,
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
        ...rootPlacement,
      })
    ).toBeNull();
    expect(
      resolveParentTransferTarget({
        mode: 'existing',
        selectedExistingParentId: 'unknown',
        parentCandidates: candidates,
        newParentName: '',
        newParentKind: '',
        ...rootPlacement,
      })
    ).toBeNull();
  });

  it("'new'（連邦化）は名称が非空のとき createNewParent を解決する（所属 root では parentId 未設定）", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '合衆国',
        newParentKind: '連邦',
        ...rootPlacement,
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
        ...rootPlacement,
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
        ...rootPlacement,
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
        ...rootPlacement,
      })
    ).toBeNull();
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '   ',
        newParentKind: '',
        ...rootPlacement,
      })
    ).toBeNull();
  });

  // 自治化（新規中間コンテナ）: newParentPlacementMode === 'existing' で新規コンテナ自身の
  // 所属先 parentId を解決する（要件定義書 §2.1 line 292 / line 305）。所属先は
  // newParentParentCandidates（既存再割当の parentCandidates とは別の除外規則）で検証する。
  it("'new'（自治化）は所属先が候補内の有効な選択のとき spec.parentId を設定する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '自治州',
        newParentKind: '州',
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: 'cand-a',
        newParentParentCandidates: candidates,
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '自治州', kind: '州', parentId: 'cand-a' } });
  });

  it("'new'（自治化）で所属先が未選択・候補外なら null（確定不可）を返す", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '自治州',
        newParentKind: '',
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: '',
        newParentParentCandidates: candidates,
      })
    ).toBeNull();
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '自治州',
        newParentKind: '',
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: 'unknown',
        newParentParentCandidates: candidates,
      })
    ).toBeNull();
  });

  it("'new'（自治化）でも名称が空なら null（所属先選択より名称検証が優先）", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '   ',
        newParentKind: '',
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: 'cand-a',
        newParentParentCandidates: candidates,
      })
    ).toBeNull();
  });

  // 除外規則の差: scope='children' では現在の親 P は再割当候補（parentCandidates）から除外されるが、
  // 自治化の所属先候補（newParentParentCandidates）には含まれる（P → 新中間コンテナ → 子）。
  // 自治化は所属先候補を newParentParentCandidates で検証するため、P を所属先に選べる。
  it("'new'（自治化）は parentCandidates に無くても newParentParentCandidates にある所属先を解決する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: [], // scope='children' で親 P が再割当候補から除外された状況
        newParentName: '州',
        newParentKind: '',
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: 'parent-p',
        newParentParentCandidates: [{ id: 'parent-p', name: 'P' }],
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '州', parentId: 'parent-p' } });
  });

  // ── 再帰積み上げ（newParentAncestors: 最内のさらに上位へ積む中間階層） Phase 4-3b ──
  // 要件定義書 §2.1 line 293。空・未指定なら従来の単一コンテナ（後方互換）。
  it("'new' は newParentAncestors 未指定/空配列なら ancestors を設定しない（後方互換）", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '合衆国',
        newParentKind: '連邦',
        newParentAncestors: [],
        ...rootPlacement,
      })
    ).toEqual({ type: 'createNewParent', spec: { name: '合衆国', kind: '連邦' } });
  });

  it("'new'（再帰積み上げ）は ancestors を最内→最外の順で spec へ載せ、各段の前後空白を除去する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '  合衆国  ',
        newParentKind: '連邦',
        newParentAncestors: [
          { name: '  北米連合  ', kind: '  大陸連合  ' },
          { name: '地球連邦', kind: '' },
        ],
        ...rootPlacement,
      })
    ).toEqual({
      type: 'createNewParent',
      spec: {
        name: '合衆国',
        kind: '連邦',
        ancestors: [
          { name: '北米連合', kind: '大陸連合' },
          { name: '地球連邦' }, // 種別が空の段は kind を未設定
        ],
      },
    });
  });

  it("'new'（再帰積み上げ + 自治化）は ancestors と最外の所属先 parentId を併せて解決する", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '州',
        newParentKind: '',
        newParentAncestors: [{ name: '地方', kind: '' }],
        newParentPlacementMode: 'existing',
        selectedNewParentParentId: 'cand-a',
        newParentParentCandidates: candidates,
      })
    ).toEqual({
      type: 'createNewParent',
      spec: { name: '州', ancestors: [{ name: '地方' }], parentId: 'cand-a' },
    });
  });

  it("'new' は積み上げる中間階層のいずれかの名称が空（空白のみ）なら null（確定不可）", () => {
    expect(
      resolveParentTransferTarget({
        mode: 'new',
        selectedExistingParentId: '',
        parentCandidates: candidates,
        newParentName: '合衆国',
        newParentKind: '',
        newParentAncestors: [{ name: '  ', kind: '大陸連合' }],
        ...rootPlacement,
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

    expect(canTransferChildren(container, time)).toBe(true);
    expect(getTransferFeatureIds(container, time, 'children')).toEqual(['leaf-a', 'leaf-b']);
  });

  it('子に集約地物が混ざるコンテナでも下位領域すべてを許容する（Phase 4-4 多層コンテナ）', () => {
    // 旧実装は子が末端でないと無効化していた。Phase 4-4 では多層コンテナを操作可能にする
    // （直接の下位領域を as-is で移動し、移動対象の集約地物は subtree を保持。現状.md §6.10 Phase 4-4）。
    const container = makeContainer('container', null, ['mid']);

    expect(canTransferChildren(container, time)).toBe(true);
    expect(getTransferFeatureIds(container, time, 'children')).toEqual(['mid']);
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

  // 直轄領デフォルト名称/種別の解決（要件定義書 §2.1 line 225-229, Phase 4-4b-2a）。
  describe('resolveDirectlyGovernedDefault', () => {
    // 種別ラベル付きの末端ポリゴンを生成する（makeFeature は kind なしのため）。
    function makeLeafWithKind(id: string, kind: string): Feature {
      return new Feature(id, 'Polygon', [
        new FeatureAnchor(
          `${id}-a1`,
          { start: time },
          { name: id, description: '', kind },
          { type: 'Polygon', rings: [new Ring(`${id}-ring`, ['v1', 'v2', 'v3'], 'territory', null)] },
          createAnchorPlacement(null, [])
        ),
      ]);
    }

    it('既存末端地物を新親に選ぶと直轄領のデフォルト名称・種別を返す（征服）', () => {
      const parent = makeLeafWithKind('X', '国');
      const result = resolveDirectlyGovernedDefault({
        features: [parent],
        time,
        transferTarget: { type: 'reassign', newParentId: 'X' },
      });
      expect(result).toEqual({
        featureId: 'X',
        parentName: 'X',
        defaultName: 'X 直轄領',
        defaultKind: '国',
      });
    });

    it('種別なしの末端地物では defaultKind が空文字', () => {
      const parent = makeFeature('X', null);
      const result = resolveDirectlyGovernedDefault({
        features: [parent],
        time,
        transferTarget: { type: 'reassign', newParentId: 'X' },
      });
      expect(result?.defaultKind).toBe('');
    });

    it('既存集約地物（コンテナ）を親に選んでも遷移しないため null', () => {
      const container = makeContainer('C', null, ['child']);
      const result = resolveDirectlyGovernedDefault({
        features: [container],
        time,
        transferTarget: { type: 'reassign', newParentId: 'C' },
      });
      expect(result).toBeNull();
    });

    it('独立（親なし）は遷移しないため null', () => {
      const result = resolveDirectlyGovernedDefault({
        features: [makeFeature('X', null)],
        time,
        transferTarget: { type: 'reassign', newParentId: null },
      });
      expect(result).toBeNull();
    });

    it('連邦化（新規最上位コンテナ作成, parentId なし）は遷移しないため null', () => {
      const result = resolveDirectlyGovernedDefault({
        features: [makeFeature('X', null)],
        time,
        transferTarget: { type: 'createNewParent', spec: { name: '連邦' } },
      });
      expect(result).toBeNull();
    });

    it('自治化で所属先が既存末端地物なら、その所属先のデフォルトを返す', () => {
      const q = makeLeafWithKind('Q', '国');
      const result = resolveDirectlyGovernedDefault({
        features: [q],
        time,
        transferTarget: { type: 'createNewParent', spec: { name: '自治州', parentId: 'Q' } },
      });
      expect(result).toEqual({
        featureId: 'Q',
        parentName: 'Q',
        defaultName: 'Q 直轄領',
        defaultKind: '国',
      });
    });

    it('自治化で所属先が既存集約地物なら遷移しないため null', () => {
      const container = makeContainer('Q', null, ['child']);
      const result = resolveDirectlyGovernedDefault({
        features: [container],
        time,
        transferTarget: { type: 'createNewParent', spec: { name: '自治州', parentId: 'Q' } },
      });
      expect(result).toBeNull();
    });

    it('transferTarget が null（未確定）なら null', () => {
      const result = resolveDirectlyGovernedDefault({
        features: [makeFeature('X', null)],
        time,
        transferTarget: null,
      });
      expect(result).toBeNull();
    });
  });
});
