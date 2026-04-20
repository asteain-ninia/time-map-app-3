import { describe, it, expect, beforeEach } from 'vitest';
import { SplitFeatureCommand } from '@application/commands/SplitFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('SplitFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
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
});
