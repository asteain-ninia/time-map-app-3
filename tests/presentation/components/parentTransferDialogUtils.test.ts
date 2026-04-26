import { describe, it, expect } from 'vitest';
import {
  buildParentCandidateItems,
  canTransferChildren,
  canTransferSelectedFeature,
  collectDescendantIds,
  getTransferFeatureIds,
  isLeafFromTime,
  resolveParentTransferSelection,
} from '@presentation/components/parentTransferDialogUtils';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor, type AnchorPlacement } from '@domain/value-objects/FeatureAnchor';
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
  const placement: AnchorPlacement = { layerId: 'l1', parentId, childIds };
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
        { layerId: 'l1', parentId: null, childIds: [] }
      ),
      new FeatureAnchor(
        'feature-a2',
        { start: futureTime },
        { name: 'feature', description: '' },
        { type: 'Polygon', rings: [new Ring('feature-r2', ['v1', 'v2', 'v3'], 'territory', null)] },
        { layerId: 'l1', parentId: null, childIds: ['future-child'] }
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
        { layerId: 'l1', parentId: null, childIds: [] }
      ),
    ]);
    const shortParent = new Feature('short-parent', 'Polygon', [
      new FeatureAnchor(
        'short-parent-a1',
        { start: time, end: futureTime },
        { name: 'short-parent', description: '' },
        { type: 'Polygon', rings: [new Ring('short-parent-r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { layerId: 'l1', parentId: null, childIds: [] }
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
        { layerId: 'l1', parentId: 'new-parent', childIds: [] }
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
