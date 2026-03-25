import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteFeatureCommand } from '@application/commands/DeleteFeatureCommand';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('DeleteFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let deleteFeatureUseCase: DeleteFeatureUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(1000);
  const layerId = 'l1';

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    deleteFeatureUseCase = new DeleteFeatureUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  describe('点の削除', () => {
    it('executeで点が削除される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで点と頂点が復元される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), layerId, time);
      const featureId = feature.id;

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, featureId, time);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].id).toBe(featureId);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('redo で再削除される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);
      undoRedo.undo();
      undoRedo.redo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });
  });

  describe('線の削除', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 20)];

    it('executeで線が削除される', () => {
      const feature = addFeature.addLine(coords, layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで線と全頂点が復元される', () => {
      const feature = addFeature.addLine(coords, layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Line');
      expect(addFeature.getVertices().size).toBe(3);
    });
  });

  describe('面の削除', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)];

    it('executeで面が削除される', () => {
      const feature = addFeature.addPolygon(coords, layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで面と全頂点が復元される', () => {
      const feature = addFeature.addPolygon(coords, layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id, time);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Polygon');
      expect(addFeature.getVertices().size).toBe(3);
    });
  });

  describe('存在しない地物', () => {
    it('存在しない地物IDでは何も起こらない', () => {
      addFeature.addPoint(new Coordinate(10, 20), layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, 'nonexistent', time);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
    });
  });

  describe('既存地物への影響なし', () => {
    it('削除時に他の地物は影響を受けない', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), layerId, time);
      addFeature.addPoint(new Coordinate(30, 40), layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, f1.id, time);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].id).not.toBe(f1.id);
    });

    it('undo時に他の地物は影響を受けない', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), layerId, time);
      addFeature.addPoint(new Coordinate(30, 40), layerId, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, f1.id, time);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(2);
    });
  });

  describe('descriptionの生成', () => {
    it('削除コマンドの説明', () => {
      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, 'any-id', time);
      expect(cmd.description).toBe('地物を削除');
    });
  });
});
