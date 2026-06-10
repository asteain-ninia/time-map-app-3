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

  // ── 新規上位領域作成サブフロー（自治化: 既存子と既存親の間に新中間コンテナを挿入） ──
  // 要件定義書 §2.1 line 292 / line 305。createNewParent.parentId 非 null で新規コンテナ自身が
  // 既存上位領域 Q に所属する。新規コンテナ Y を Q の childIds へ同期して親 ≡ 子の和を維持する。
  describe('新規上位領域作成サブフロー（自治化）', () => {
    /** 集約地物（shape なしコンテナ）を作る */
    function makeContainer(id: string, childIds: readonly string[], parentId: string | null = null, end?: TimePoint): Feature {
      return makeFeature(id, [
        new FeatureAnchor(
          `${id}-a1`,
          end ? { start: t1000, end } : { start: t1000 },
          { name: id, description: '' },
          undefined,
          placement(parentId, childIds)
        ),
      ]);
    }

    function expectContainerInvariant(container: Feature): void {
      for (const anchor of container.anchors) {
        if (anchor.shape === undefined) {
          expect(anchor.placement.childIds.length).toBeGreaterThan(0);
        }
      }
    }

    /**
     * 拒否を例外型だけでなくメッセージ（拒否理由）でも pin する。全拒否経路が同一例外型
     * `FeatureParentTransferError` のため、型一致だけでは意図したガード以外（先行する別検証）が
     * 弾いても緑になる。reason をメッセージ部分一致で固定して経路を特定する。
     */
    function expectTransferError(fn: () => void, reasonPattern: RegExp): void {
      let caught: unknown;
      try {
        fn();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(FeatureParentTransferError);
      expect((caught as Error).message).toMatch(reasonPattern);
    }

    it('既存子 X と既存親 P の間に新中間コンテナ Y を挿入する（P の childIds は X→Y へ差替え）', () => {
      const p = makeContainer('p', ['x']);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[p.id, p], [x.id, x]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', kind: '州', parentId: 'p' },
      });

      const yId = result.createdParentId!;
      expect(yId).toBe('f-1');

      // 新中間コンテナ Y: parentId=p（非最上位）、shape なし、childIds=[x]
      const y = addFeature.getFeatureById(yId)!;
      const yAnchor = y.getActiveAnchor(t1500)!;
      expect(yAnchor.placement.parentId).toBe('p');
      expect(yAnchor.placement.isTopLevel).toBe(false);
      expect(yAnchor.shape).toBeUndefined();
      expect(yAnchor.placement.childIds).toEqual(['x']);
      expect(yAnchor.property.name).toBe('自治州');
      expect(yAnchor.property.kind).toBe('州');
      expectContainerInvariant(y);

      // X: t1500 未満は P 直属、t1500 以降は Y 直属
      const xFeature = addFeature.getFeatureById('x')!;
      expect(xFeature.getActiveAnchor(t1400)?.placement.parentId).toBe('p');
      expect(xFeature.getActiveAnchor(t1600)?.placement.parentId).toBe(yId);

      // P: t1500 未満は [x]、t1500 以降は [Y]（唯一子でも prune されず存続）
      const pFeature = addFeature.getFeatureById('p')!;
      expect(pFeature.getActiveAnchor(t1400)?.placement.childIds).toEqual(['x']);
      expect(pFeature.getActiveAnchor(t1600)?.placement.childIds).toEqual([yId]);
      expectContainerInvariant(pFeature);
    });

    it('所属先 Q が X の既存親でない無関係コンテナでも、Y ごと Q へ配置し旧親は子喪失で剪定する（自治化+再配置の合成）', () => {
      // 仕様 §2.1「単一フローでの統合表現」+ 親候補制約（非循環 + カバレッジのみ）の帰結。
      // newParentParentCandidates は「X の上位領域」に限定しないため、Q = 無関係コンテナでも成立する。
      // X(唯一子, 親P) を新中間コンテナ Y へ束ね、Y を無関係な Q 直下へ配置: P → ∅, Q → Y → X。
      const p = makeContainer('p', ['x']);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement('p'))]);
      const q = makeContainer('q', ['qchild']);
      const qchild = makeFeature('qchild', [makeAnchor('qchild-a1', t1000, placement('q'))]);
      addFeature.restore(new Map([[p.id, p], [x.id, x], [q.id, q], [qchild.id, qchild]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'q' },
      });
      const yId = result.createdParentId!;

      // Y は無関係 Q の下位領域、X は Y の下位領域
      const y = addFeature.getFeatureById(yId)!;
      expect(y.getActiveAnchor(t1600)?.placement.parentId).toBe('q');
      expect(y.getActiveAnchor(t1600)?.placement.childIds).toEqual(['x']);
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1600)?.placement.parentId).toBe(yId);

      // Q は既存子 qchild を保ったまま Y を獲得
      const qFeature = addFeature.getFeatureById('q')!;
      expect(qFeature.getActiveAnchor(t1600)?.placement.childIds.slice().sort()).toEqual([yId, 'qchild'].sort());
      expectContainerInvariant(qFeature);

      // 旧親 P は唯一子 X を t1500 で失い [t1500,∞) を剪定 → [t1000,t1500) のみ存続
      const pFeature = addFeature.getFeatureById('p')!;
      expect(pFeature.getActiveAnchor(t1400)?.placement.childIds).toEqual(['x']);
      expect(pFeature.getActiveAnchor(t1600)).toBeUndefined();
      expectContainerInvariant(pFeature);
    });

    it('多子 P + 有限終了子の自治化で、Y は子の実寿命でのみ P の子になる（剪定後同期）', () => {
      // 回帰: Y を開区間のまま P へ追加すると、Y 剪定後に「P が Y を主張するが Y 非存在」の
      // 時間区間が生じ validateStagedHierarchy が誤って拒否する失敗モード。剪定→同期の順序で防ぐ。
      const p = makeContainer('p', ['x', 'sib']);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement('p'), t2000)]);
      const sib = makeFeature('sib', [makeAnchor('sib-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[p.id, p], [x.id, x], [sib.id, sib]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'p' },
      });
      const yId = result.createdParentId!;

      // Y は [t1500,t2000) のみ存続（X の寿命）。t2000 以降は子喪失で消滅
      const y = addFeature.getFeatureById(yId)!;
      expect(y.getActiveAnchor(t1600)?.placement.childIds).toEqual(['x']);
      expect(y.getActiveAnchor(t2000)).toBeUndefined();
      expectContainerInvariant(y);

      // P の childIds: [t1000,t1500)=[sib,x] / [t1500,t2000)=[sib,Y] / [t2000,∞)=[sib]
      const pFeature = addFeature.getFeatureById('p')!;
      expect(pFeature.getActiveAnchor(t1400)?.placement.childIds.slice().sort()).toEqual(['sib', 'x']);
      expect(pFeature.getActiveAnchor(t1600)?.placement.childIds.slice().sort()).toEqual([yId, 'sib'].sort());
      expect(pFeature.getActiveAnchor(t2200)?.placement.childIds).toEqual(['sib']);
      expectContainerInvariant(pFeature);
    });

    it('集約地物 P の下位領域すべてを新中間コンテナ Y へ束ね、Y を P 直下へ挿入する（§2.1 line 305+313）', () => {
      // scope='children'（下位領域すべて）× 自治化（新規コンテナの所属先 = P 自身）の組合せ。
      // featureIds = P の全子、createNewParent.parentId = P → P → Y → {a,b}（P は唯一子 Y で存続）。
      const p = makeContainer('p', ['a', 'b']);
      const a = makeFeature('a', [makeAnchor('a-a1', t1000, placement('p'))]);
      const b = makeFeature('b', [makeAnchor('b-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[p.id, p], [a.id, a], [b.id, b]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['a', 'b'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', parentId: 'p' },
      });
      const yId = result.createdParentId!;

      // Y: parentId=p（非最上位）、childIds=[a,b]
      const y = addFeature.getFeatureById(yId)!;
      const yAnchor = y.getActiveAnchor(t1600)!;
      expect(yAnchor.placement.parentId).toBe('p');
      expect(yAnchor.placement.isTopLevel).toBe(false);
      expect(yAnchor.placement.childIds.slice().sort()).toEqual(['a', 'b']);
      expectContainerInvariant(y);

      // a / b の親は Y
      expect(addFeature.getFeatureById('a')!.getActiveAnchor(t1600)?.placement.parentId).toBe(yId);
      expect(addFeature.getFeatureById('b')!.getActiveAnchor(t1600)?.placement.parentId).toBe(yId);

      // P は全子を Y へ譲り、唯一子 Y で存続（誤 prune されない）
      const pFeature = addFeature.getFeatureById('p')!;
      expect(pFeature.getActiveAnchor(t1400)?.placement.childIds.slice().sort()).toEqual(['a', 'b']);
      expect(pFeature.getActiveAnchor(t1600)?.placement.childIds).toEqual([yId]);
      expectContainerInvariant(pFeature);
    });

    it('所属先が指定時刻に存在しないと拒否する（assertContainerParentValid 存在検証）', () => {
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      // reason を pin: 存在検証分岐（buildContainerFeature 前の確定前ガード）が弾く
      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'ghost' },
      }), /存在しません/);
    });

    it('所属先が面情報でない（点情報）と拒否する（assertContainerParentValid 面情報検証）', () => {
      // Q が点情報。新規コンテナの所属先には面情報のみ指定できる（自治化の確定前検証）。
      const q = new Feature('q', 'Point', [
        new FeatureAnchor(
          'q-a1',
          { start: t1000 },
          { name: 'q', description: '' },
          { type: 'Point', vertexId: 'qv' },
          placement(null, [])
        ),
      ]);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[q.id, q], [x.id, x]]), new Map());

      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'q' },
      }), /面情報のみ/);
    });

    it('所属先 Q が対象の存在期間を覆わないと拒否する（assertContainerParentValid 期間カバレッジ検証）', () => {
      // Q は [t1000,t2000) で終了する集約地物。X は開区間 [t1000,∞)。t1500 で Q は存在するが
      // X の存在期間（t1500 以降の開区間）を覆えないため、Q カバレッジ分岐が弾く。
      const q = makeContainer('q', ['other'], null, t2000);
      const other = makeFeature('other', [makeAnchor('other-a1', t1000, placement('q'), t2000)]);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[q.id, q], [other.id, other], [x.id, x]]), new Map());

      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'q' },
      }), /覆っていません/);
    });

    it('所属先を移動対象自身に指定すると循環参照として拒否する（§6.6.3 validateTransfer の循環検出）', () => {
      // X が自身をカバーするため assertContainerParentValid は通過し、staged に Y(parentId=x) を
      // 入れた状態で validateTransfer が getAncestors(Y) ∋ x を検出して弾く（reason で経路を pin）。
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'x' },
      }), /循環参照/);
    });

    it('Undo で新中間コンテナが消滅し X が旧親直属へ戻り、Redo で再挿入される', () => {
      const p = makeContainer('p', ['x']);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[p.id, p], [x.id, x]]), new Map());
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '自治州', parentId: 'p' },
      }));
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');

      undoRedo.undo();
      expect(addFeature.getFeatureById('f-1')).toBeUndefined();
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1500)?.placement.parentId).toBe('p');
      expect(addFeature.getFeatureById('p')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['x']);

      undoRedo.redo();
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');
      expect(addFeature.getFeatureById('p')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['f-1']);
    });
  });

  // ── 新規上位領域作成サブフロー（再帰積み上げ: 多段中間階層の一括挿入） ──
  // 要件定義書 §2.1 line 293「再帰的に上位領域を積み上げ可能で、中間階層を後付けで挿入できる」。
  // createNewParent.ancestors に最内コンテナのさらに上位へ積む中間階層（外側ほど後ろ）を渡す。
  describe('新規上位領域作成サブフロー（再帰積み上げ）', () => {
    function makeContainer(id: string, childIds: readonly string[], parentId: string | null = null): Feature {
      return makeFeature(id, [
        new FeatureAnchor(
          `${id}-a1`,
          { start: t1000 },
          { name: id, description: '' },
          undefined,
          placement(parentId, childIds)
        ),
      ]);
    }

    function expectContainerInvariant(container: Feature): void {
      for (const anchor of container.anchors) {
        if (anchor.shape === undefined) {
          expect(anchor.placement.childIds.length).toBeGreaterThan(0);
        }
      }
    }

    function expectTransferError(fn: () => void, reasonPattern: RegExp): void {
      let caught: unknown;
      try {
        fn();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(FeatureParentTransferError);
      expect((caught as Error).message).toMatch(reasonPattern);
    }

    it('最内 Y1 と最外 Y2 を一度に積み上げ、最外を最上位とする（連邦化 + 中間階層）', () => {
      // 13 国合衆国化（§6.5）の簡略版 + さらに上位の大陸連合を後付け挿入。
      const n1 = makeFeature('n1', [makeAnchor('n1-a1', t1000, placement(null, []))]);
      const n2 = makeFeature('n2', [makeAnchor('n2-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: {
          name: '合衆国',
          kind: '連邦',
          ancestors: [{ name: '北米連合', kind: '大陸連合' }],
        },
      });

      // createdParentId は最内コンテナ（移動対象の直接の新親）= 最初に採番された f-1
      const y1Id = result.createdParentId!;
      expect(y1Id).toBe('f-1');
      const y1 = addFeature.getFeatureById(y1Id)!;
      const y1Anchor = y1.getActiveAnchor(t1600)!;
      expect(y1Anchor.property.name).toBe('合衆国');
      expect(y1Anchor.property.kind).toBe('連邦');
      expect(y1Anchor.shape).toBeUndefined();
      expect(y1Anchor.placement.childIds.slice().sort()).toEqual(['n1', 'n2']);
      expect(y1Anchor.placement.isTopLevel).toBe(false);

      // 最外 Y2: 北米連合、childIds=[Y1]、最上位（parentId=null / isTopLevel）
      const y2Id = y1Anchor.placement.parentId!;
      expect(y2Id).toBe('f-2');
      const y2 = addFeature.getFeatureById(y2Id)!;
      const y2Anchor = y2.getActiveAnchor(t1600)!;
      expect(y2Anchor.property.name).toBe('北米連合');
      expect(y2Anchor.property.kind).toBe('大陸連合');
      expect(y2Anchor.shape).toBeUndefined();
      expect(y2Anchor.placement.childIds).toEqual([y1Id]);
      expect(y2Anchor.placement.parentId).toBeNull();
      expect(y2Anchor.placement.isTopLevel).toBe(true);

      // n1/n2 の親は最内 Y1
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1600)?.placement.parentId).toBe(y1Id);
      expect(addFeature.getFeatureById('n2')!.getActiveAnchor(t1600)?.placement.parentId).toBe(y1Id);

      expectContainerInvariant(y1);
      expectContainerInvariant(y2);
    });

    it('既存子 X と既存親 P の間に 2 段（Y1 ← Y2）を挿入し、最外 Y2 を P 直下へ（自治化 + 中間階層）', () => {
      // P → Y2 → Y1 → X。P の childIds は X → Y2（最外）へ差し替わる。
      const p = makeContainer('p', ['x']);
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement('p'))]);
      addFeature.restore(new Map([[p.id, p], [x.id, x]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', ancestors: [{ name: '地方' }], parentId: 'p' },
      });

      const y1Id = result.createdParentId!;
      const y1 = addFeature.getFeatureById(y1Id)!;
      const y2Id = y1.getActiveAnchor(t1600)!.placement.parentId!;
      const y2 = addFeature.getFeatureById(y2Id)!;

      // チェーン: P → Y2 → Y1 → X
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1600)?.placement.parentId).toBe(y1Id);
      expect(y1.getActiveAnchor(t1600)?.placement.childIds).toEqual(['x']);
      expect(y1.getActiveAnchor(t1600)?.property.name).toBe('州');
      expect(y2.getActiveAnchor(t1600)?.placement.childIds).toEqual([y1Id]);
      expect(y2.getActiveAnchor(t1600)?.property.name).toBe('地方');
      expect(y2.getActiveAnchor(t1600)?.placement.parentId).toBe('p');
      expect(y2.getActiveAnchor(t1600)?.placement.isTopLevel).toBe(false);

      // P: t1500 未満は [x]、t1500 以降は [Y2]（最外コンテナへ差替え、唯一子でも存続）
      const pFeature = addFeature.getFeatureById('p')!;
      expect(pFeature.getActiveAnchor(t1400)?.placement.childIds).toEqual(['x']);
      expect(pFeature.getActiveAnchor(t1600)?.placement.childIds).toEqual([y2Id]);

      expectContainerInvariant(pFeature);
      expectContainerInvariant(y1);
      expectContainerInvariant(y2);
    });

    it('有限終了の移動対象では、チェーン各段が子の実寿命でのみ存続する（剪定の連鎖）', () => {
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []), t2000)]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', ancestors: [{ name: '国' }] },
      });
      const y1Id = result.createdParentId!;
      const y1 = addFeature.getFeatureById(y1Id)!;
      const y2Id = y1.getActiveAnchor(t1600)!.placement.parentId!;
      const y2 = addFeature.getFeatureById(y2Id)!;

      // 各段とも [t1500,t2000) のみ存続。t2000 以降は子喪失で消滅
      expect(y1.getActiveAnchor(t1600)?.placement.childIds).toEqual(['x']);
      expect(y1.getActiveAnchor(t2000)).toBeUndefined();
      expect(y2.getActiveAnchor(t1600)?.placement.childIds).toEqual([y1Id]);
      expect(y2.getActiveAnchor(t2000)).toBeUndefined();

      expectContainerInvariant(y1);
      expectContainerInvariant(y2);
    });

    it('時間ギャップを持つ移動対象では、チェーン各段が中間の空区間も落とし子の実寿命に追従する', () => {
      // X は [t1000,t2000) と [t2500,∞) の 2 錨（ギャップ [t2000,t2500)）。pruneEmptyContainerAnchors は
      // 位置非依存（末尾に限らず中間の空 shape なし錨も落とす）のため、多段チェーンでも各段が
      // X のギャップに合わせて分断される。
      const x = makeFeature('x', [
        makeAnchor('x-a1', t1000, placement(null, []), t2000),
        makeAnchor('x-a2', t2500, placement(null, [])),
      ]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      const result = transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', ancestors: [{ name: '国' }] },
      });
      const y1Id = result.createdParentId!;
      const y1 = addFeature.getFeatureById(y1Id)!;
      const y2Id = y1.getActiveAnchor(t1600)!.placement.parentId!;
      const y2 = addFeature.getFeatureById(y2Id)!;

      // 各段とも [t1500,t2000) と [t2500,∞) のみ存続し、中間 [t2000,t2500) は空区間として落ちる
      expect(y1.getActiveAnchor(t1600)?.placement.childIds).toEqual(['x']);
      expect(y1.getActiveAnchor(t2200)).toBeUndefined();
      expect(y1.getActiveAnchor(t2600)?.placement.childIds).toEqual(['x']);
      expect(y2.getActiveAnchor(t1600)?.placement.childIds).toEqual([y1Id]);
      expect(y2.getActiveAnchor(t2200)).toBeUndefined();
      expect(y2.getActiveAnchor(t2600)?.placement.childIds).toEqual([y1Id]);

      // X の親はギャップ前後とも Y1
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t1600)?.placement.parentId).toBe(y1Id);
      expect(addFeature.getFeatureById('x')!.getActiveAnchor(t2600)?.placement.parentId).toBe(y1Id);

      expectContainerInvariant(y1);
      expectContainerInvariant(y2);
    });

    it('再帰積み上げで最外の所属先を移動対象自身に指定すると循環参照として拒否する', () => {
      // assertContainerParentValid は X が X をカバーするため通過し、staged にチェーン
      // （Y1.parent=Y2 / Y2.parent=X）を入れた状態で validateTransfer が getAncestors(Y1) ∋ X を検出。
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', ancestors: [{ name: '国' }], parentId: 'x' },
      }), /循環参照/);
    });

    it('積み上げる中間階層の名称が空（空白のみ含む）なら拒否する（各段の名称非空 二重防御）', () => {
      const x = makeFeature('x', [makeAnchor('x-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[x.id, x]]), new Map());

      expectTransferError(() => transfer.reassignFeatureParent({
        featureIds: ['x'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '州', ancestors: [{ name: '  ' }] },
      }), /名称を入力/);
    });

    it('Undo でチェーン全体（Y1・Y2）が消滅し、Redo で同一 ID で再挿入される（単一アンドゥ単位）', () => {
      const n1 = makeFeature('n1', [makeAnchor('n1-a1', t1000, placement(null, []))]);
      const n2 = makeFeature('n2', [makeAnchor('n2-a1', t1000, placement(null, []))]);
      addFeature.restore(new Map([[n1.id, n1], [n2.id, n2]]), new Map());
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['n1', 'n2'],
        newParentId: null,
        effectiveTime: t1500,
        createNewParent: { name: '合衆国', ancestors: [{ name: '北米連合' }] },
      }));
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('f-2')).toBeDefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');

      undoRedo.undo();
      expect(addFeature.getFeatureById('f-1')).toBeUndefined();
      expect(addFeature.getFeatureById('f-2')).toBeUndefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBeNull();

      undoRedo.redo();
      expect(addFeature.getFeatureById('f-1')).toBeDefined();
      expect(addFeature.getFeatureById('f-2')).toBeDefined();
      expect(addFeature.getFeatureById('n1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('f-1');
      expect(addFeature.getFeatureById('f-2')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['f-1']);
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

  describe('集約地物の所属変更（下位領域すべて）+ 解体 (Phase 4-4)', () => {
    // 集約地物（shape なし）コンテナの錨を構築する（t1000 開始・無期限）。
    function containerAnchor(
      id: string,
      parentId: string | null,
      childIds: readonly string[]
    ): FeatureAnchor {
      return new FeatureAnchor(
        id,
        { start: t1000 },
        { name: id, description: '' },
        undefined,
        placement(parentId, childIds)
      );
    }

    /**
     * 多層コンテナの世界を restore する:
     *   C（最上位コンテナ）─┬─ c1（コンテナ）── gc（末端）
     *                       └─ leaf2（末端）
     * すべて t1000 開始・無期限。extra の地物があれば併せて登録する。
     */
    function restoreMultiLevelWorld(extra: readonly Feature[] = []): void {
      const c = makeFeature('C', [containerAnchor('C-a1', null, ['c1', 'leaf2'])]);
      const c1 = makeFeature('c1', [containerAnchor('c1-a1', 'C', ['gc'])]);
      const gc = makeFeature('gc', [makeAnchor('gc-a1', t1000, placement('c1'))]);
      const leaf2 = makeFeature('leaf2', [makeAnchor('leaf2-a1', t1000, placement('C'))]);
      const entries = new Map<string, Feature>([
        ['C', c], ['c1', c1], ['gc', gc], ['leaf2', leaf2],
      ]);
      for (const feature of extra) entries.set(feature.id, feature);
      addFeature.restore(entries, new Map());
    }

    it('annex で下位領域すべてを既存親へ移すとコンテナ子は subtree を保持し旧コンテナは解体される', () => {
      // 新親 Y（最上位コンテナ、既存子 ey を持つ無期限コンテナ）。
      const y = makeFeature('Y', [containerAnchor('Y-a1', null, ['ey'])]);
      const ey = makeFeature('ey', [makeAnchor('ey-a1', t1000, placement('Y'))]);
      restoreMultiLevelWorld([y, ey]);

      transfer.reassignFeatureParent({
        featureIds: ['c1', 'leaf2'],
        newParentId: 'Y',
        effectiveTime: t1500,
        transferType: 'annex',
      });

      // コンテナ子 c1 は subtree（gc）を保持したまま位相のみ Y 配下へ
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('Y');
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['gc']);
      expect(addFeature.getFeatureById('gc')!.getActiveAnchor(t1500)?.placement.parentId).toBe('c1');
      // 末端子 leaf2 も Y 配下へ
      expect(addFeature.getFeatureById('leaf2')!.getActiveAnchor(t1500)?.placement.parentId).toBe('Y');
      // 旧コンテナ C は全子喪失で解体（t1500 以降は非アクティブ）
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)).toBeUndefined();
      // 新親 Y は既存子 ey + 移動子 c1, leaf2 を保持
      expect(addFeature.getFeatureById('Y')!.getActiveAnchor(t1500)?.placement.childIds.sort())
        .toEqual(['c1', 'ey', 'leaf2']);
    });

    it('annex で下位領域すべてを親なしへ移す解体で、コンテナ子は最上位コンテナとして存続し旧コンテナは消滅する', () => {
      restoreMultiLevelWorld();

      transfer.reassignFeatureParent({
        featureIds: ['c1', 'leaf2'],
        newParentId: null,
        effectiveTime: t1500,
        transferType: 'annex',
      });

      const c1Anchor = addFeature.getFeatureById('c1')!.getActiveAnchor(t1500);
      expect(c1Anchor?.placement.parentId).toBeNull();
      expect(c1Anchor?.placement.isTopLevel).toBe(true);
      expect(c1Anchor?.placement.childIds).toEqual(['gc']); // subtree 保持
      const leaf2Anchor = addFeature.getFeatureById('leaf2')!.getActiveAnchor(t1500);
      expect(leaf2Anchor?.placement.parentId).toBeNull();
      expect(leaf2Anchor?.placement.isTopLevel).toBe(true);
      // 孫は影響を受けない
      expect(addFeature.getFeatureById('gc')!.getActiveAnchor(t1500)?.placement.parentId).toBe('c1');
      // 旧コンテナ C のみ消滅（解体: 元の集約地物のみ。要件定義書 §2.1 line 306）
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)).toBeUndefined();
    });

    it('annex で下位領域すべてを新規最上位コンテナへ帰属（連邦編入）し、旧コンテナは解体される', () => {
      restoreMultiLevelWorld();

      const result = transfer.reassignFeatureParent({
        featureIds: ['c1', 'leaf2'],
        newParentId: null,
        effectiveTime: t1500,
        transferType: 'annex',
        createNewParent: { name: '連邦', kind: '連邦' },
      });

      const fed = addFeature.getFeatureById(result.createdParentId!)!;
      const fedAnchor = fed.getActiveAnchor(t1500);
      expect(fedAnchor?.placement.parentId).toBeNull();
      expect(fedAnchor?.placement.isTopLevel).toBe(true);
      expect(fedAnchor?.placement.childIds.slice().sort()).toEqual(['c1', 'leaf2']);
      expect(fedAnchor?.property.kind).toBe('連邦');
      // コンテナ子 c1 は subtree を保持したまま新規コンテナ配下へ
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId)
        .toBe(result.createdParentId);
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.childIds).toEqual(['gc']);
      expect(addFeature.getFeatureById('leaf2')!.getActiveAnchor(t1500)?.placement.parentId)
        .toBe(result.createdParentId);
      // 旧コンテナ C は解体
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)).toBeUndefined();
    });

    it('集約展開分岐: 同じ集約地物子でも annex は許容し reassign は拒否する（要件 §2.1 line 313 二重防御）', () => {
      const y = makeFeature('Y', [containerAnchor('Y-a1', null, ['ey'])]);
      const ey = makeFeature('ey', [makeAnchor('ey-a1', t1000, placement('Y'))]);
      restoreMultiLevelWorld([y, ey]);

      // reassign（scope='selected' 相当）でコンテナ c1 を直接移動しようとすると拒否（line 313 ドメイン側強制）
      expect(() => transfer.reassignFeatureParent({
        featureIds: ['c1'],
        newParentId: 'Y',
        effectiveTime: t1500,
        transferType: 'reassign',
      })).toThrow(FeatureParentTransferError);

      // annex（scope='children' 相当）では同じ c1 を集約展開分岐で許容する
      expect(() => transfer.reassignFeatureParent({
        featureIds: ['c1'],
        newParentId: 'Y',
        effectiveTime: t1500,
        transferType: 'annex',
      })).not.toThrow();
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('Y');
    });

    it('Undo/Redo: 多層コンテナの解体（下位領域すべて→親なし）を復元する', () => {
      restoreMultiLevelWorld();
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['c1', 'leaf2'],
        newParentId: null,
        effectiveTime: t1500,
        transferType: 'annex',
      }));
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)).toBeUndefined();
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBeNull();

      undoRedo.undo();
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)?.placement.childIds.slice().sort())
        .toEqual(['c1', 'leaf2']);
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBe('C');

      undoRedo.redo();
      expect(addFeature.getFeatureById('C')!.getActiveAnchor(t1500)).toBeUndefined();
      expect(addFeature.getFeatureById('c1')!.getActiveAnchor(t1500)?.placement.parentId).toBeNull();
    });
  });

  // 末端地物 → 集約地物の遷移時の直轄領自動生成（要件定義書 §2.1 line 225-230 / §6.4）。
  // 既存末端地物を新親に指定して下位領域を獲得させると、新親は shape を破棄して集約地物化し、
  // 旧形状 − 下位領域の和 の差分を直轄領（新規末端地物）として自動生成する。
  describe('末端地物→集約地物遷移時の直轄領自動生成 (Phase 4-4b)', () => {
    // 実座標を持つ末端地物（リーフ）を生成し、頂点を vertices マップへ登録する。
    function registerLeaf(
      vertices: Map<string, Vertex>,
      id: string,
      coords: readonly (readonly [number, number])[],
      parentId: string | null,
      kind?: string
    ): Feature {
      const vertexIds: string[] = [];
      coords.forEach((c, i) => {
        const vid = `${id}-v${i + 1}`;
        vertices.set(vid, new Vertex(vid, new Coordinate(c[0], c[1])));
        vertexIds.push(vid);
      });
      const ring = new Ring(`${id}-ring`, vertexIds, 'territory', null);
      const property = kind !== undefined
        ? { name: id, description: '', kind }
        : { name: id, description: '' };
      return makeFeature(id, [
        new FeatureAnchor(
          `${id}-a1`,
          { start: t1000 },
          property,
          { type: 'Polygon', rings: [ring] },
          createAnchorPlacement(parentId, [])
        ),
      ]);
    }

    /** 新親 X の集約地物化（shape 破棄 + childIds 非空）を確認する。 */
    function expectContainerInvariant(featureId: string, time: TimePoint): FeatureAnchor {
      const anchor = addFeature.getFeatureById(featureId)!.getActiveAnchor(time)!;
      expect(anchor.shape).toBeUndefined();
      expect(anchor.placement.childIds.length).toBeGreaterThan(0);
      return anchor;
    }

    it('内部に収まる下位領域を獲得すると集約地物化し、差分（穴あき）を直轄領として生成する', () => {
      const vertices = new Map<string, Vertex>();
      // X = 10×10 の最上位末端地物（種別=国）
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      // Y = X 内部に収まる 4×4 の末端地物（最上位 → X 配下へ移す）
      const y = registerLeaf(vertices, 'Y', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      const result = transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
      });

      // X は shape を破棄して集約地物化（§2.1 line 225）
      const xAnchor = expectContainerInvariant('X', t1000);
      expect(xAnchor.placement.childIds).toContain('Y');

      // 直轄領が生成され X の下位領域へ追加される
      const directIds = xAnchor.placement.childIds.filter((id) => id !== 'Y');
      expect(directIds).toHaveLength(1);
      const directId = directIds[0];
      expect(result.changedFeatureIds).toContain(directId);

      const direct = addFeature.getFeatureById(directId)!;
      const dAnchor = direct.getActiveAnchor(t1000)!;
      // 直轄領は末端地物（shape あり Polygon + childIds 空）で X を親に持つ
      expect(dAnchor.shape?.type).toBe('Polygon');
      expect(dAnchor.placement.parentId).toBe('X');
      expect(dAnchor.placement.isTopLevel).toBe(false);
      expect(dAnchor.placement.childIds).toEqual([]);
      // デフォルト名称「<元名> 直轄領」+ 種別継承（§2.1 line 228）
      expect(dAnchor.property.name).toBe('X 直轄領');
      expect(dAnchor.property.kind).toBe('国');
      // 直轄領 = X − Y は 1 領土リング + 1 穴リング（Y が内部のため）
      if (dAnchor.shape?.type === 'Polygon') {
        const territories = dAnchor.shape.rings.filter((r) => r.ringType === 'territory');
        const holes = dAnchor.shape.rings.filter((r) => r.ringType === 'hole');
        expect(territories).toHaveLength(1);
        expect(holes).toHaveLength(1);
      }
    });

    it('差分が複数領域に分かれる場合は1つの直轄領を複数領土リング（飛び地化）で保持する', () => {
      const vertices = new Map<string, Vertex>();
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null);
      // Y = X を縦に分断する帯（上下辺に接触）→ X − Y は左右 2 片
      const y = registerLeaf(vertices, 'Y', [[3, 0], [5, 0], [5, 10], [3, 10]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      const xAnchorBefore = transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
      });

      const xAnchor = expectContainerInvariant('X', t1000);
      const directId = xAnchor.placement.childIds.find((id) => id !== 'Y')!;
      expect(xAnchorBefore.changedFeatureIds).toContain(directId);
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      // 1 末端地物に 2 領土リング（§2.1 line 229 / §6.6.2）
      if (dAnchor.shape?.type === 'Polygon') {
        const territories = dAnchor.shape.rings.filter((r) => r.ringType === 'territory');
        expect(territories).toHaveLength(2);
      }
    });

    it('下位領域が旧形状を完全に覆う場合は直轄領を生成しない（差分空, §2.1 line 230）', () => {
      const vertices = new Map<string, Vertex>();
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null);
      // Y = X と同形状（完全被覆）
      const y = registerLeaf(vertices, 'Y', [[0, 0], [10, 0], [10, 10], [0, 10]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
      });

      // X は shape 破棄で集約地物化するが、直轄領は生成されず子は Y のみ
      const xAnchor = expectContainerInvariant('X', t1000);
      expect(xAnchor.placement.childIds).toEqual(['Y']);
    });

    it('直轄領は新規頂点（v-プレフィックス）で実体化し、Yの頂点は下位領域として存続する', () => {
      const vertices = new Map<string, Vertex>();
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null);
      const y = registerLeaf(vertices, 'Y', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
      });

      // Y の頂点は下位領域として存続するため残る
      expect(addFeature.getVertices().has('Y-v1')).toBe(true);
      // 直轄領は元 shape を流用せず新規頂点（v-プレフィックス）で実体化される
      const xAnchor = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!;
      const directId = xAnchor.placement.childIds.find((id) => id !== 'Y')!;
      const dShape = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!.shape;
      if (dShape?.type === 'Polygon') {
        const directVertexIds = dShape.rings.flatMap((r) => r.vertexIds);
        expect(directVertexIds.length).toBeGreaterThan(0);
        for (const vid of directVertexIds) {
          expect(addFeature.getVertices().has(vid)).toBe(true);
          expect(vid.startsWith('v-')).toBe(true);
        }
      }
      // NOTE: 遷移で破棄した X の旧 shape 頂点（X-v*）の孤立掃除は本サブフェーズではスコープ外
      // （後続へ defer）。無害な未参照頂点として残置する（現状.md §6 参照）。
    });

    it('新規上位領域作成（連邦化）では新親が shape なしコンテナのため直轄領を生成しない', () => {
      const vertices = new Map<string, Vertex>();
      const a = registerLeaf(vertices, 'A', [[0, 0], [4, 0], [4, 4], [0, 4]], null);
      const b = registerLeaf(vertices, 'B', [[6, 0], [10, 0], [10, 4], [6, 4]], null);
      addFeature.restore(new Map([['A', a], ['B', b]]), vertices);

      const result = transfer.reassignFeatureParent({
        featureIds: ['A', 'B'],
        newParentId: null,
        effectiveTime: t1000,
        createNewParent: { name: '連邦' },
      });

      // 新規コンテナの子は A, B のみ（直轄領なし）。A/B は末端地物として shape を保持する。
      const fed = addFeature.getFeatureById(result.createdParentId!)!.getActiveAnchor(t1000)!;
      expect(fed.shape).toBeUndefined();
      expect(fed.placement.childIds.slice().sort()).toEqual(['A', 'B']);
      expect(addFeature.getFeatureById('A')!.getActiveAnchor(t1000)?.shape?.type).toBe('Polygon');
    });

    it('Undo/Redo: 直轄領の生成と旧 shape 破棄を 1 アンドゥ単位で復元する', () => {
      const vertices = new Map<string, Vertex>();
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      const y = registerLeaf(vertices, 'Y', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
      }));

      const xAnchorAfter = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!;
      const directId = xAnchorAfter.placement.childIds.find((id) => id !== 'Y')!;
      expect(addFeature.getFeatureById(directId)).toBeDefined();
      expect(xAnchorAfter.shape).toBeUndefined();

      // 直轄領の新規頂点 ID を控える（snapshot 復元の検証用）
      const directVertexIds = (() => {
        const s = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!.shape;
        return s?.type === 'Polygon' ? s.rings.flatMap((r) => r.vertexIds) : [];
      })();
      expect(directVertexIds.length).toBeGreaterThan(0);

      // Undo: X の shape 復活、直轄領と直轄領の新規頂点は消滅、X の旧 shape は復元される
      undoRedo.undo();
      const xAnchorUndo = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!;
      expect(xAnchorUndo.shape?.type).toBe('Polygon');
      expect(xAnchorUndo.placement.childIds).toEqual([]);
      expect(addFeature.getFeatureById(directId)).toBeUndefined();
      expect(addFeature.getVertices().has('X-v1')).toBe(true);
      for (const vid of directVertexIds) {
        expect(addFeature.getVertices().has(vid)).toBe(false);
      }

      // Redo: 同じ直轄領 ID・同じ頂点で再生成（スナップショット復元, §6.4.12）
      undoRedo.redo();
      const xAnchorRedo = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!;
      expect(xAnchorRedo.shape).toBeUndefined();
      expect(xAnchorRedo.placement.childIds).toContain(directId);
      expect(addFeature.getFeatureById(directId)).toBeDefined();
      for (const vid of directVertexIds) {
        expect(addFeature.getVertices().has(vid)).toBe(true);
      }
    });

    it('既存集約地物への下位領域追加では差分処理は発生しない（§2.1 line 231）', () => {
      const vertices = new Map<string, Vertex>();
      // P = 既存の集約地物（shape なし）、子 leaf を持つ
      const leaf = registerLeaf(vertices, 'leaf', [[0, 0], [4, 0], [4, 4], [0, 4]], 'P');
      const p = makeFeature('P', [
        new FeatureAnchor('P-a1', { start: t1000 }, { name: 'P', description: '' }, undefined, placement(null, ['leaf'])),
      ]);
      // Z = 最上位末端地物 → P 配下へ移す
      const z = registerLeaf(vertices, 'Z', [[6, 0], [10, 0], [10, 4], [6, 4]], null);
      addFeature.restore(new Map([['P', p], ['leaf', leaf], ['Z', z]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['Z'],
        newParentId: 'P',
        effectiveTime: t1000,
        transferType: 'cede',
      });

      // P は元から shape なしコンテナ。直轄領は生成されず子は leaf, Z のみ。
      const pAnchor = addFeature.getFeatureById('P')!.getActiveAnchor(t1000)!;
      expect(pAnchor.shape).toBeUndefined();
      expect(pAnchor.placement.childIds.slice().sort()).toEqual(['Z', 'leaf']);
    });

    it('自治化で所属先が末端地物のとき、所属先も集約地物化し直轄領を生成する（Undo/Redo含む）', () => {
      const vertices = new Map<string, Vertex>();
      // Q = 既存の最上位末端地物（新規中間コンテナの所属先, 種別「国」）
      const q = registerLeaf(vertices, 'Q', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      // X = Q 内部の最上位末端地物。新規中間コンテナ Y を作って X を Y 配下に、Y を Q 配下に（自治化）
      const x = registerLeaf(vertices, 'X', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['Q', q], ['X', x]]), vertices);
      const undoRedo = new UndoRedoManager();

      undoRedo.execute(new ReassignFeatureParentCommand(transfer, addFeature, {
        featureIds: ['X'],
        newParentId: null,
        effectiveTime: t1000,
        createNewParent: { name: '自治州', kind: '州', parentId: 'Q' },
      }));

      // 新規中間コンテナ Y（X を子に, Q を親に）
      const yId = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!.placement.parentId!;
      const yAnchor = addFeature.getFeatureById(yId)!.getActiveAnchor(t1000)!;
      expect(yAnchor.shape).toBeUndefined();
      expect(yAnchor.placement.parentId).toBe('Q');
      expect(yAnchor.placement.childIds).toEqual(['X']);

      // 所属先 Q も末端→集約遷移する（shape 破棄 + childIds=[Y, 直轄領]）。
      // これが Issue 1 の回帰: 旧実装では Q が「shape あり + childIds=[Y]」の移行期間ノードのまま残った。
      const qAnchor = addFeature.getFeatureById('Q')!.getActiveAnchor(t1000)!;
      expect(qAnchor.shape).toBeUndefined();
      expect(qAnchor.placement.childIds).toContain(yId);
      const directId = qAnchor.placement.childIds.find((id) => id !== yId)!;
      expect(directId).toBeDefined();
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      expect(dAnchor.shape?.type).toBe('Polygon');
      expect(dAnchor.placement.parentId).toBe('Q');
      expect(dAnchor.placement.childIds).toEqual([]);
      expect(dAnchor.property.name).toBe('Q 直轄領');
      expect(dAnchor.property.kind).toBe('国');
      // 直轄領 = Q − X は穴あき（X が Q 内部）
      if (dAnchor.shape?.type === 'Polygon') {
        expect(dAnchor.shape.rings.filter((r) => r.ringType === 'territory')).toHaveLength(1);
        expect(dAnchor.shape.rings.filter((r) => r.ringType === 'hole')).toHaveLength(1);
      }

      // Undo: Q が末端地物（shape あり）へ戻り、Y・直轄領は消滅
      undoRedo.undo();
      const qUndo = addFeature.getFeatureById('Q')!.getActiveAnchor(t1000)!;
      expect(qUndo.shape?.type).toBe('Polygon');
      expect(qUndo.placement.childIds).toEqual([]);
      expect(addFeature.getFeatureById(yId)).toBeUndefined();
      expect(addFeature.getFeatureById(directId)).toBeUndefined();

      // Redo: Q が再び集約地物化し、同じ直轄領 ID が復元される
      undoRedo.redo();
      expect(addFeature.getFeatureById('Q')!.getActiveAnchor(t1000)!.shape).toBeUndefined();
      expect(addFeature.getFeatureById(directId)).toBeDefined();
    });

    // 直轄領のデフォルト名称/種別の上書き（要件定義書 §2.1 line 228, Phase 4-4b-2a）。
    it('上書き指定時は直轄領の名称・種別をユーザー入力で置き換える（征服）', () => {
      const vertices = new Map<string, Vertex>();
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      const y = registerLeaf(vertices, 'Y', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
        directlyGovernedOverride: { name: '首都圏', kind: '特別区' },
      });

      const xAnchor = expectContainerInvariant('X', t1000);
      const directId = xAnchor.placement.childIds.find((id) => id !== 'Y')!;
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      expect(dAnchor.property.name).toBe('首都圏');
      expect(dAnchor.property.kind).toBe('特別区');
    });

    it('上書きの名称が空ならデフォルト名称、種別が空なら継承を解除して種別なし', () => {
      const vertices = new Map<string, Vertex>();
      // X は種別「国」。override が存在し種別が空のときは継承を解除する
      // （override 未指定時の継承＝既存テスト とは区別する）。
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      const y = registerLeaf(vertices, 'Y', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['X', x], ['Y', y]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['Y'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'cede',
        directlyGovernedOverride: { name: '   ', kind: '   ' },
      });

      const xAnchor = expectContainerInvariant('X', t1000);
      const directId = xAnchor.placement.childIds.find((id) => id !== 'Y')!;
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      expect(dAnchor.property.name).toBe('X 直轄領');
      expect(dAnchor.property.kind).toBeUndefined();
    });

    it('自治化で所属先が末端のとき、所属先の直轄領にも上書きが反映される', () => {
      const vertices = new Map<string, Vertex>();
      const q = registerLeaf(vertices, 'Q', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      const x = registerLeaf(vertices, 'X', [[2, 2], [6, 2], [6, 6], [2, 6]], null);
      addFeature.restore(new Map([['Q', q], ['X', x]]), vertices);

      transfer.reassignFeatureParent({
        featureIds: ['X'],
        newParentId: null,
        effectiveTime: t1000,
        createNewParent: { name: '自治州', kind: '州', parentId: 'Q' },
        directlyGovernedOverride: { name: 'Q中央領', kind: '直轄' },
      });

      const qAnchor = addFeature.getFeatureById('Q')!.getActiveAnchor(t1000)!;
      expect(qAnchor.shape).toBeUndefined();
      const yId = addFeature.getFeatureById('X')!.getActiveAnchor(t1000)!.placement.parentId!;
      const directId = qAnchor.placement.childIds.find((id) => id !== yId)!;
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      expect(dAnchor.property.name).toBe('Q中央領');
      expect(dAnchor.property.kind).toBe('直轄');
    });

    it('annex（下位領域すべて）経路でも新親が既存末端なら上書きが反映される', () => {
      const vertices = new Map<string, Vertex>();
      // X = 既存最上位末端（annex 先）。c1/c2 = 集約地物 C の子（X 内部）。
      const x = registerLeaf(vertices, 'X', [[0, 0], [10, 0], [10, 10], [0, 10]], null, '国');
      const c1 = registerLeaf(vertices, 'c1', [[2, 2], [4, 2], [4, 4], [2, 4]], 'C');
      const c2 = registerLeaf(vertices, 'c2', [[6, 6], [8, 6], [8, 8], [6, 8]], 'C');
      const c = makeFeature('C', [
        new FeatureAnchor('C-a1', { start: t1000 }, { name: 'C', description: '' }, undefined, placement(null, ['c1', 'c2'])),
      ]);
      addFeature.restore(new Map([['X', x], ['C', c], ['c1', c1], ['c2', c2]]), vertices);

      // C の下位領域すべて（c1, c2）を X 配下へ annex。X は末端→集約遷移する。
      transfer.reassignFeatureParent({
        featureIds: ['c1', 'c2'],
        newParentId: 'X',
        effectiveTime: t1000,
        transferType: 'annex',
        directlyGovernedOverride: { name: '本土', kind: '直轄州' },
      });

      const xAnchor = expectContainerInvariant('X', t1000);
      const directId = xAnchor.placement.childIds.find((id) => id !== 'c1' && id !== 'c2')!;
      const dAnchor = addFeature.getFeatureById(directId)!.getActiveAnchor(t1000)!;
      expect(dAnchor.property.name).toBe('本土');
      expect(dAnchor.property.kind).toBe('直轄州');
    });
  });
});
