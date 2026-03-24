import { describe, it, expect, beforeEach } from 'vitest';
import { SplitFeatureCommand } from '@application/commands/SplitFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
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
});
