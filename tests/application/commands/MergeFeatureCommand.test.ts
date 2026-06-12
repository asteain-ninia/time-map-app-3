import { describe, it, expect, beforeEach } from 'vitest';
import { MergeFeatureCommand } from '@application/commands/MergeFeatureCommand';
import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ReassignFeatureParentUseCase } from '@application/ReassignFeatureParentUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { eventBus } from '@application/EventBus';
import { Vertex } from '@domain/entities/Vertex';
import { Feature } from '@domain/entities/Feature';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { FeatureAnchor, createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import { serialize, deserialize } from '@infrastructure/persistence/JSONSerializer';
import { validateParentChildUnion } from '@infrastructure/persistence/worldValidation';

/**
 * 結合の確定経路（要件定義書 §2.1「合体（結合）機能」line 326-329）のテスト。
 *
 * Phase 4-6 再設計後のセマンティクス:
 * - 元の末端地物はすべて結合時刻に存在を終了する歴史の錨が打たれる（錨打ち切り）。
 *   結合時刻ちょうどに開始していた地物は存在期間が空になり地物ごと消滅する。
 * - 結果の末端地物（形状 = 論理和）が結合時刻から新規開始する（新規 ID）。
 * - 親の childIds は結合時刻で錨分割され、以前は元リーフ・以降は結果地物を列挙する。
 */
describe('MergeFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let reassignParent: ReassignFeatureParentUseCase;
  let vertexEdit: VertexEditUseCase;
  let undoRedo: UndoRedoManager;
  const past = new TimePoint(1900);
  const beforeMerge = new TimePoint(1950);
  const time = new TimePoint(2000);

  /** 隣接する2つの正方形ポリゴンを作成（start = 指定時刻） */
  function createAdjacentSquares(start: TimePoint = time) {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(5, 0), new Coordinate(5, 10), new Coordinate(0, 10)],
      start, '左半分'
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(5, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(5, 10)],
      start, '右半分'
    );
    return { f1, f2 };
  }

  function buildMergeCommand(
    featureIds: readonly string[],
    mergedName?: string
  ): MergeFeatureCommand {
    return new MergeFeatureCommand(reassignParent, addFeature, {
      featureIds,
      currentTime: time,
      ...(mergedName !== undefined ? { mergedName } : {}),
    });
  }

  function buildWorld(): World {
    return new World(
      '1.0.0',
      new Map(addFeature.getVertices()),
      new Map(addFeature.getFeaturesMap()),
      new Map(addFeature.getSharedVertexGroups()),
      [],
      DEFAULT_METADATA
    );
  }

  /** 全地物・全錨の親子参照が存在する地物のみを指すこと（ロード時の参照整合検証と同条件） */
  function expectNoDanglingReferences(): void {
    const features = addFeature.getFeaturesMap();
    for (const feature of features.values()) {
      for (const anchor of feature.anchors) {
        if (anchor.placement.parentId !== null) {
          expect(features.has(anchor.placement.parentId)).toBe(true);
        }
        for (const childId of anchor.placement.childIds) {
          expect(features.has(childId)).toBe(true);
        }
      }
    }
  }

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    reassignParent = new ReassignFeatureParentUseCase(addFeature);
    vertexEdit = new VertexEditUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  it('2つのポリゴンを結合すると結果地物が新規生成される', () => {
    const { f1, f2 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = buildMergeCommand([f1.id, f2.id]);
    cmd.execute();

    // 結果地物は新規 ID（元の先頭 ID を再利用しない）
    const mergedId = cmd.mergedFeatureId!;
    expect(mergedId).toBeTruthy();
    expect(mergedId).not.toBe(f1.id);
    expect(mergedId).not.toBe(f2.id);

    const merged = addFeature.getFeatureById(mergedId)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.shape?.type).toBe('Polygon');
    expect(anchor.timeRange.start.equals(time)).toBe(true);
    expect(anchor.timeRange.end).toBeUndefined();
    expect(anchor.placement.parentId).toBeNull();
    expect(anchor.placement.isTopLevel).toBe(true);

    // 結合時刻ちょうどに開始していた元リーフは存在期間が空になり地物ごと消滅する
    expect(addFeature.getFeatureById(f1.id)).toBeUndefined();
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
    expect(addFeature.getFeatures().length).toBe(featuresBefore - 1);
  });

  it('結合時刻より前に開始していた元リーフは存在終了の錨が打たれ歴史が残る', () => {
    const { f1, f2 } = createAdjacentSquares(past);
    const f1ShapeBefore = f1.getActiveAnchor(beforeMerge)!.shape;
    const f1VertexIds = getPolygonVertexIds(f1.id, beforeMerge);
    expect(f1VertexIds.length).toBeGreaterThan(0);

    const cmd = buildMergeCommand([f1.id, f2.id]);
    cmd.execute();

    // 元リーフは消滅せず、結合時刻で存在終了する（半開区間: 結合時刻ちょうどには非有効）
    for (const id of [f1.id, f2.id]) {
      const feature = addFeature.getFeatureById(id)!;
      expect(feature).toBeDefined();
      expect(feature.getActiveAnchor(time)).toBeUndefined();
      const historical = feature.getActiveAnchor(beforeMerge)!;
      expect(historical).toBeDefined();
      expect(historical.timeRange.end?.equals(time)).toBe(true);
    }

    // 存在終了前の歴史の形状と頂点参照は破壊されない（§6.4.15 / §6.4.17）
    expect(addFeature.getFeatureById(f1.id)!.getActiveAnchor(beforeMerge)!.shape)
      .toEqual(f1ShapeBefore);
    for (const vertexId of f1VertexIds) {
      expect(addFeature.getVertices().has(vertexId)).toBe(true);
    }

    // 結果地物は結合時刻から開始し、それ以前には存在しない
    const merged = addFeature.getFeatureById(cmd.mergedFeatureId!)!;
    expect(merged.getActiveAnchor(time)).toBeDefined();
    expect(merged.getActiveAnchor(beforeMerge)).toBeUndefined();
  });

  it('Undoで元の状態に戻る', () => {
    const { f1, f2 } = createAdjacentSquares(past);
    const featuresBefore = addFeature.getFeatures().length;
    const f1AnchorsBefore = addFeature.getFeatureById(f1.id)!.anchors;

    const cmd = buildMergeCommand([f1.id, f2.id]);
    cmd.execute();
    cmd.undo();

    expect(addFeature.getFeatures().length).toBe(featuresBefore);
    expect(addFeature.getFeatureById(f1.id)!.anchors).toEqual(f1AnchorsBefore);
    expect(addFeature.getFeatureById(f2.id)).toBeDefined();
    expect(addFeature.getFeatureById(cmd.mergedFeatureId!)).toBeUndefined();
  });

  it('Undoで結合追加頂点が削除される', () => {
    const { f1, f2 } = createAdjacentSquares();
    const verticesBefore = addFeature.getVertices().size;

    const cmd = buildMergeCommand([f1.id, f2.id]);
    cmd.execute();
    cmd.undo();

    expect(addFeature.getVertices().size).toBe(verticesBefore);
  });

  it('execute/undo/redoが全変更地物へ対称にイベントを発火する（厳密一致）', () => {
    const { f1, f2 } = createAdjacentSquares();

    const events: string[] = [];
    const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
      events.push(`added:${featureId}`);
    });
    const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
      events.push(`removed:${featureId}`);
    });

    try {
      const cmd = buildMergeCommand([f1.id, f2.id]);
      undoRedo.execute(cmd);
      const mergedId = cmd.mergedFeatureId!;
      // 結合時刻開始の元リーフは消滅（removed）、結果地物は新規（added）
      expect([...events].sort()).toEqual(
        [`added:${mergedId}`, `removed:${f1.id}`, `removed:${f2.id}`].sort()
      );

      events.length = 0;
      undoRedo.undo();
      expect([...events].sort()).toEqual(
        [`added:${f1.id}`, `added:${f2.id}`, `removed:${mergedId}`].sort()
      );

      events.length = 0;
      undoRedo.redo();
      expect([...events].sort()).toEqual(
        [`added:${mergedId}`, `removed:${f1.id}`, `removed:${f2.id}`].sort()
      );
    } finally {
      unsubscribeAdded();
      unsubscribeRemoved();
    }
  });

  it('redoで結合後の頂点IDを復元し後続の頂点移動を再実行できる', () => {
    const { f1, f2 } = createAdjacentSquares();
    const mergeCommand = buildMergeCommand([f1.id, f2.id]);
    undoRedo.execute(mergeCommand);
    const mergedId = mergeCommand.mergedFeatureId!;

    const mergedVertexIds = getPolygonVertexIds(mergedId, time);
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
    expect(addFeature.getFeatureById(mergedId)).toBeUndefined();

    // redo は afterState 復元で生成 ID（地物・頂点）を固定する（§6.4.12）
    undoRedo.redo();
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
    expect(getPolygonVertexIds(mergedId, time)).toEqual(mergedVertexIds);

    undoRedo.redo();
    expect(addFeature.getVertices().get(movedVertexId)?.coordinate).toEqual(movedCoordinate);
  });

  it('カスタム名を設定でき、属性は最初の対象から継承する', () => {
    const { f1, f2 } = createAdjacentSquares();

    const cmd = buildMergeCommand([f1.id, f2.id], '統合領域');
    cmd.execute();

    const anchor = addFeature.getFeatureById(cmd.mergedFeatureId!)!.getActiveAnchor(time)!;
    expect(anchor.property.name).toBe('統合領域');
  });

  it('名称が空白のみなら最初の対象の名称を継承する', () => {
    const { f1, f2 } = createAdjacentSquares();

    const cmd = buildMergeCommand([f1.id, f2.id], '   ');
    cmd.execute();

    const anchor = addFeature.getFeatureById(cmd.mergedFeatureId!)!.getActiveAnchor(time)!;
    expect(anchor.property.name).toBe('左半分');
  });

  it('1つの地物IDでは拒否する', () => {
    const { f1 } = createAdjacentSquares();

    const cmd = buildMergeCommand([f1.id]);
    expect(() => cmd.execute()).toThrow('2つ以上');
  });

  it('同じ地物IDだけの結合は拒否する', () => {
    const { f1 } = createAdjacentSquares();

    const cmd = buildMergeCommand([f1.id, f1.id]);
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

    const cmd = buildMergeCommand([f1.id, f2.id, f3.id]);
    cmd.execute();

    // 3つが1つに統合（全て結合時刻開始のため元リーフは消滅）
    expect(addFeature.getFeatures().length).toBe(1);
    expect(addFeature.getFeatureById(cmd.mergedFeatureId!)).toBeDefined();
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

    const cmd = buildMergeCommand([f1.id, f2.id]);
    cmd.execute();

    const anchor = addFeature.getFeatureById(cmd.mergedFeatureId!)!.getActiveAnchor(time)!;
    expect(anchor.shape?.type).toBe('Polygon');
    if (anchor.shape?.type !== 'Polygon') return;
    expect(anchor.shape.rings.filter((ring) => ring.ringType === 'territory' && ring.parentId === null)).toHaveLength(2);
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
    const firstMerge = buildMergeCommand([f1.id, f2.id]);
    firstMerge.execute();
    const firstMergedId = firstMerge.mergedFeatureId!;

    const f3 = addFeature.addPolygon(
      [new Coordinate(25, 0), new Coordinate(30, 0), new Coordinate(30, 5), new Coordinate(25, 5)],
      time
    );
    const secondMerge = buildMergeCommand([firstMergedId, f3.id]);
    secondMerge.execute();

    const anchor = addFeature.getFeatureById(secondMerge.mergedFeatureId!)!.getActiveAnchor(time)!;
    expect(anchor.shape?.type).toBe('Polygon');
    if (anchor.shape?.type !== 'Polygon') return;

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
    if (donutAnchor.shape?.type !== 'Polygon') {
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
    const cmd = buildMergeCommand([donut.id, island.id]);
    cmd.execute();

    const anchor = addFeature.getFeatureById(cmd.mergedFeatureId!)!.getActiveAnchor(time)!;
    expect(anchor.shape?.type).toBe('Polygon');
    if (anchor.shape?.type !== 'Polygon') return;

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

    const cmd = buildMergeCommand(['parent', 'child']);
    expect(() => cmd.execute()).toThrow('同時に結合対象にできません');
  });

  describe('親を持つ末端地物同士の結合（親 childIds の時刻同期）', () => {
    /**
     * 純粋コンテナ container（shape なし）の下に隣接する末端地物 leaf-a / leaf-b を置く。
     * fixture は実体クラスで構築する（開発ガイド §6.5.5）。
     * 錨は past（結合時刻より前）に開始させ、錨分割（存在終了 + childIds 時刻同期）を検証する。
     */
    function setupSiblingsUnderContainer(start: TimePoint = past) {
      const vertices = new Map<string, Vertex>();
      const makeSquareVertexIds = (prefix: string, x0: number): string[] => {
        const coords = [
          new Coordinate(x0, 0),
          new Coordinate(x0 + 5, 0),
          new Coordinate(x0 + 5, 10),
          new Coordinate(x0, 10),
        ];
        return coords.map((coordinate, index) => {
          const id = `${prefix}${index}`;
          vertices.set(id, new Vertex(id, coordinate));
          return id;
        });
      };
      const leafA = new Feature('leaf-a', 'Polygon', [
        new FeatureAnchor(
          'leaf-a-anchor',
          { start },
          { name: '左末端', description: '', kind: '州' },
          { type: 'Polygon', rings: [new Ring('leaf-a-r', makeSquareVertexIds('a', 0), 'territory', null)] },
          createAnchorPlacement('container', [])
        ),
      ]);
      const leafB = new Feature('leaf-b', 'Polygon', [
        new FeatureAnchor(
          'leaf-b-anchor',
          { start },
          { name: '右末端', description: '' },
          { type: 'Polygon', rings: [new Ring('leaf-b-r', makeSquareVertexIds('b', 5), 'territory', null)] },
          createAnchorPlacement('container', [])
        ),
      ]);
      const container = new Feature('container', 'Polygon', [
        new FeatureAnchor(
          'container-anchor',
          { start },
          { name: '上位領域', description: '' },
          undefined,
          createAnchorPlacement(null, ['leaf-a', 'leaf-b'])
        ),
      ]);
      addFeature.restore(
        new Map([['container', container], ['leaf-a', leafA], ['leaf-b', leafB]]),
        vertices
      );
    }

    function buildSiblingMergeCommand(): MergeFeatureCommand {
      return buildMergeCommand(['leaf-a', 'leaf-b']);
    }

    function getContainerChildIds(at: TimePoint): readonly string[] {
      return addFeature.getFeatureById('container')!.getActiveAnchor(at)!.placement.childIds;
    }

    it('親の childIds を結合時刻で錨分割し、以前は元リーフ・以降は結果地物を列挙する', () => {
      setupSiblingsUnderContainer();
      const cmd = buildSiblingMergeCommand();
      cmd.execute();
      const mergedId = cmd.mergedFeatureId!;

      // 結合時刻以前: 元リーフが子のまま（歴史を保持）
      expect(getContainerChildIds(beforeMerge)).toEqual(['leaf-a', 'leaf-b']);
      // 結合時刻以降: 結果地物のみ
      expect(getContainerChildIds(time)).toEqual([mergedId]);

      // 結果地物は同じ親へ所属する（同一上位領域の暫定制約により一意）
      const merged = addFeature.getFeatureById(mergedId)!.getActiveAnchor(time)!;
      expect(merged.placement.parentId).toBe('container');
      // 属性（種別ラベル含む）は最初の対象から継承する
      expect(merged.property.name).toBe('左末端');
      expect(merged.property.kind).toBe('州');

      // 元リーフは存在終了（消滅ではない）
      expect(addFeature.getFeatureById('leaf-a')!.getActiveAnchor(time)).toBeUndefined();
      expect(addFeature.getFeatureById('leaf-a')!.getActiveAnchor(beforeMerge)).toBeDefined();

      expectNoDanglingReferences();
    });

    it('結合後の状態は保存→再ロードの検証を通過する（§6.4.15: 保存できるが開けないファイルを作らない）', () => {
      setupSiblingsUnderContainer();
      const cmd = buildSiblingMergeCommand();
      cmd.execute();

      // deserialize はロード時検証（参照整合・時間カバレッジ・リーフ排他・親≡子の和）を全て実行する
      expect(() => deserialize(serialize(buildWorld()))).not.toThrow();
    });

    it('元リーフの歴史錨が参照する頂点は削除されない', () => {
      setupSiblingsUnderContainer();
      buildSiblingMergeCommand().execute();

      // 元リーフは past〜結合時刻の歴史を保持するため、その形状頂点は使用中のまま
      for (const vertexId of ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3']) {
        expect(addFeature.getVertices().has(vertexId)).toBe(true);
      }
    });

    it('結合時刻ちょうどに開始していた元リーフは消滅し、未使用頂点を削除する（Undoで復元）', () => {
      setupSiblingsUnderContainer(time);
      const cmd = buildSiblingMergeCommand();
      cmd.execute();

      // 存在期間が空になった元リーフは地物ごと消滅し、頂点もクリーンアップされる
      expect(addFeature.getFeatureById('leaf-a')).toBeUndefined();
      expect(addFeature.getFeatureById('leaf-b')).toBeUndefined();
      expect(addFeature.getVertices().has('a0')).toBe(false);
      expect(addFeature.getVertices().has('b0')).toBe(false);
      expect(getContainerChildIds(time)).toEqual([cmd.mergedFeatureId!]);
      expectNoDanglingReferences();

      cmd.undo();
      expect(addFeature.getFeatureById('leaf-b')).toBeDefined();
      expect(addFeature.getVertices().has('a0')).toBe(true);
      expect(addFeature.getVertices().has('b0')).toBe(true);
    });

    it('Undoで親の childIds と元リーフの錨を復元する', () => {
      setupSiblingsUnderContainer();
      const leafAAnchorsBefore = addFeature.getFeatureById('leaf-a')!.anchors;
      const cmd = buildSiblingMergeCommand();
      cmd.execute();
      cmd.undo();

      expect(addFeature.getFeatureById('leaf-a')!.anchors).toEqual(leafAAnchorsBefore);
      expect(getContainerChildIds(time)).toEqual(['leaf-a', 'leaf-b']);
      expect(addFeature.getFeatureById(cmd.mergedFeatureId!)).toBeUndefined();
    });

    it('Redoで結合後状態（childIds 同期込み）を同一IDで復元する', () => {
      setupSiblingsUnderContainer();
      const cmd = buildSiblingMergeCommand();
      cmd.execute();
      const mergedId = cmd.mergedFeatureId!;
      const mergedVertexIds = getPolygonVertexIds(mergedId, time);

      cmd.undo();
      cmd.execute();

      expect(getContainerChildIds(time)).toEqual([mergedId]);
      // 生成 ID の固定（§6.4.12）: redo は afterState 復元で地物・頂点IDを採番し直さない
      expect(getPolygonVertexIds(mergedId, time)).toEqual(mergedVertexIds);
    });

    it('execute/undo/redoで親も含む対称イベントを発火する（厳密一致）', () => {
      setupSiblingsUnderContainer();

      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
        events.push(`added:${featureId}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
        events.push(`removed:${featureId}`);
      });

      try {
        const cmd = buildSiblingMergeCommand();
        undoRedo.execute(cmd);
        const mergedId = cmd.mergedFeatureId!;
        // 元リーフは存在終了（錨変更 = added 通知）、結果地物は新規 added、親は childIds 変更
        expect([...events].sort()).toEqual(
          [`added:${mergedId}`, 'added:leaf-a', 'added:leaf-b', 'added:container'].sort()
        );

        events.length = 0;
        undoRedo.undo();
        expect([...events].sort()).toEqual(
          [`removed:${mergedId}`, 'added:leaf-a', 'added:leaf-b', 'added:container'].sort()
        );

        events.length = 0;
        undoRedo.redo();
        expect([...events].sort()).toEqual(
          [`added:${mergedId}`, 'added:leaf-a', 'added:leaf-b', 'added:container'].sort()
        );
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });

    it('異なる上位領域に属する地物の結合を拒否し、状態を変異させない', () => {
      setupSiblingsUnderContainer();
      // container の子 leaf-a と、最上位の独立末端地物（上位領域決定ダイアログは Phase 4-6 後続）
      const topLevel = addFeature.addPolygon(
        [new Coordinate(20, 0), new Coordinate(25, 0), new Coordinate(25, 10), new Coordinate(20, 10)],
        time
      );

      const cmd = buildMergeCommand(['leaf-a', topLevel.id]);
      expect(() => cmd.execute()).toThrow('異なる上位領域');

      expect(addFeature.getFeatureById('leaf-a')).toBeDefined();
      expect(addFeature.getFeatureById(topLevel.id)).toBeDefined();
      expect(getContainerChildIds(time)).toEqual(['leaf-a', 'leaf-b']);
    });
  });

  describe('有効期間の終端と旧親の自動消滅', () => {
    /**
     * 終端付きの末端地物を持つ fixture:
     * leaf-a [past, 2050) / leaf-b [past, 2100) / container は子の存在に合わせて
     * [past, 2050) childIds [leaf-a, leaf-b] → [2050, 2100) childIds [leaf-b] と錨分割済み。
     */
    function setupBoundedSiblings() {
      const vertices = new Map<string, Vertex>();
      const makeSquareVertexIds = (prefix: string, x0: number): string[] => {
        const coords = [
          new Coordinate(x0, 0),
          new Coordinate(x0 + 5, 0),
          new Coordinate(x0 + 5, 10),
          new Coordinate(x0, 10),
        ];
        return coords.map((coordinate, index) => {
          const id = `${prefix}${index}`;
          vertices.set(id, new Vertex(id, coordinate));
          return id;
        });
      };
      const endA = new TimePoint(2050);
      const endB = new TimePoint(2100);
      const leafA = new Feature('leaf-a', 'Polygon', [
        new FeatureAnchor(
          'leaf-a-anchor',
          { start: past, end: endA },
          { name: '左末端', description: '' },
          { type: 'Polygon', rings: [new Ring('leaf-a-r', makeSquareVertexIds('a', 0), 'territory', null)] },
          createAnchorPlacement('container', [])
        ),
      ]);
      const leafB = new Feature('leaf-b', 'Polygon', [
        new FeatureAnchor(
          'leaf-b-anchor',
          { start: past, end: endB },
          { name: '右末端', description: '' },
          { type: 'Polygon', rings: [new Ring('leaf-b-r', makeSquareVertexIds('b', 5), 'territory', null)] },
          createAnchorPlacement('container', [])
        ),
      ]);
      const container = new Feature('container', 'Polygon', [
        new FeatureAnchor(
          'container-anchor-1',
          { start: past, end: endA },
          { name: '上位領域', description: '' },
          undefined,
          createAnchorPlacement(null, ['leaf-a', 'leaf-b'])
        ),
        new FeatureAnchor(
          'container-anchor-2',
          { start: endA, end: endB },
          { name: '上位領域', description: '' },
          undefined,
          createAnchorPlacement(null, ['leaf-b'])
        ),
      ]);
      addFeature.restore(
        new Map([['container', container], ['leaf-a', leafA], ['leaf-b', leafB]]),
        vertices
      );
    }

    it('結果地物の終端は結合対象の有効錨 end の最小値になり、子を全て失った旧親区間は剪定される', () => {
      setupBoundedSiblings();
      const cmd = buildMergeCommand(['leaf-a', 'leaf-b']);
      cmd.execute();
      const mergedId = cmd.mergedFeatureId!;

      // 結果地物は [2000, 2050)（= 有効錨 end の最小値）
      const mergedAnchor = addFeature.getFeatureById(mergedId)!.getActiveAnchor(time)!;
      expect(mergedAnchor.timeRange.end?.equals(new TimePoint(2050))).toBe(true);

      // 親の childIds: 以前は元リーフ、[2000, 2050) は結果地物のみ
      const container = addFeature.getFeatureById('container')!;
      expect(container.getActiveAnchor(beforeMerge)!.placement.childIds).toEqual(['leaf-a', 'leaf-b']);
      expect(container.getActiveAnchor(time)!.placement.childIds).toEqual([mergedId]);

      // [2050, 2100) は元 leaf-b だけが子だった区間。leaf-b の存在終了により子を全て失い、
      // 旧親区間は自動的に消滅する（要件定義書 §2.1 line 349）
      expect(container.getActiveAnchor(new TimePoint(2075))).toBeUndefined();

      expectNoDanglingReferences();
      expect(() => deserialize(serialize(buildWorld()))).not.toThrow();
    });

    it('結合対象が結合時刻以降に別の親へ所属する後続錨を持つ場合も参照を掃除する', () => {
      setupBoundedSiblings();
      // leaf-a は 2050 以降、別の上位領域 container2 へ所属する後続錨を持つ
      const endA = new TimePoint(2050);
      const leafA = addFeature.getFeatureById('leaf-a')!;
      const laterAnchor = new FeatureAnchor(
        'leaf-a-anchor-later',
        { start: endA },
        { name: '左末端', description: '' },
        leafA.anchors[0].shape,
        createAnchorPlacement('container2', [])
      );
      const container2 = new Feature('container2', 'Polygon', [
        new FeatureAnchor(
          'container2-anchor',
          { start: endA },
          { name: '別上位領域', description: '' },
          undefined,
          createAnchorPlacement(null, ['leaf-a'])
        ),
      ]);
      const featuresMap = addFeature.getFeaturesMap() as Map<string, Feature>;
      featuresMap.set('leaf-a', leafA.withAnchors([...leafA.anchors, laterAnchor]));
      featuresMap.set('container2', container2);

      const cmd = buildMergeCommand(['leaf-a', 'leaf-b']);
      cmd.execute();

      // 存在終了は後続錨も破棄する。後続錨だけを子に持っていた container2 は
      // 下位領域を全て失い連鎖的に消滅する
      expect(addFeature.getFeatureById('leaf-a')!.getActiveAnchor(new TimePoint(2060))).toBeUndefined();
      expect(addFeature.getFeatureById('container2')).toBeUndefined();

      expectNoDanglingReferences();
      expect(() => deserialize(serialize(buildWorld()))).not.toThrow();
    });

    it('結合対象の破棄された後続錨が下位領域を持つ場合、その子は最上位へ昇格する', () => {
      setupBoundedSiblings();
      const endA = new TimePoint(2050);
      // leaf-a は 2050 以降、子 x を持つ移行期間ノード錨（shape + childIds）になる外部データ想定。
      // 親 ≡ 子の和を満たすため x は leaf-a と同一形状の頂点を独自に持つ。
      const vertices = addFeature.getVertices() as Map<string, Vertex>;
      const xVertexIds = [
        new Coordinate(0, 0),
        new Coordinate(5, 0),
        new Coordinate(5, 10),
        new Coordinate(0, 10),
      ].map((coordinate, index) => {
        const id = `x${index}`;
        vertices.set(id, new Vertex(id, coordinate));
        return id;
      });
      const leafA = addFeature.getFeatureById('leaf-a')!;
      const laterAnchor = new FeatureAnchor(
        'leaf-a-anchor-later',
        { start: endA },
        { name: '左末端', description: '' },
        leafA.anchors[0].shape,
        createAnchorPlacement(null, ['x'])
      );
      const x = new Feature('x', 'Polygon', [
        new FeatureAnchor(
          'x-anchor',
          { start: endA },
          { name: '子領域', description: '' },
          { type: 'Polygon', rings: [new Ring('x-r', xVertexIds, 'territory', null)] },
          createAnchorPlacement('leaf-a', [])
        ),
      ]);
      const featuresMap = addFeature.getFeaturesMap() as Map<string, Feature>;
      featuresMap.set('leaf-a', leafA.withAnchors([...leafA.anchors, laterAnchor]));
      featuresMap.set('x', x);

      const cmd = buildMergeCommand(['leaf-a', 'leaf-b']);
      cmd.execute();

      // 破棄された後続錨だけが親だった子 x は最上位へ昇格する（解体セマンティクス §6.4.17）
      const xAnchor = addFeature.getFeatureById('x')!.getActiveAnchor(new TimePoint(2060))!;
      expect(xAnchor.placement.parentId).toBeNull();
      expect(xAnchor.placement.isTopLevel).toBe(true);

      expectNoDanglingReferences();
      expect(() => deserialize(serialize(buildWorld()))).not.toThrow();
    });
  });

  describe('移行期間ノード親（shape あり + childIds 非空）配下の結合', () => {
    it('結合後も親 ≡ 子の和（厳密一致）を維持する（現状.md Phase 4-6 検証義務の実証）', () => {
      // 親 mid は子 2 つの和とちょうど一致する形状を保持する移行期間ノード（外部データ想定）
      const vertices = new Map<string, Vertex>();
      const addSquare = (prefix: string, x0: number, x1: number): string[] => {
        const coords = [
          new Coordinate(x0, 0),
          new Coordinate(x1, 0),
          new Coordinate(x1, 10),
          new Coordinate(x0, 10),
        ];
        return coords.map((coordinate, index) => {
          const id = `${prefix}${index}`;
          vertices.set(id, new Vertex(id, coordinate));
          return id;
        });
      };
      const mid = new Feature('mid', 'Polygon', [
        new FeatureAnchor(
          'mid-anchor',
          { start: past },
          { name: '移行期間親', description: '' },
          { type: 'Polygon', rings: [new Ring('mid-r', addSquare('m', 0, 10), 'territory', null)] },
          createAnchorPlacement(null, ['leaf-a', 'leaf-b'])
        ),
      ]);
      const leafA = new Feature('leaf-a', 'Polygon', [
        new FeatureAnchor(
          'leaf-a-anchor',
          { start: past },
          { name: '左', description: '' },
          { type: 'Polygon', rings: [new Ring('leaf-a-r', addSquare('a', 0, 5), 'territory', null)] },
          createAnchorPlacement('mid', [])
        ),
      ]);
      const leafB = new Feature('leaf-b', 'Polygon', [
        new FeatureAnchor(
          'leaf-b-anchor',
          { start: past },
          { name: '右', description: '' },
          { type: 'Polygon', rings: [new Ring('leaf-b-r', addSquare('b', 5, 10), 'territory', null)] },
          createAnchorPlacement('mid', [])
        ),
      ]);
      addFeature.restore(
        new Map([['mid', mid], ['leaf-a', leafA], ['leaf-b', leafB]]),
        vertices
      );

      // fixture 自体が検証を通過すること（前提確認）
      expect(validateParentChildUnion(buildWorld())).toEqual([]);

      const cmd = buildMergeCommand(['leaf-a', 'leaf-b']);
      cmd.execute();

      // 結合後: mid の子は結果地物のみ（形状 = leaf-a ∪ leaf-b = mid の保持形状）となり、
      // 全時間スライスで親 ≡ 子の和が維持される
      expect(validateParentChildUnion(buildWorld())).toEqual([]);
      expect(() => deserialize(serialize(buildWorld()))).not.toThrow();
    });
  });

  function getPolygonVertexIds(featureId: string, at: TimePoint): readonly string[] {
    const shape = addFeature.getFeatureById(featureId)?.getActiveAnchor(at)?.shape;
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
