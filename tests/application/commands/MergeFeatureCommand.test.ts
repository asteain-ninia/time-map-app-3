import { describe, it, expect, beforeEach } from 'vitest';
import { MergeFeatureCommand } from '@application/commands/MergeFeatureCommand';
import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { Vertex } from '@domain/entities/Vertex';
import { Feature } from '@domain/entities/Feature';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { FeatureAnchor, createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';

describe('MergeFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(2000);

  /** 隣接する2つの正方形ポリゴンを作成 */
  function createAdjacentSquares() {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(5, 0), new Coordinate(5, 10), new Coordinate(0, 10)],
      time, '左半分'
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(5, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(5, 10)],
      time, '右半分'
    );
    return { f1, f2 };
  }

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  it('2つのポリゴンを結合する', () => {
    const { f1, f2 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();

    // 地物が1つ減っている（結合で1つに統合）
    expect(addFeature.getFeatures().length).toBe(featuresBefore - 1);
    // 最初の地物が残っている
    const merged = addFeature.getFeatureById(f1.id);
    expect(merged).toBeDefined();
    // 2番目の地物は削除されている
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
  });

  it('Undoで元の状態に戻る', () => {
    const { f1, f2 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();
    cmd.undo();

    // 元の地物数に戻る
    expect(addFeature.getFeatures().length).toBe(featuresBefore);
    expect(addFeature.getFeatureById(f1.id)).toBeDefined();
    expect(addFeature.getFeatureById(f2.id)).toBeDefined();
  });

  it('Undoで結合追加頂点が削除される', () => {
    const { f1, f2 } = createAdjacentSquares();
    const verticesBefore = addFeature.getVertices().size;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();
    cmd.undo();

    expect(addFeature.getVertices().size).toBe(verticesBefore);
  });

  it('redoで結合後の頂点IDを復元し後続の頂点移動を再実行できる', () => {
    const { f1, f2 } = createAdjacentSquares();
    const mergeCommand = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    undoRedo.execute(mergeCommand);

    const mergedVertexIds = getPolygonVertexIds(f1.id);
    const movedVertexId = findLeftmostVertexId(mergedVertexIds);
    const originalVertex = addFeature.getVertices().get(movedVertexId)!;
    const movedCoordinate = new Coordinate(originalVertex.coordinate.x - 1, originalVertex.coordinate.y);

    undoRedo.execute(new MoveVertexCommand(
      vertexEdit,
      addFeature,
      movedVertexId,
      movedCoordinate,
      null,
      time
    ));

    undoRedo.undo();
    undoRedo.undo();
    expect(addFeature.getFeatureById(f2.id)).toBeDefined();

    undoRedo.redo();
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
    expect(getPolygonVertexIds(f1.id)).toEqual(mergedVertexIds);

    undoRedo.redo();
    expect(addFeature.getVertices().get(movedVertexId)?.coordinate).toEqual(movedCoordinate);
  });

  it('カスタム名を設定できる', () => {
    const { f1, f2 } = createAdjacentSquares();

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
      mergedName: '統合領域',
    });
    cmd.execute();

    const merged = addFeature.getFeatureById(f1.id)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.property.name).toBe('統合領域');
  });

  it('1つの地物IDでは拒否する', () => {
    const { f1 } = createAdjacentSquares();

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id],
      currentTime: time,
    });

    expect(() => cmd.execute()).toThrow('2つ以上');
  });

  it('同じ地物IDだけの結合は拒否する', () => {
    const { f1 } = createAdjacentSquares();

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f1.id],
      currentTime: time,
    });

    expect(() => cmd.execute()).toThrow('2つ以上');
    expect(addFeature.getFeatureById(f1.id)).toBeDefined();
  });

  it('3つのポリゴンを結合する', () => {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(4, 0), new Coordinate(4, 10), new Coordinate(0, 10)],
      time
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(4, 0), new Coordinate(7, 0), new Coordinate(7, 10), new Coordinate(4, 10)],
      time
    );
    const f3 = addFeature.addPolygon(
      [new Coordinate(7, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(7, 10)],
      time
    );

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id, f3.id],
      currentTime: time,
    });
    cmd.execute();

    // 3つが1つに統合
    expect(addFeature.getFeatures().length).toBe(1);
    expect(addFeature.getFeatureById(f1.id)).toBeDefined();
  });

  it('離れたポリゴン同士を結合しても両方を領土リングとして保持する', () => {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(5, 0), new Coordinate(5, 5), new Coordinate(0, 5)],
      time
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(20, 0), new Coordinate(25, 0), new Coordinate(25, 5), new Coordinate(20, 5)],
      time
    );

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();

    const merged = addFeature.getFeatureById(f1.id)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.shape.type).toBe('Polygon');
    if (anchor.shape.type !== 'Polygon') return;
    expect(anchor.shape.rings.filter((ring) => ring.ringType === 'territory' && ring.parentId === null)).toHaveLength(2);
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
  });

  it('複数territory ringを持つ地物の再マージでも2つ目以降をhole扱いしない', () => {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(5, 0), new Coordinate(5, 5), new Coordinate(0, 5)],
      time
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(20, 0), new Coordinate(25, 0), new Coordinate(25, 5), new Coordinate(20, 5)],
      time
    );
    const firstMerge = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    firstMerge.execute();

    const f3 = addFeature.addPolygon(
      [new Coordinate(25, 0), new Coordinate(30, 0), new Coordinate(30, 5), new Coordinate(25, 5)],
      time
    );
    const secondMerge = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f3.id],
      currentTime: time,
    });
    secondMerge.execute();

    const merged = addFeature.getFeatureById(f1.id)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.shape.type).toBe('Polygon');
    if (anchor.shape.type !== 'Polygon') return;

    const territories = anchor.shape.rings.filter((ring) => ring.ringType === 'territory');
    const holes = anchor.shape.rings.filter((ring) => ring.ringType === 'hole');
    const vertices = addFeature.getVertices();
    const bounds = territories.map((ring) => {
      const xs = ring.vertexIds.map((vertexId) => vertices.get(vertexId)!.x);
      return { minX: Math.min(...xs), maxX: Math.max(...xs) };
    });

    expect(territories).toHaveLength(2);
    expect(holes).toHaveLength(0);
    expect(bounds).toContainEqual({ minX: 0, maxX: 5 });
    expect(bounds).toContainEqual({ minX: 20, maxX: 30 });
    expect(addFeature.getFeatureById(f3.id)).toBeUndefined();
  });

  it('穴内の島を結合した場合はterritoryをhole配下へ再接続する', () => {
    const donut = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(20, 0), new Coordinate(20, 20), new Coordinate(0, 20)],
      time
    );
    const donutAnchor = donut.getActiveAnchor(time)!;
    if (donutAnchor.shape.type !== 'Polygon') {
      throw new Error('test setup failed');
    }

    const vertices = addFeature.getVertices() as Map<string, Vertex>;
    const holeVertexIds = [
      new Coordinate(5, 5),
      new Coordinate(15, 5),
      new Coordinate(15, 15),
      new Coordinate(5, 15),
    ].map((coordinate, index) => {
      const id = `hole-${index}`;
      vertices.set(id, new Vertex(id, coordinate));
      return id;
    });
    const outerRing = donutAnchor.shape.rings[0];
    const holeRing = new Ring('hole-1', holeVertexIds, 'hole', outerRing.id);
    const updatedAnchor = donutAnchor.withShape({
      type: 'Polygon',
      rings: [outerRing, holeRing],
    });
    const featuresMap = addFeature.getFeaturesMap() as Map<string, typeof donut>;
    featuresMap.set(
      donut.id,
      donut.withAnchors(donut.anchors.map((anchor) =>
        anchor.id === donutAnchor.id ? updatedAnchor : anchor
      ))
    );

    const island = addFeature.addPolygon(
      [new Coordinate(8, 8), new Coordinate(12, 8), new Coordinate(12, 12), new Coordinate(8, 12)],
      time
    );
    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [donut.id, island.id],
      currentTime: time,
    });
    cmd.execute();

    const merged = addFeature.getFeatureById(donut.id)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.shape.type).toBe('Polygon');
    if (anchor.shape.type !== 'Polygon') return;

    const holes = anchor.shape.rings.filter((ring) => ring.ringType === 'hole');
    const topLevelTerritories = anchor.shape.rings.filter((ring) =>
      ring.ringType === 'territory' && ring.parentId === null
    );
    const islandTerritories = anchor.shape.rings.filter((ring) =>
      ring.ringType === 'territory' && ring.parentId !== null
    );

    expect(holes).toHaveLength(1);
    expect(topLevelTerritories).toHaveLength(1);
    expect(islandTerritories).toHaveLength(1);
    expect(islandTerritories[0].parentId).toBe(holes[0].id);
    expect(validatePolygonRingHierarchy(anchor.shape.rings, addFeature.getVertices())).toEqual([]);
  });

  // Phase 2-D-5 でレイヤー編集 UI 撤去 / Phase 2-D-6-3b で AnchorPlacement.layerId 撤去済み。
  // Phase 4-5 で MergeService.validateMerge から旧「同一レイヤー」前提を撤廃し、
  // 「結合対象が互いに上位下位関係にないこと」（要件定義書 §2.1 line 351-354 / 現状.md §6.4 line 146）の
  // ancestor-descendant 検査へ移行した。判定は validateMergeFeatures が選択時（App.svelte
  // addMergeTarget）と確定前（本コマンド）で共有する（開発ガイド §6.6.1 / §6.6.3 line 584）。
  // 旧「異なるレイヤーのポリゴン結合は拒否」テストは仕様廃止に合わせて撤去済み。

  it('上位・下位関係にある地物の同時選択を拒否する（要件定義書 §2.1 line 351-354）', () => {
    // 移行期間ノード（shape あり + childIds 非空）の parent と、その子 child。
    // 双方 Polygon shape を持つため形状チェックは通過し、上位・下位関係で拒否される。
    const vertices = new Map<string, Vertex>([
      ['p1', new Vertex('p1', new Coordinate(0, 0))],
      ['p2', new Vertex('p2', new Coordinate(10, 0))],
      ['p3', new Vertex('p3', new Coordinate(10, 10))],
      ['c1', new Vertex('c1', new Coordinate(0, 0))],
      ['c2', new Vertex('c2', new Coordinate(5, 0))],
      ['c3', new Vertex('c3', new Coordinate(5, 5))],
    ]);
    const parent = new Feature('parent', 'Polygon', [
      new FeatureAnchor(
        'parent-a',
        { start: time },
        { name: 'parent', description: '' },
        { type: 'Polygon', rings: [new Ring('parent-r', ['p1', 'p2', 'p3'], 'territory', null)] },
        createAnchorPlacement(null, ['child'])
      ),
    ]);
    const child = new Feature('child', 'Polygon', [
      new FeatureAnchor(
        'child-a',
        { start: time },
        { name: 'child', description: '' },
        { type: 'Polygon', rings: [new Ring('child-r', ['c1', 'c2', 'c3'], 'territory', null)] },
        createAnchorPlacement('parent', [])
      ),
    ]);
    addFeature.restore(new Map([['parent', parent], ['child', child]]), vertices);

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: ['parent', 'child'],
      currentTime: time,
    });
    expect(() => cmd.execute()).toThrow('同時に結合対象にできません');
  });

  function getPolygonVertexIds(featureId: string): readonly string[] {
    const shape = addFeature.getFeatureById(featureId)?.getActiveAnchor(time)?.shape;
    if (shape?.type !== 'Polygon') {
      return [];
    }
    return shape.rings.flatMap((ring) => [...ring.vertexIds]);
  }

  function findLeftmostVertexId(vertexIds: readonly string[]): string {
    const vertices = addFeature.getVertices();
    const leftmost = vertexIds.reduce<string | null>((currentId, candidateId) => {
      if (!currentId) {
        return candidateId;
      }
      const current = vertices.get(currentId);
      const candidate = vertices.get(candidateId);
      if (!current || !candidate) {
        return currentId;
      }
      return candidate.coordinate.x < current.coordinate.x ? candidateId : currentId;
    }, null);

    if (!leftmost) {
      throw new Error('vertex expected');
    }
    return leftmost;
  }
});
