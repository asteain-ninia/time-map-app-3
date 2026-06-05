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
const t1600 = new TimePoint(1600);
const t2000 = new TimePoint(2000);
const t2200 = new TimePoint(2200);
const t2500 = new TimePoint(2500);
const t2600 = new TimePoint(2600);

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
  return createAnchorPlacement(parentId, childIds);
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
        { parentId: null, childIds: ['child'], isTopLevel: true }
      ),
    ]);
    const child = new Feature('child', 'Polygon', [
      new FeatureAnchor(
        'child-a1',
        { start: t1000 },
        { name: 'child', description: '' },
        { type: 'Polygon', rings: [new Ring('child-r1', ['c-1', 'c-2', 'c-3'], 'territory', null)] },
        { parentId: 'old-parent', childIds: [], isTopLevel: false }
      ),
    ]);
    const newParent = new Feature('new-parent', 'Polygon', [
      new FeatureAnchor(
        'new-parent-a1',
        { start: t1000 },
        { name: 'new-parent', description: '' },
        { type: 'Polygon', rings: [new Ring('new-parent-r1', ['np-1', 'np-2', 'np-3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
    const helper = new Feature('helper', 'Point', [
      new FeatureAnchor(
        'helper-a1',
        { start: t1000 },
        { name: 'helper', description: '' },
        { type: 'Point', vertexId: 'helper-v' },
        { parentId: null, childIds: [], isTopLevel: true }
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

  // ── 新規上位領域作成サブフロー（連邦化） ──────────────────────────
  // 要件定義書 §2.1 line 290-302 / 現状.md §6.5 アメリカ合衆国爆誕シナリオ
  describe('新規上位領域作成サブフロー（連邦化）', () => {
    function makeTopLevelLeaf(id: string): Feature {
      return makeFeature(id, [makeAnchor(`${id}-a1`, t1000, placement(null, []))]);
    }

    function makeTopLevelLeafWithEnd(id: string, end: TimePoint): Feature {
      return makeFeature(id, [makeAnchor(`${id}-a1`, t1000, placement(null, []), end)]);
    }

    /** 集約地物（shape なし）の全錨が「childIds 非空」であることを確認する不変条件アサーション */
    function expectContainerInvariant(container: Feature): void {
      for (const anchor of container.anchors) {
        if (anchor.shape === undefined) {
          expect(anchor.placement.childIds.length).toBeGreaterThan(0);
        }
      }
    }

    it('全対象が同一終了時刻でも、コンテナに shape なし・childIds 空の錨を残さない（変異後の不変条件保証）', () => {
      // 回帰: 子の存在終了で錨分割の末尾区間が childIds 空になり、shape なしと併せて
      // 「shape なし ⟹ childIds 非空」を破る失敗モード（§6.6.8 / Phase 2.5-E 申し送り）。
      const n1 = makeTopLevelLeafWithEnd('n1', t2000);
      const n2 = makeTopLevelLeafWithEnd('n2', t2000);
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国' },
      });

      const container = addFeature.getFeatureById('f-1')!;
      expectContainerInvariant(container);
      // 有効区間は childIds 充足、子の存在終了後はコンテナ自体が消滅
      expect(container.getActiveAnchor(t1600)?.placement.childIds.sort()).toEqual(['n1', 'n2']);
      expect(container.getActiveAnchor(t2500)).toBeUndefined();
    });

    it('単一対象＋終了時刻ありでも childIds 空区間を残さない', () => {
      const n1 = makeTopLevelLeafWithEnd('n1', t2000);
      addFeature.restore(new Map([[n1.id, n1]]), new Map());

      transfer.reassignFeatureParent({
        featureIds: ['n1'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '保護領' },
      });

      const container = addFeature.getFeatureById('f-1')!;
      expectContainerInvariant(container);
      expect(container.getActiveAnchor(t1600)?.placement.childIds).toEqual(['n1']);
      expect(container.getActiveAnchor(t2500)).toBeUndefined();
    });

    it('対象の終了時刻が異なる場合、中間区間は活性な子のみ残し、末尾の空区間のみ剪定する', () => {
      const n1 = makeTopLevelLeafWithEnd('n1', t2000);
      const n2 = makeTopLevelLeafWithEnd('n2', t2500);
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国' },
      });

      const container = addFeature.getFeatureById('f-1')!;
      expectContainerInvariant(container);
      expect(container.getActiveAnchor(t1600)?.placement.childIds.sort()).toEqual(['n1', 'n2']);
      expect(container.getActiveAnchor(t2200)?.placement.childIds).toEqual(['n2']); // n1 終了済
      expect(container.getActiveAnchor(t2600)).toBeUndefined(); // 両方終了
    });

    it('既存親（shape なしコンテナ）を持つ有限終了リーフの連邦化で、旧親 prune と新コンテナ prune が両立する', () => {
      // 旧親 prune（removeEmptyParentRangesFromTime）と新コンテナ prune（pruneEmptyContainerAnchors）が
      // 同時に走る最高リスクの組合せの回帰（Workflow 敵対的検証の test-gap 指摘）。
      // 旧親 oldc は shape なしコンテナ [t1000,∞) childIds=[child]、child は有限終了リーフ [t1000,t2000)。
      const oldc = makeFeature('oldc', [
        new FeatureAnchor('oldc-a1', { start: t1000 }, { name: 'oldc', description: '' }, undefined, placement(null, ['child'])),
      ]);
      const child = makeFeature('child', [makeAnchor('child-a1', t1000, placement('oldc'), t2000)]);
      addFeature.restore(new Map([[oldc.id, oldc], [child.id, child]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['child'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '連邦' },
      });

      // child は t1500 未満は旧親、t1500 以降は新コンテナへ
      const childFeature = addFeature.getFeatureById('child')!;
      expect(childFeature.getActiveAnchor(t1400)?.placement.parentId).toBe('oldc');
      expect(childFeature.getActiveAnchor(t1600)?.placement.parentId).toBe(result.createdParentId);

      // 旧親コンテナは唯一の子を t1500 で失い、[t1500,∞) は剪定 → [t1000,t1500) のみ存続（不変条件維持）
      const oldcFeature = addFeature.getFeatureById('oldc')!;
      expect(oldcFeature.getActiveAnchor(t1400)?.placement.childIds).toEqual(['child']);
      expect(oldcFeature.getActiveAnchor(t1600)).toBeUndefined();
      expectContainerInvariant(oldcFeature);

      // 新コンテナは [t1500,t2000) childIds=[child] のみ、shape なし空錨なし、子終了後は消滅
      const container = addFeature.getFeatureById(result.createdParentId!)!;
      expectContainerInvariant(container);
      expect(container.getActiveAnchor(t1600)?.placement.childIds).toEqual(['child']);
      expect(container.getActiveAnchor(t2500)).toBeUndefined();
    });

    it('複数の最上位末端地物を新規最上位コンテナの下位領域へ一括帰属させる', () => {
      const n1 = makeTopLevelLeaf('n1');
      const n2 = makeTopLevelLeaf('n2');
      const n3 = makeTopLevelLeaf('n3');
      addFeature.restore(new Map([
        [n1.id, n1],
        [n2.id, n2],
        [n3.id, n3],
      ]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2', 'n3'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国', kind: '連邦' },
      });

      // 新規コンテナが生成される
      expect(result.createdParentId).toBe('f-1');
      const container = addFeature.getFeatureById('f-1')!;
      expect(container).toBeDefined();

      // コンテナは最上位（isTopLevel=true / parentId=null）かつ shape を持たない
      const containerAnchor = container.getActiveAnchor(t1500)!;
      expect(containerAnchor.placement.parentId).toBeNull();
      expect(containerAnchor.placement.isTopLevel).toBe(true);
      expect(containerAnchor.shape).toBeUndefined();
      expect(containerAnchor.property.name).toBe('合衆国');
      expect(containerAnchor.property.kind).toBe('連邦');

      // childIds は対象3国を充足（不変条件: shape なし ⟹ childIds 非空）
      expect(containerAnchor.placement.childIds.sort()).toEqual(['n1', 'n2', 'n3']);

      // 13国（ここでは3国）は同一性を保ったまま位相のみ変化
      for (const id of ['n1', 'n2', 'n3']) {
        const anchor = addFeature.getFeatureById(id)!.getActiveAnchor(t1500)!;
        expect(anchor.placement.parentId).toBe('f-1');
        expect(anchor.placement.isTopLevel).toBe(false);
      }
      expect(result.changedFeatureIds).toContain('f-1');
    });

    it('効力時刻未満の錨は最上位のまま継続し、効力時刻で錨が分割される', () => {
      // n1 は t1000 開始の最上位。t1500 で連邦化 → t1000-1500 は最上位、t1500- は子。
      const n1 = makeTopLevelLeaf('n1');
      const n2 = makeTopLevelLeaf('n2');
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国' },
      });

      const n1Feature = addFeature.getFeatureById('n1')!;
      expect(n1Feature.getActiveAnchor(t1400)?.placement.parentId).toBeNull();
      expect(n1Feature.getActiveAnchor(t1400)?.placement.isTopLevel).toBe(true);
      expect(n1Feature.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');
      expect(n1Feature.getActiveAnchor(t2000)?.placement.parentId).toBe('f-1');

      // 効力時刻未満ではコンテナは未存在
      expect(addFeature.getFeatureById('f-1')!.getActiveAnchor(t1400)).toBeUndefined();
    });

    it('kind 未指定なら property.kind は付与されない', () => {
      const n1 = makeTopLevelLeaf('n1');
      const n2 = makeTopLevelLeaf('n2');
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '連合' },
      });

      expect(addFeature.getFeatureById('f-1')!.getActiveAnchor(t1500)!.property.kind).toBeUndefined();
    });

    it('集約地物（下位領域を持つ）は連邦化対象に選べない（§2.1 line 313 末端地物限定）', () => {
      const container = makeFeature('container', [
        makeAnchor('container-a1', t1000, placement(null, ['leaf'])),
      ]);
      const leaf = makeFeature('leaf', [makeAnchor('leaf-a1', t1000, placement('container'))]);
      addFeature.restore(new Map([
        [container.id, container],
        [leaf.id, leaf],
      ]), new Map());

      expect(() => transfer.reassignFeatureParent({
        featureIds: ['container'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '帝国' },
      })).toThrow(FeatureParentTransferError);
    });

    it('Undo で新規コンテナが消滅し対象地物が最上位へ戻り、Redo で再生成される', () => {
      const n1 = makeTopLevelLeaf('n1');
      const n2 = makeTopLevelLeaf('n2');
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国', kind: '連邦' },
      }));
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');

      undoRedo.undo();
      // 新規コンテナは消滅し、対象地物は最上位へ復元される
      expect(addFeature.getFeatureById('f-1')).toBeUndefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBeNull();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.isTopLevel).toBe(true);
      expect(addFeature.getFeatureById('n2')!.getActiveAnchor(t1500)?.placement.isTopLevel).toBe(true);

      undoRedo.redo();
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');
      expect(addFeature.getFeatureById('f-1')!.getActiveAnchor(t1500)?.placement.childIds.sort()).toEqual(['n1', 'n2']);
    });
  });

  // ── 親候補制約・名称検証の確定前検証 (Phase 4-2) ───────────────────
  // ダイアログのリアルタイム判定（buildParentCandidateItems / UI 確定 disabled）と
  // 対をなす UseCase 入口の確定前検証（§6.6.3 line 586 二重防御 / §6.6.1）。
  describe('確定前検証（親候補制約・名称）', () => {
    it('自分自身を新しい親に指定すると拒否する（§6.6.3 循環参照防止の二重防御）', () => {
      const f = makeFeature('f', [makeAnchor('f-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[f.id, f]]), new Map());

      expect(() => transfer.reassignFeatureParent({
        featureIds: ['f'],
        newParentId: 'f',
        effectiveTime: t1500,
      })).toThrow(FeatureParentTransferError);
    });

    it('対象の上位領域（祖先）への所属変更は許可する（直轄化 / 祖先選択許可）', () => {
      // G(最上位) → P(子: C, C2) → C/C2(末端)。C を中間 P を抜かして祖先 G へ移す（直轄化）。
      const g = makeFeature('g', [makeAnchor('g-a1', t1000, placement(null, ['p']))]);
      const p = makeFeature('p', [makeAnchor('p-a1', t1000, placement('g', ['c', 'c2']))]);
      const c = makeFeature('c', [makeAnchor('c-a1', t1000, placement('p'))]);
      const c2 = makeFeature('c2', [makeAnchor('c2-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[g.id, g], [p.id, p], [c.id, c], [c2.id, c2]]), new Map());

      expect(() => transfer.reassignFeatureParent({
        featureIds: ['c'],
        newParentId: 'g',
        effectiveTime: t1500,
      })).not.toThrow();

      // C の親は G（直轄化成立）、旧親 P は残る子 C2 を保持し存続
      expect(addFeature.getFeatureById('c')!.getActiveAnchor(t1500)?.placement.parentId).toBe('g');
      expect(addFeature.getFeatureById('g')!.getActiveAnchor(t1500)?.placement.childIds.sort()).toEqual(['c', 'p']);
      expect(addFeature.getFeatureById('p')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['c2']);
    });

    it('新規上位領域作成サブフローで名称が空（空白のみ含む）なら拒否する（§2.1 line 291 二重防御）', () => {
      const n1 = makeFeature('n1', [makeAnchor('n1-a1', t1000, placement(null, []))]);
      const n2 = makeFeature('n2', [makeAnchor('n2-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      expect(() => transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '' },
      })).toThrow(FeatureParentTransferError);

      expect(() => transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '   ' },
      })).toThrow(FeatureParentTransferError);

      // 名称の前後空白は除去して登録する
      transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '  合衆国  ' },
      });
      expect(addFeature.getFeatureById('f-1')!.getActiveAnchor(t1500)?.property.name).toBe('合衆国');
    });
  });
});
