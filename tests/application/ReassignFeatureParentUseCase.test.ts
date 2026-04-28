import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import {
  FeatureParentTransferError,
  ReassignFeatureParentUseCase,
} from '@application/ReassignFeatureParentUseCase';
import { ReassignFeatureParentCommand } from '@application/commands/ReassignFeatureParentCommand';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Feature } from '@domain/entities/Feature';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  FeatureAnchor,
  createAnchorPlacement,
  type AnchorPlacement,
} from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';

const t1000 = new TimePoint(1000);
const t1400 = new TimePoint(1400);
const t1500 = new TimePoint(1500);
const t2000 = new TimePoint(2000);
const t2500 = new TimePoint(2500);

function makeAnchor(
  id: string,
  start: TimePoint,
  placement: AnchorPlacement,
  end?: TimePoint
): FeatureAnchor {
  return new FeatureAnchor(
    id,
    end ? { start, end } : { start },
    { name: id, description: '' },
    { type: 'Polygon', rings: [new Ring(`${id}-ring`, ['v1', 'v2', 'v3'], 'territory', null)] },
    placement
  );
}

function makeFeature(
  id: string,
  anchors: readonly FeatureAnchor[]
): Feature {
  return new Feature(id, 'Polygon', anchors);
}

function placement(parentId: string | null, childIds: readonly string[] = []): AnchorPlacement {
  return createAnchorPlacement('l1', parentId, childIds);
}

describe('ReassignFeatureParentUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let transfer: ReassignFeatureParentUseCase;

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    transfer = new ReassignFeatureParentUseCase(addFeature);
  });

  it('指定時刻以降の子・旧親・新親の所属を更新し、途中開始なら錨を分割する', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child']), t2000),
      makeAnchor('old-a2', t2000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent'), t2000),
      makeAnchor('child-a2', t2000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    const result = transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    expect(result.changedFeatureIds.sort()).toEqual(['child', 'new-parent', 'old-parent']);

    const updatedChild = addFeature.getFeatureById('child')!;
    expect(updatedChild.getActiveAnchor(t1400)?.placement.parentId).toBe('old-parent');
    expect(updatedChild.getActiveAnchor(t1500)?.placement.parentId).toBe('new-parent');
    expect(updatedChild.getActiveAnchor(t2500)?.placement.parentId).toBe('new-parent');
    expect(updatedChild.anchors).toHaveLength(3);

    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1400)?.placement.childIds).toEqual(['child']);
    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)).toBeUndefined();
    expect(addFeature.getFeatureById('new-parent')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['child']);
  });

  it('parentId 更新と同時に同一錨の isTopLevel を派生する（最上位フラグ → 子帰属）', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    const childAnchor = addFeature.getFeatureById('child')!.getActiveAnchor(t2000)!;
    expect(childAnchor.placement.parentId).toBe('new-parent');
    expect(childAnchor.placement.isTopLevel).toBe(false);
  });

  it('newParentId=null の所属解除で isTopLevel=true へ戻る', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: null,
      effectiveTime: t1500,
      transferType: 'cede',
    });

    const childAnchor = addFeature.getFeatureById('child')!.getActiveAnchor(t2000)!;
    expect(childAnchor.placement.parentId).toBeNull();
    expect(childAnchor.placement.isTopLevel).toBe(true);
  });

  it('有限期間の子を移した場合、新親の childIds は子の終了後に残らない', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent'), t2000),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    const updatedParent = addFeature.getFeatureById('new-parent')!;
    expect(updatedParent.getActiveAnchor(t1400)?.placement.childIds).toEqual([]);
    expect(updatedParent.getActiveAnchor(t1500)?.placement.childIds).toEqual(['child']);
    expect(updatedParent.getActiveAnchor(t2000)?.placement.childIds).toEqual([]);
    expect(updatedParent.getActiveAnchor(t2500)?.placement.childIds).toEqual([]);
  });

  it('旧親がもともとリーフだった期間は所属変更後も保持する', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-parent-a1', t1000, placement(null, []), t2000),
      makeAnchor('old-parent-a2', t2000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-parent-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement(null, []), t2000),
      makeAnchor('child-a2', t2000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    const updatedOldParent = addFeature.getFeatureById('old-parent')!;
    expect(updatedOldParent.getActiveAnchor(t1500)?.placement.childIds).toEqual([]);
    expect(updatedOldParent.getActiveAnchor(t2500)).toBeUndefined();
  });

  it('対象地物が将来別親へ移る履歴を持つ場合も全旧親から子IDを除去する', () => {
    const parentA = makeFeature('parent-a', [
      makeAnchor('parent-a1', t1000, placement(null, ['child'])),
    ]);
    const parentB = makeFeature('parent-b', [
      makeAnchor('parent-b1', t1000, placement(null, []), t2000),
      makeAnchor('parent-b2', t2000, placement(null, ['child'])),
    ]);
    const parentC = makeFeature('parent-c', [
      makeAnchor('parent-c1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('parent-a'), t2000),
      makeAnchor('child-a2', t2000, placement('parent-b')),
    ]);

    addFeature.restore(new Map([
      [parentA.id, parentA],
      [parentB.id, parentB],
      [parentC.id, parentC],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'parent-c',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1400)?.placement.parentId).toBe('parent-a');
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1500)?.placement.parentId).toBe('parent-c');
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t2500)?.placement.parentId).toBe('parent-c');
    expect(addFeature.getFeatureById('parent-a')!.getActiveAnchor(t1500)).toBeUndefined();
    expect(addFeature.getFeatureById('parent-b')!.getActiveAnchor(t2500)).toBeUndefined();
    expect(addFeature.getFeatureById('parent-c')!.getActiveAnchor(t2500)?.placement.childIds).toEqual(['child']);
  });

  it('旧親が指定時刻で非アクティブ化されても祖先の childIds から除去する', () => {
    const grandparent = makeFeature('grandparent', [
      makeAnchor('grandparent-a1', t1000, placement(null, ['old-parent', 'sibling'])),
    ]);
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-parent-a1', t1000, placement('grandparent', ['child'])),
    ]);
    const sibling = makeFeature('sibling', [
      makeAnchor('sibling-a1', t1000, placement('grandparent')),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-parent-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [grandparent.id, grandparent],
      [oldParent.id, oldParent],
      [sibling.id, sibling],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    });

    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)).toBeUndefined();
    expect(addFeature.getFeatureById('grandparent')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['sibling']);
  });

  it('旧親の消滅が祖先の全子喪失を引き起こす場合は祖先も連鎖的に消滅する', () => {
    const root = makeFeature('root', [
      makeAnchor('root-a1', t1000, placement(null, ['grandparent'])),
    ]);
    const grandparent = makeFeature('grandparent', [
      makeAnchor('grandparent-a1', t1000, placement('root', ['old-parent'])),
    ]);
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-parent-a1', t1000, placement('grandparent', ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-parent-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [root.id, root],
      [grandparent.id, grandparent],
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1000,
      transferType: 'cede',
    });

    expect(addFeature.getFeatureById('old-parent')).toBeUndefined();
    expect(addFeature.getFeatureById('grandparent')).toBeUndefined();
    expect(addFeature.getFeatureById('root')).toBeUndefined();
  });

  it('復元済みデータに過去の所属変更錨IDがあっても再分割時に重複IDを生成しない', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('a-1', t1000, placement('old-parent'), t1500),
      makeAnchor('a-1-parent-1', t1500, placement('old-parent')),
    ]);

    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());
    transfer = new ReassignFeatureParentUseCase(addFeature);

    transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1400,
      transferType: 'cede',
    });

    const ids = addFeature.getFeatureById('child')!.anchors.map((anchor) => anchor.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('a-1-parent-2');
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1400)?.id).toBe('a-1-parent-2');
  });

  it('下位領域を持つ地物の直接所属変更は拒否する', () => {
    const parent = makeFeature('parent', [makeAnchor('parent-a1', t1000, placement(null, []))]);
    const childWithChild = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement(null, ['grandchild'])),
    ]);
    addFeature.restore(new Map([
      [parent.id, parent],
      [childWithChild.id, childWithChild],
    ]), new Map());

    expect(() => transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'parent',
      effectiveTime: t1500,
    })).toThrow(FeatureParentTransferError);
  });

  it('将来期間カバー検証を満たさない新親は所属変更を拒否する', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const shortLivedParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, []), t2000),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);
    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [shortLivedParent.id, shortLivedParent],
      [child.id, child],
    ]), new Map());

    expect(() => transfer.reassignFeatureParent({
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    })).toThrow('存在期間を覆っていません');
  });

  it('合邦として複数の下位領域を一括で新親へ移す', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['c1', 'c2'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const c1 = makeFeature('c1', [makeAnchor('c1-a1', t1000, placement('old-parent'))]);
    const c2 = makeFeature('c2', [makeAnchor('c2-a1', t1000, placement('old-parent'))]);
    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [c1.id, c1],
      [c2.id, c2],
    ]), new Map());

    transfer.reassignFeatureParent({
      featureIds: ['c1', 'c2'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'annex',
    });

    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)).toBeUndefined();
    expect(addFeature.getFeatureById('new-parent')!.getActiveAnchor(t1500)?.placement.childIds.sort()).toEqual(['c1', 'c2']);
    expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('new-parent');
    expect(addFeature.getFeatureById('c2')!.getActiveAnchor(t1500)?.placement.parentId).toBe('new-parent');
  });

  it('Undo/Redoで所属変更前後の錨状態を復元する', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);
    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());
    const undoRedo = new UndoRedoManager();

    undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1500,
      transferType: 'cede',
    }));
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1500)?.placement.parentId).toBe('new-parent');
    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)).toBeUndefined();

    undoRedo.undo();
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1500)?.placement.parentId).toBe('old-parent');
    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['child']);

    undoRedo.redo();
    expect(addFeature.getFeatureById('child')!.getActiveAnchor(t1500)?.placement.parentId).toBe('new-parent');
    expect(addFeature.getFeatureById('new-parent')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['child']);
    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1500)).toBeUndefined();
  });

  it('旧親が有効開始時点で全子を失いFeature削除される場合もUndo/Redoで復元する', () => {
    const oldParent = makeFeature('old-parent', [
      makeAnchor('old-a1', t1000, placement(null, ['child'])),
    ]);
    const newParent = makeFeature('new-parent', [
      makeAnchor('new-a1', t1000, placement(null, [])),
    ]);
    const child = makeFeature('child', [
      makeAnchor('child-a1', t1000, placement('old-parent')),
    ]);
    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [newParent.id, newParent],
      [child.id, child],
    ]), new Map());
    const undoRedo = new UndoRedoManager();

    undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1000,
      transferType: 'cede',
    }));
    expect(addFeature.getFeatureById('old-parent')).toBeUndefined();

    undoRedo.undo();
    expect(addFeature.getFeatureById('old-parent')!.getActiveAnchor(t1000)?.placement.childIds).toEqual(['child']);

    undoRedo.redo();
    expect(addFeature.getFeatureById('old-parent')).toBeUndefined();
  });

  it('所属変更で削除された旧親の未使用頂点と共有頂点グループを掃除しUndo/Redoで復元する', () => {
    const oldParent = new Feature('old-parent', 'Polygon', [
      new FeatureAnchor(
        'old-parent-a1',
        { start: t1000 },
        { name: 'old-parent', description: '' },
        { type: 'Polygon', rings: [new Ring('old-parent-r1', ['op-1', 'op-2', 'op-3'], 'territory', null)] },
        { layerId: 'l1', parentId: null, childIds: ['child'], isTopLevel: true }
      ),
    ]);
    const child = new Feature('child', 'Polygon', [
      new FeatureAnchor(
        'child-a1',
        { start: t1000 },
        { name: 'child', description: '' },
        { type: 'Polygon', rings: [new Ring('child-r1', ['c-1', 'c-2', 'c-3'], 'territory', null)] },
        { layerId: 'l1', parentId: 'old-parent', childIds: [], isTopLevel: false }
      ),
    ]);
    const newParent = new Feature('new-parent', 'Polygon', [
      new FeatureAnchor(
        'new-parent-a1',
        { start: t1000 },
        { name: 'new-parent', description: '' },
        { type: 'Polygon', rings: [new Ring('new-parent-r1', ['np-1', 'np-2', 'np-3'], 'territory', null)] },
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const helper = new Feature('helper', 'Point', [
      new FeatureAnchor(
        'helper-a1',
        { start: t1000 },
        { name: 'helper', description: '' },
        { type: 'Point', vertexId: 'helper-v' },
        { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const vertices = new Map<string, Vertex>([
      ['op-1', new Vertex('op-1', new Coordinate(0, 0))],
      ['op-2', new Vertex('op-2', new Coordinate(5, 0))],
      ['op-3', new Vertex('op-3', new Coordinate(0, 5))],
      ['c-1', new Vertex('c-1', new Coordinate(10, 0))],
      ['c-2', new Vertex('c-2', new Coordinate(15, 0))],
      ['c-3', new Vertex('c-3', new Coordinate(10, 5))],
      ['np-1', new Vertex('np-1', new Coordinate(20, 0))],
      ['np-2', new Vertex('np-2', new Coordinate(25, 0))],
      ['np-3', new Vertex('np-3', new Coordinate(20, 5))],
      ['helper-v', new Vertex('helper-v', new Coordinate(0, 0))],
    ]);
    const sharedGroups = new Map<string, SharedVertexGroup>([
      ['sg-1', new SharedVertexGroup('sg-1', ['op-1', 'helper-v'], new Coordinate(0, 0))],
    ]);
    addFeature.restore(new Map([
      [oldParent.id, oldParent],
      [child.id, child],
      [newParent.id, newParent],
      [helper.id, helper],
    ]), vertices, sharedGroups);
    const undoRedo = new UndoRedoManager();

    undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
      featureIds: ['child'],
      newParentId: 'new-parent',
      effectiveTime: t1000,
      transferType: 'cede',
    }));

    expect(addFeature.getFeatureById('old-parent')).toBeUndefined();
    expect(addFeature.getVertices().has('op-1')).toBe(false);
    expect(addFeature.getVertices().has('op-2')).toBe(false);
    expect(addFeature.getVertices().has('op-3')).toBe(false);
    expect(addFeature.getSharedVertexGroups().has('sg-1')).toBe(false);

    undoRedo.undo();
    expect(addFeature.getFeatureById('old-parent')).toBeDefined();
    expect(addFeature.getVertices().has('op-1')).toBe(true);
    expect(addFeature.getVertices().has('op-2')).toBe(true);
    expect(addFeature.getVertices().has('op-3')).toBe(true);
    expect(addFeature.getSharedVertexGroups().has('sg-1')).toBe(true);

    undoRedo.redo();
    expect(addFeature.getFeatureById('old-parent')).toBeUndefined();
    expect(addFeature.getVertices().has('op-1')).toBe(false);
    expect(addFeature.getSharedVertexGroups().has('sg-1')).toBe(false);
  });
});
