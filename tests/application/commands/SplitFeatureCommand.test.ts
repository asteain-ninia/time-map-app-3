import { describe, it, expect, beforeEach } from 'vitest';
import { SplitFeatureCommand } from '@application/commands/SplitFeatureCommand';
import { MoveFeatureCommand } from '@application/commands/MoveFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('SplitFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(2000);

  /**
   * 10x10の正方形ポリゴンを作成する
   * (0,0) → (10,0) → (10,10) → (0,10)
   */
  function createSquarePolygon() {
    return addFeature.addPolygon(
      [
        new Coordinate(0, 0),
        new Coordinate(10, 0),
        new Coordinate(10, 10),
        new Coordinate(0, 10),
      ],
      'l1',
      time,
      'テスト面'
    );
  }

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    undoRedo = new UndoRedoManager();
  });

  describe('二分割（開線）', () => {
    it('ポリゴンを2つの地物に分割する', () => {
      const feature = createSquarePolygon();
      const featuresBefore = addFeature.getFeatures().length;

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
        newFeatureName: '分割B',
      });
      cmd.execute();

      // 地物が1つ増えている
      expect(addFeature.getFeatures().length).toBe(featuresBefore + 1);

      // 元の地物のアンカーが更新されている（pieceA）
      const updatedFeature = addFeature.getFeatureById(feature.id)!;
      const anchor = updatedFeature.getActiveAnchor(time)!;
      expect(anchor.shape.type).toBe('Polygon');
    });

    it('Undoで元の形状に戻り、新地物が削除される', () => {
      const feature = createSquarePolygon();
      const originalAnchor = feature.getActiveAnchor(time)!;
      const originalRingCount = (originalAnchor.shape as { type: 'Polygon'; rings: readonly unknown[] }).rings.length;
      const featuresBefore = addFeature.getFeatures().length;

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();
      expect(addFeature.getFeatures().length).toBe(featuresBefore + 1);

      cmd.undo();
      expect(addFeature.getFeatures().length).toBe(featuresBefore);

      // 元の地物の形状が復元されている
      const restored = addFeature.getFeatureById(feature.id)!;
      const restoredAnchor = restored.getActiveAnchor(time)!;
      expect(restoredAnchor.shape.type).toBe('Polygon');
      const restoredRings = (restoredAnchor.shape as { type: 'Polygon'; rings: readonly unknown[] }).rings;
      expect(restoredRings.length).toBe(originalRingCount);
    });

    it('分割で追加された頂点がUndoで削除される', () => {
      const feature = createSquarePolygon();
      const verticesBefore = addFeature.getVertices().size;

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();
      const verticesAfterSplit = addFeature.getVertices().size;
      expect(verticesAfterSplit).toBeGreaterThan(verticesBefore);

      cmd.undo();
      expect(addFeature.getVertices().size).toBe(verticesBefore);
    });

    it('分割で生成された切断辺の頂点を共有頂点グループにする', () => {
      const feature = createSquarePolygon();

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();

      const groups = [...addFeature.getSharedVertexGroups().values()];
      expect(groups).toHaveLength(2);

      const sortedGroups = groups.toSorted((a, b) =>
        a.representativeCoordinate.y - b.representativeCoordinate.y
      );
      expect(sortedGroups[0].representativeCoordinate.x).toBeCloseTo(5);
      expect(sortedGroups[0].representativeCoordinate.y).toBeCloseTo(0);
      expect(sortedGroups[1].representativeCoordinate.x).toBeCloseTo(5);
      expect(sortedGroups[1].representativeCoordinate.y).toBeCloseTo(10);

      const vertices = addFeature.getVertices();
      for (const group of sortedGroups) {
        expect(group.vertexIds).toHaveLength(2);
        for (const vertexId of group.vertexIds) {
          const vertex = vertices.get(vertexId);
          expect(vertex?.coordinate.equals(group.representativeCoordinate)).toBe(true);
        }
      }
    });

    it('既存共有頂点を跨ぐ分割では共有先地物との共有グループを新頂点へ引き継ぐ', () => {
      const featureA = createSquarePolygon();
      const shapeA = featureA.getActiveAnchor(time)?.shape;
      if (shapeA?.type !== 'Polygon') {
        throw new Error('polygon expected');
      }
      const oldStartVertexId = shapeA.rings[0].vertexIds[0];
      const oldEndVertexId = shapeA.rings[0].vertexIds[2];

      const featureB = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 10),
          new Coordinate(20, 0),
        ],
        'l1',
        time,
        '共有先面'
      );
      const shapeB = featureB.getActiveAnchor(time)?.shape;
      if (shapeB?.type !== 'Polygon') {
        throw new Error('polygon expected');
      }
      const sharedStartVertexId = shapeB.rings[0].vertexIds[0];
      const sharedEndVertexId = shapeB.rings[0].vertexIds[1];

      const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
      sharedGroups.set(
        'sg-start',
        new SharedVertexGroup(
          'sg-start',
          [oldStartVertexId, sharedStartVertexId],
          new Coordinate(0, 0)
        )
      );
      sharedGroups.set(
        'sg-end',
        new SharedVertexGroup(
          'sg-end',
          [oldEndVertexId, sharedEndVertexId],
          new Coordinate(10, 10)
        )
      );

      new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: -1 }, { x: 11, y: 11 }],
        isClosed: false,
        currentTime: time,
      }).execute();

      expect(addFeature.getSharedVertexGroups().size).toBe(2);
      assertTransferredSharedGroup('sg-start', sharedStartVertexId, oldStartVertexId, new Coordinate(0, 0));
      assertTransferredSharedGroup('sg-end', sharedEndVertexId, oldEndVertexId, new Coordinate(10, 10));
    });

    it('共有辺の途中で分割される場合は共有先地物にも対応頂点を挿入する', () => {
      const { featureA, featureB } = createSharedLeftEdgeFixture();
      const originalBVertexIds = getPolygonVertexIds(featureB.id);
      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: 5 }, { x: 11, y: 5 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      const insertedBVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 5));
      expect(insertedBVertexId).not.toBeNull();
      expect(getPolygonVertexIds(featureB.id)).toContain(insertedBVertexId!);

      const sharedGroupAtCutPoint = findSharedGroupAt(new Coordinate(0, 5));
      expect(sharedGroupAtCutPoint).toBeDefined();
      expect(sharedGroupAtCutPoint?.vertexIds).toContain(insertedBVertexId!);
      expect(sharedGroupAtCutPoint?.vertexIds).toHaveLength(3);

      const splitVertexIds = sharedGroupAtCutPoint?.vertexIds.filter((vertexId) =>
        vertexId !== insertedBVertexId
      ) ?? [];
      expect(splitVertexIds.every((vertexId) =>
        getPolygonVertexIds(featureA.id).includes(vertexId) ||
        addFeature.getFeatures()
          .filter((candidate) => candidate.id !== featureA.id && candidate.id !== featureB.id)
          .some((candidate) => getPolygonVertexIds(candidate.id).includes(vertexId))
      )).toBe(true);

      undoRedo.undo();
      expect(getPolygonVertexIds(featureB.id)).toEqual(originalBVertexIds);
      expect(addFeature.getVertices().has(insertedBVertexId!)).toBe(false);

      undoRedo.redo();
      expect(findPolygonVertexIdAt(featureB.id, new Coordinate(0, 5))).toBe(insertedBVertexId);
      expect(addFeature.getSharedVertexGroups().get(sharedGroupAtCutPoint!.id)?.vertexIds)
        .toContain(insertedBVertexId!);
    });

    it('共有辺の途中に複数の切断点がある場合は共有先地物へ同順で頂点を挿入する', () => {
      const {
        featureA,
        featureB,
        bBottomSharedVertexId,
        bTopSharedVertexId,
      } = createSharedLeftEdgeFixture();
      const originalBVertexIds = getPolygonVertexIds(featureB.id);
      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [
          { x: -1, y: 2 },
          { x: 4, y: 2 },
          { x: 4, y: 8 },
          { x: -1, y: 8 },
        ],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      const lowerInsertedBVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2));
      const upperInsertedBVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 8));
      expect(lowerInsertedBVertexId).not.toBeNull();
      expect(upperInsertedBVertexId).not.toBeNull();

      const bVertexIdsAfterSplit = getPolygonVertexIds(featureB.id);
      const bottomIndex = bVertexIdsAfterSplit.indexOf(bBottomSharedVertexId);
      expect(bVertexIdsAfterSplit.slice(bottomIndex, bottomIndex + 4)).toEqual([
        bBottomSharedVertexId,
        lowerInsertedBVertexId,
        upperInsertedBVertexId,
        bTopSharedVertexId,
      ]);

      for (const coordinate of [new Coordinate(0, 2), new Coordinate(0, 8)]) {
        const insertedBVertexId = findPolygonVertexIdAt(featureB.id, coordinate);
        const sharedGroup = findSharedGroupAt(coordinate);
        expect(sharedGroup).toBeDefined();
        expect(sharedGroup?.vertexIds).toContain(insertedBVertexId!);
        expect(sharedGroup?.vertexIds).toHaveLength(3);
      }

      undoRedo.undo();
      expect(getPolygonVertexIds(featureB.id)).toEqual(originalBVertexIds);
      expect(addFeature.getVertices().has(lowerInsertedBVertexId!)).toBe(false);
      expect(addFeature.getVertices().has(upperInsertedBVertexId!)).toBe(false);

      undoRedo.redo();
      expect(findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2))).toBe(lowerInsertedBVertexId);
      expect(findPolygonVertexIdAt(featureB.id, new Coordinate(0, 8))).toBe(upperInsertedBVertexId);
    });

    it('共有辺上の既存中間頂点は切断線が通らない限り共有先地物へ挿入しない', () => {
      const {
        featureA,
        featureB,
        bBottomSharedVertexId,
        bTopSharedVertexId,
      } = createSharedLeftEdgeFixture([
        new Coordinate(0, 0),
        new Coordinate(10, 0),
        new Coordinate(10, 10),
        new Coordinate(0, 10),
        new Coordinate(0, 5),
      ]);
      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: 2 }, { x: 11, y: 2 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      const insertedCutVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2));
      expect(insertedCutVertexId).not.toBeNull();
      expect(findPolygonVertexIdAt(featureB.id, new Coordinate(0, 5))).toBeNull();
      expect(findSharedGroupAt(new Coordinate(0, 5))).toBeUndefined();

      const bVertexIdsAfterSplit = getPolygonVertexIds(featureB.id);
      const bottomIndex = bVertexIdsAfterSplit.indexOf(bBottomSharedVertexId);
      expect(bVertexIdsAfterSplit.slice(bottomIndex, bottomIndex + 3)).toEqual([
        bBottomSharedVertexId,
        insertedCutVertexId,
        bTopSharedVertexId,
      ]);
    });

    it('共有先地物Bだけが共有辺上に中間頂点を持つ場合も切断点をB側へ挿入する', () => {
      const {
        featureA,
        featureB,
        bBottomSharedVertexId,
        bTopSharedVertexId,
      } = createSharedLeftEdgeFixture({
        featureBCoordinates: [
          new Coordinate(-10, 0),
          new Coordinate(0, 0),
          new Coordinate(0, 5),
          new Coordinate(0, 10),
          new Coordinate(-10, 10),
        ],
      });
      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: 2 }, { x: 11, y: 2 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      const insertedCutVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2));
      const existingMiddleVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 5));
      expect(insertedCutVertexId).not.toBeNull();
      expect(existingMiddleVertexId).not.toBeNull();

      const bVertexIdsAfterSplit = getPolygonVertexIds(featureB.id);
      const bottomIndex = bVertexIdsAfterSplit.indexOf(bBottomSharedVertexId);
      expect(bVertexIdsAfterSplit.slice(bottomIndex, bottomIndex + 4)).toEqual([
        bBottomSharedVertexId,
        insertedCutVertexId,
        existingMiddleVertexId,
        bTopSharedVertexId,
      ]);
    });

    it('共有先地物Bに切断点と同座標の既存中間頂点がある場合はその頂点を共有する', () => {
      const {
        featureA,
        featureB,
      } = createSharedLeftEdgeFixture({
        featureBCoordinates: [
          new Coordinate(-10, 0),
          new Coordinate(0, 0),
          new Coordinate(0, 2),
          new Coordinate(0, 10),
          new Coordinate(-10, 10),
        ],
      });
      const originalBVertexIds = getPolygonVertexIds(featureB.id);
      const existingCutVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2));
      expect(existingCutVertexId).not.toBeNull();

      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: 2 }, { x: 11, y: 2 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      expect(getPolygonVertexIds(featureB.id)).toEqual(originalBVertexIds);
      const sharedGroup = findSharedGroupAt(new Coordinate(0, 2));
      expect(sharedGroup).toBeDefined();
      expect(sharedGroup?.vertexIds).toContain(existingCutVertexId!);
      expect(sharedGroup?.vertexIds).toHaveLength(3);
    });

    it('共有先地物Bの既存切断点頂点が別グループ所属の場合はそのグループへ分割側頂点を統合する', () => {
      const {
        featureA,
        featureB,
      } = createSharedLeftEdgeFixture({
        featureBCoordinates: [
          new Coordinate(-10, 0),
          new Coordinate(0, 0),
          new Coordinate(0, 2),
          new Coordinate(0, 10),
          new Coordinate(-10, 10),
        ],
      });
      const existingCutVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 2));
      if (!existingCutVertexId) {
        throw new Error('existing cut vertex expected');
      }

      const featureC = addFeature.addPoint(new Coordinate(0, 2), 'l1', time, '共有先点C');
      const shapeC = featureC.getActiveAnchor(time)?.shape;
      if (shapeC?.type !== 'Point') {
        throw new Error('point expected');
      }

      const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
      sharedGroups.set(
        'sg-bc-cut',
        new SharedVertexGroup(
          'sg-bc-cut',
          [existingCutVertexId, shapeC.vertexId],
          new Coordinate(0, 2)
        )
      );

      const command = new SplitFeatureCommand(addFeature, {
        featureId: featureA.id,
        cuttingLine: [{ x: -1, y: 2 }, { x: 11, y: 2 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(command);

      const mergedGroup = addFeature.getSharedVertexGroups().get('sg-bc-cut');
      expect(addFeature.getSharedVertexGroups().size).toBe(4);
      expect(mergedGroup).toBeDefined();
      expect(mergedGroup?.vertexIds).toContain(existingCutVertexId);
      expect(mergedGroup?.vertexIds).toContain(shapeC.vertexId);
      expect(mergedGroup?.vertexIds).toHaveLength(4);
      expect(getGroupsContainingVertex(existingCutVertexId)).toHaveLength(1);
      expect(getSharedGroupsAt(new Coordinate(0, 2))).toHaveLength(1);

      const splitVertexIds = mergedGroup?.vertexIds.filter((vertexId) =>
        vertexId !== existingCutVertexId && vertexId !== shapeC.vertexId
      ) ?? [];
      expect(splitVertexIds).toHaveLength(2);
      for (const vertexId of splitVertexIds) {
        const vertex = addFeature.getVertices().get(vertexId);
        expect(vertex?.coordinate.x).toBeCloseTo(0);
        expect(vertex?.coordinate.y).toBeCloseTo(2);
      }

      undoRedo.undo();
      expect(addFeature.getSharedVertexGroups().get('sg-bc-cut')?.vertexIds)
        .toEqual([existingCutVertexId, shapeC.vertexId]);

      undoRedo.redo();
      expect(addFeature.getSharedVertexGroups().get('sg-bc-cut')?.vertexIds)
        .toHaveLength(4);
      expect(getGroupsContainingVertex(existingCutVertexId)).toHaveLength(1);
      expect(getSharedGroupsAt(new Coordinate(0, 2))).toHaveLength(1);
    });

    it('Undoで分割時に追加された共有頂点グループだけを戻す', () => {
      const pointA = addFeature.addPoint(new Coordinate(100, 0), 'l1', time, '点A');
      const pointB = addFeature.addPoint(new Coordinate(100, 0), 'l1', time, '点B');
      const pointAShape = pointA.getActiveAnchor(time)?.shape;
      const pointBShape = pointB.getActiveAnchor(time)?.shape;
      if (pointAShape?.type !== 'Point' || pointBShape?.type !== 'Point') {
        throw new Error('point expected');
      }

      const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
      sharedGroups.set(
        'sg-existing',
        new SharedVertexGroup(
          'sg-existing',
          [pointAShape.vertexId, pointBShape.vertexId],
          new Coordinate(100, 0)
        )
      );

      const feature = createSquarePolygon();
      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();
      expect(addFeature.getSharedVertexGroups().size).toBe(3);

      cmd.undo();
      expect(addFeature.getSharedVertexGroups().size).toBe(1);
      expect(addFeature.getSharedVertexGroups().get('sg-existing')?.vertexIds)
        .toEqual([pointAShape.vertexId, pointBShape.vertexId]);
    });

    it('redoで分割時の新地物IDと頂点IDを復元し後続の地物移動を再実行できる', () => {
      const feature = createSquarePolygon();
      const splitCommand = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      undoRedo.execute(splitCommand);

      const newFeatureId = splitCommand.createdFeatureId;
      if (!newFeatureId) {
        throw new Error('split feature expected');
      }
      const vertexIdsAfterSplit = getPolygonVertexIds(newFeatureId);
      const minXAfterSplit = getMinX(newFeatureId);

      undoRedo.execute(new MoveFeatureCommand(addFeature, {
        featureId: newFeatureId,
        dx: 20,
        dy: 0,
        currentTime: time,
      }));

      undoRedo.undo();
      undoRedo.undo();
      expect(addFeature.getFeatureById(newFeatureId)).toBeUndefined();

      undoRedo.redo();
      expect(addFeature.getFeatureById(newFeatureId)).toBeDefined();
      expect(getPolygonVertexIds(newFeatureId)).toEqual(vertexIdsAfterSplit);

      undoRedo.redo();
      expect(getMinX(newFeatureId)).toBeCloseTo(minXAfterSplit + 20);
    });

    it('分割片が複数領土に分かれる場合も新地物に全領土リングを保持する', () => {
      const feature = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 0),
          new Coordinate(10, 2),
          new Coordinate(2, 2),
          new Coordinate(2, 8),
          new Coordinate(10, 8),
          new Coordinate(10, 10),
          new Coordinate(0, 10),
        ],
        'l1',
        time,
        'C字面'
      );

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();

      const newFeature = addFeature.getFeatures().find((f) => f.id !== feature.id);
      const shape = newFeature?.getActiveAnchor(time)?.shape;
      if (shape?.type !== 'Polygon') {
        throw new Error('polygon expected');
      }

      const territoryRings = shape.rings.filter((ring) => ring.ringType === 'territory');
      expect(territoryRings).toHaveLength(2);
      expect(territoryRings.every((ring) => ring.parentId === null)).toBe(true);
    });

    it('複数領土リングを持つ分割後地物を再分割しても領土を穴にしない', () => {
      const feature = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 0),
          new Coordinate(10, 2),
          new Coordinate(2, 2),
          new Coordinate(2, 8),
          new Coordinate(10, 8),
          new Coordinate(10, 10),
          new Coordinate(0, 10),
        ],
        'l1',
        time,
        'C字面'
      );

      new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      }).execute();
      const multiTerritoryFeature = addFeature.getFeatures().find((f) => f.id !== feature.id);
      if (!multiTerritoryFeature) {
        throw new Error('split feature expected');
      }

      new SplitFeatureCommand(addFeature, {
        featureId: multiTerritoryFeature.id,
        cuttingLine: [{ x: 4, y: 1 }, { x: 11, y: 1 }],
        isClosed: false,
        currentTime: time,
      }).execute();

      const reSplitFeatures = addFeature.getFeatures().filter((f) => f.id !== feature.id);
      const rings = reSplitFeatures.flatMap((f) => {
        const shape = f.getActiveAnchor(time)?.shape;
        return shape?.type === 'Polygon' ? [...shape.rings] : [];
      });
      const territoryRings = rings.filter((ring) => ring.ringType === 'territory');

      expect(reSplitFeatures).toHaveLength(2);
      expect(territoryRings).toHaveLength(3);
      expect(rings.filter((ring) => ring.ringType === 'hole')).toHaveLength(0);
      expect(territoryRings.every((ring) => ring.parentId === null)).toBe(true);
    });

    it('穴内の島を含む面を分割しても島territoryをhole配下へ再接続する', () => {
      const feature = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(20, 0),
          new Coordinate(20, 20),
          new Coordinate(0, 20),
        ],
        'l1',
        time,
        '穴内島つき面'
      );
      const anchor = feature.getActiveAnchor(time)!;
      if (anchor.shape.type !== 'Polygon') {
        throw new Error('polygon expected');
      }

      const vertices = addFeature.getVertices() as Map<string, Vertex>;
      const holeVertexIds = createVertexIds(vertices, 'hole', [
        new Coordinate(5, 5),
        new Coordinate(15, 5),
        new Coordinate(15, 15),
        new Coordinate(5, 15),
      ]);
      const islandVertexIds = createVertexIds(vertices, 'island', [
        new Coordinate(8, 8),
        new Coordinate(12, 8),
        new Coordinate(12, 12),
        new Coordinate(8, 12),
      ]);
      const outerRing = anchor.shape.rings[0];
      const holeRing = new Ring('hole-1', holeVertexIds, 'hole', outerRing.id);
      const islandRing = new Ring('island-1', islandVertexIds, 'territory', holeRing.id);
      const updatedAnchor = anchor.withShape({
        type: 'Polygon',
        rings: [outerRing, holeRing, islandRing],
      });
      const featuresMap = addFeature.getFeaturesMap() as Map<string, typeof feature>;
      featuresMap.set(
        feature.id,
        feature.withAnchors(feature.anchors.map((candidate) =>
          candidate.id === anchor.id ? updatedAnchor : candidate
        ))
      );

      new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 2, y: -1 }, { x: 2, y: 21 }],
        isClosed: false,
        currentTime: time,
      }).execute();

      const shapeWithIsland = addFeature.getFeatures()
        .map((candidate) => candidate.getActiveAnchor(time)?.shape)
        .find((shape) => {
          if (shape?.type !== 'Polygon') return false;
          const holes = shape.rings.filter((ring) => ring.ringType === 'hole');
          return holes.length === 1 && shape.rings.some((ring) =>
            ring.ringType === 'territory' && ring.parentId === holes[0].id
          );
        });
      if (shapeWithIsland?.type !== 'Polygon') {
        throw new Error('nested island shape expected');
      }

      const holes = shapeWithIsland.rings.filter((ring) => ring.ringType === 'hole');
      const islandTerritories = shapeWithIsland.rings.filter((ring) =>
        ring.ringType === 'territory' && ring.parentId !== null
      );
      expect(holes).toHaveLength(1);
      expect(islandTerritories).toHaveLength(1);
      expect(islandTerritories[0].parentId).toBe(holes[0].id);
      expect(validatePolygonRingHierarchy(shapeWithIsland.rings, addFeature.getVertices()))
        .toEqual([]);
    });
  });

  describe('閉線分割', () => {
    it('閉線でポリゴンを内側と外側に分割する', () => {
      const feature = createSquarePolygon();

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [
          { x: 3, y: 3 },
          { x: 7, y: 3 },
          { x: 7, y: 7 },
          { x: 3, y: 7 },
        ],
        isClosed: true,
        currentTime: time,
      });
      cmd.execute();

      // 2つの地物がある
      expect(addFeature.getFeatures().length).toBe(2);
    });
  });

  describe('エッジケース', () => {
    it('存在しない地物IDでは何もしない', () => {
      const featuresBefore = addFeature.getFeatures().length;

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: 'nonexistent',
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();

      expect(addFeature.getFeatures().length).toBe(featuresBefore);
    });

    it('ポリゴンを横断しない分断線では分割しない', () => {
      const feature = createSquarePolygon();
      const featuresBefore = addFeature.getFeatures().length;

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 15, y: 0 }, { x: 15, y: 10 }],
        isClosed: false,
        currentTime: time,
      });
      cmd.execute();

      // 地物は増えていない
      expect(addFeature.getFeatures().length).toBe(featuresBefore);
    });

    it('新地物にカスタム名を付けられる', () => {
      const feature = createSquarePolygon();

      const cmd = new SplitFeatureCommand(addFeature, {
        featureId: feature.id,
        cuttingLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        isClosed: false,
        currentTime: time,
        newFeatureName: '新領域',
      });
      cmd.execute();

      const allFeatures = addFeature.getFeatures();
      const newFeature = allFeatures.find(f => f.id !== feature.id);
      expect(newFeature).toBeDefined();
      const newAnchor = newFeature!.getActiveAnchor(time);
      expect(newAnchor?.property.name).toBe('新領域');
    });
  });

  function createVertexIds(
    vertices: Map<string, Vertex>,
    prefix: string,
    coords: readonly Coordinate[]
  ): string[] {
    return coords.map((coordinate, index) => {
      const id = `${prefix}-${index}`;
      vertices.set(id, new Vertex(id, coordinate));
      return id;
    });
  }

  function getPolygonVertexIds(featureId: string): readonly string[] {
    const shape = addFeature.getFeatureById(featureId)?.getActiveAnchor(time)?.shape;
    if (shape?.type !== 'Polygon') {
      return [];
    }
    return shape.rings.flatMap((ring) => [...ring.vertexIds]);
  }

  function getMinX(featureId: string): number {
    const vertices = getPolygonVertexIds(featureId)
      .map((vertexId) => addFeature.getVertices().get(vertexId))
      .filter((vertex): vertex is Vertex => vertex !== undefined);
    return Math.min(...vertices.map((vertex) => vertex.coordinate.x));
  }

  function findPolygonVertexIdAt(featureId: string, coordinate: Coordinate): string | null {
    const vertexId = getPolygonVertexIds(featureId).find((candidate) => {
      const vertex = addFeature.getVertices().get(candidate);
      return vertex?.coordinate.x === coordinate.x && vertex.coordinate.y === coordinate.y;
    });
    return vertexId ?? null;
  }

  function findSharedGroupAt(coordinate: Coordinate): SharedVertexGroup | undefined {
    return getSharedGroupsAt(coordinate)[0];
  }

  function getSharedGroupsAt(coordinate: Coordinate): SharedVertexGroup[] {
    return [...addFeature.getSharedVertexGroups().values()]
      .filter((group) =>
        group.representativeCoordinate.x === coordinate.x &&
        group.representativeCoordinate.y === coordinate.y
      );
  }

  function getGroupsContainingVertex(vertexId: string): SharedVertexGroup[] {
    return [...addFeature.getSharedVertexGroups().values()]
      .filter((group) => group.vertexIds.includes(vertexId));
  }

  function createSharedLeftEdgeFixture(
    params: readonly Coordinate[] | {
      readonly featureACoordinates?: readonly Coordinate[];
      readonly featureBCoordinates?: readonly Coordinate[];
    } = {}
  ) {
    const featureACoordinates = Array.isArray(params)
      ? params
      : params.featureACoordinates ?? [
      new Coordinate(0, 0),
      new Coordinate(10, 0),
      new Coordinate(10, 10),
      new Coordinate(0, 10),
    ];
    const featureBCoordinates = !Array.isArray(params) && params.featureBCoordinates
      ? params.featureBCoordinates
      : [
        new Coordinate(-10, 0),
        new Coordinate(0, 0),
        new Coordinate(0, 10),
        new Coordinate(-10, 10),
      ];

    const featureA = addFeature.addPolygon(
      featureACoordinates,
      'l1',
      time,
      'テスト面'
    );
    const shapeA = featureA.getActiveAnchor(time)?.shape;
    if (shapeA?.type !== 'Polygon') {
      throw new Error('polygon expected');
    }
    const oldBottomLeftVertexId = findPolygonVertexIdAt(featureA.id, new Coordinate(0, 0));
    const oldTopLeftVertexId = findPolygonVertexIdAt(featureA.id, new Coordinate(0, 10));
    if (!oldBottomLeftVertexId || !oldTopLeftVertexId) {
      throw new Error('shared source vertices expected');
    }

    const featureB = addFeature.addPolygon(
      featureBCoordinates,
      'l1',
      time,
      '左隣面'
    );
    const shapeB = featureB.getActiveAnchor(time)?.shape;
    if (shapeB?.type !== 'Polygon') {
      throw new Error('polygon expected');
    }
    const bBottomSharedVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 0));
    const bTopSharedVertexId = findPolygonVertexIdAt(featureB.id, new Coordinate(0, 10));
    if (!bBottomSharedVertexId || !bTopSharedVertexId) {
      throw new Error('shared target vertices expected');
    }

    const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    sharedGroups.set(
      'sg-bottom-left',
      new SharedVertexGroup(
        'sg-bottom-left',
        [oldBottomLeftVertexId, bBottomSharedVertexId],
        new Coordinate(0, 0)
      )
    );
    sharedGroups.set(
      'sg-top-left',
      new SharedVertexGroup(
        'sg-top-left',
        [oldTopLeftVertexId, bTopSharedVertexId],
        new Coordinate(0, 10)
      )
    );

    return {
      featureA,
      featureB,
      bBottomSharedVertexId,
      bTopSharedVertexId,
    };
  }

  function assertTransferredSharedGroup(
    groupId: string,
    externalVertexId: string,
    oldSplitFeatureVertexId: string,
    expectedCoordinate: Coordinate
  ): void {
    const group = addFeature.getSharedVertexGroups().get(groupId);
    expect(group).toBeDefined();
    expect(group?.vertexIds).toContain(externalVertexId);
    expect(group?.vertexIds).not.toContain(oldSplitFeatureVertexId);
    expect(group?.vertexIds.length).toBeGreaterThanOrEqual(3);
    expect(group?.representativeCoordinate.x).toBeCloseTo(expectedCoordinate.x);
    expect(group?.representativeCoordinate.y).toBeCloseTo(expectedCoordinate.y);

    const splitVertexIds = group?.vertexIds.filter((vertexId) => vertexId !== externalVertexId) ?? [];
    const allGroups = [...addFeature.getSharedVertexGroups().values()];
    for (const vertexId of splitVertexIds) {
      const vertex = addFeature.getVertices().get(vertexId);
      expect(vertex?.coordinate.x).toBeCloseTo(expectedCoordinate.x);
      expect(vertex?.coordinate.y).toBeCloseTo(expectedCoordinate.y);
      expect(allGroups.filter((candidate) => candidate.vertexIds.includes(vertexId))).toHaveLength(1);
    }
  }
});
