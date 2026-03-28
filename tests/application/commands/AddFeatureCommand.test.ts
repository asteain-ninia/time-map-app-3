import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureCommand } from '@application/commands/AddFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('AddFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let manageLayers: ManageLayersUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(1000);
  const layerId = 'l1';

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    manageLayers = new ManageLayersUseCase();
    manageLayers.addLayer(layerId, 'テスト');
    undoRedo = new UndoRedoManager();
  });

  describe('点情報の追加', () => {
    it('executeで点が追加される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });

      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('undoで点と頂点が除去される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(cmd);

      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('redo で再追加される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(cmd);
      undoRedo.undo();

      undoRedo.redo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });
  });

  describe('線情報の追加', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 20)];

    it('executeで線が追加される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'line', coords, layerId, time,
      });
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Line');
      expect(addFeature.getVertices().size).toBe(3);
    });

    it('undoで線と全頂点が除去される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'line', coords, layerId, time,
      });
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });
  });

  describe('面情報の追加', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)];

    it('executeで面が追加される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'polygon', coords, layerId, time,
      });
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Polygon');
      expect(addFeature.getVertices().size).toBe(3);
    });

    it('undoで面と全頂点が除去される', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'polygon', coords, layerId, time,
      });
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('自己交差する面は追加を拒否する', () => {
      const bowTie = [
        new Coordinate(0, 0),
        new Coordinate(10, 10),
        new Coordinate(10, 0),
        new Coordinate(0, 10),
      ];
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'polygon', coords: bowTie, layerId, time,
      });

      expect(() => undoRedo.execute(cmd)).toThrow('自己交差');
      expect(addFeature.getFeatures()).toHaveLength(0);
    });

    it('同一レイヤーの既存ポリゴンと重なる面は追加を拒否する', () => {
      addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
        layerId,
        time
      );
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'polygon',
        coords: [
          new Coordinate(5, 0),
          new Coordinate(15, 0),
          new Coordinate(15, 10),
          new Coordinate(5, 10),
        ],
        layerId,
        time,
      });

      expect(() => undoRedo.execute(cmd)).toThrow('重なっています');
      expect(addFeature.getFeatures()).toHaveLength(1);
    });
  });

  describe('descriptionの生成', () => {
    it('点コマンドの説明', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'point', coord: new Coordinate(0, 0), layerId, time,
      });
      expect(cmd.description).toBe('点情報を追加');
    });

    it('線コマンドの説明', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'line', coords: [new Coordinate(0, 0), new Coordinate(1, 1)], layerId, time,
      });
      expect(cmd.description).toBe('線情報を追加');
    });

    it('面コマンドの説明', () => {
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'polygon', coords: [new Coordinate(0, 0), new Coordinate(1, 0), new Coordinate(1, 1)], layerId, time,
      });
      expect(cmd.description).toBe('面情報を追加');
    });
  });

  describe('既存地物への影響なし', () => {
    it('undo時に他の地物は影響を受けない', () => {
      // 先に地物を1つ追加
      addFeature.addPoint(new Coordinate(50, 50), layerId, time);

      // コマンドで2つ目を追加
      const cmd = new AddFeatureCommand(addFeature, {
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(cmd);
      expect(addFeature.getFeatures()).toHaveLength(2);

      // undo で2つ目だけが消える
      undoRedo.undo();
      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });
  });
});
