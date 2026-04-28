import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureCommand, type AddFeatureParams } from '@application/commands/AddFeatureCommand';
import { MoveFeatureCommand } from '@application/commands/MoveFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { ReassignFeatureParentUseCase } from '@application/ReassignFeatureParentUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { eventBus } from '@application/EventBus';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';

describe('AddFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let manageLayers: ManageLayersUseCase;
  let reassignParent: ReassignFeatureParentUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(1000);
  const layerId = 'l1';

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    manageLayers = new ManageLayersUseCase();
    reassignParent = new ReassignFeatureParentUseCase(addFeature);
    manageLayers.addLayer(layerId, 'テスト');
    undoRedo = new UndoRedoManager();
  });

  function createCommand(params: AddFeatureParams): AddFeatureCommand {
    return new AddFeatureCommand(addFeature, params, reassignParent);
  }

  describe('点情報の追加', () => {
    it('executeで点が追加される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });

      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('undoで点と頂点が除去される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(cmd);

      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('redo で再追加される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(cmd);
      undoRedo.undo();

      undoRedo.redo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('redoで初回追加IDを復元し後続の地物移動を再実行できる', () => {
      const addCommand = createCommand({
        type: 'point', coord: new Coordinate(10, 20), layerId, time,
      });
      undoRedo.execute(addCommand);

      const addedFeatureId = addFeature.getFeatures()[0].id;
      const shape = addFeature.getFeatureById(addedFeatureId)?.getActiveAnchor(time)?.shape;
      if (shape?.type !== 'Point') {
        throw new Error('point expected');
      }
      const addedVertexId = shape.vertexId;

      undoRedo.execute(new MoveFeatureCommand(addFeature, {
        featureId: addedFeatureId,
        dx: 5,
        dy: -3,
        currentTime: time,
      }));

      undoRedo.undo();
      undoRedo.undo();
      expect(addFeature.getFeatureById(addedFeatureId)).toBeUndefined();

      undoRedo.redo();
      expect(addFeature.getFeatureById(addedFeatureId)).toBeDefined();
      expect(addFeature.getVertices().has(addedVertexId)).toBe(true);

      undoRedo.redo();
      const movedVertex = addFeature.getVertices().get(addedVertexId)!;
      expect(movedVertex.coordinate).toEqual(new Coordinate(15, 17));
    });
  });

  describe('線情報の追加', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 20)];

    it('executeで線が追加される', () => {
      const cmd = createCommand({
        type: 'line', coords, layerId, time,
      });
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Line');
      expect(addFeature.getVertices().size).toBe(3);
    });

    it('undoで線と全頂点が除去される', () => {
      const cmd = createCommand({
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
      const cmd = createCommand({
        type: 'polygon', coords, layerId, time,
      });
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Polygon');
      expect(addFeature.getVertices().size).toBe(3);
    });

    it('面スタイル指定を地物へ引き継ぐ', () => {
      const cmd = createCommand({
        type: 'polygon',
        coords,
        layerId,
        time,
        style: {
          fillColor: '#abcdef',
          selectedFillColor: '#fedcba',
          autoColor: true,
          palette: 'パステル',
        },
      });

      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()[0].anchors[0].property.style).toEqual({
        fillColor: '#abcdef',
        selectedFillColor: '#fedcba',
        autoColor: true,
        palette: 'パステル',
      });
    });

    it('undoで面と全頂点が除去される', () => {
      const cmd = createCommand({
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
      const cmd = createCommand({
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
      const cmd = createCommand({
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

    it('既存ポリゴンの穴の内部には別地物を追加できる', () => {
      const vertices = new Map<string, Vertex>([
        ['outer-1', new Vertex('outer-1', new Coordinate(0, 0))],
        ['outer-2', new Vertex('outer-2', new Coordinate(20, 0))],
        ['outer-3', new Vertex('outer-3', new Coordinate(20, 20))],
        ['outer-4', new Vertex('outer-4', new Coordinate(0, 20))],
        ['hole-1', new Vertex('hole-1', new Coordinate(5, 5))],
        ['hole-2', new Vertex('hole-2', new Coordinate(15, 5))],
        ['hole-3', new Vertex('hole-3', new Coordinate(15, 15))],
        ['hole-4', new Vertex('hole-4', new Coordinate(5, 15))],
      ]);
      const rings = [
        new Ring('outer', ['outer-1', 'outer-2', 'outer-3', 'outer-4'], 'territory', null),
        new Ring('hole', ['hole-1', 'hole-2', 'hole-3', 'hole-4'], 'hole', 'outer'),
      ];
      const anchor = new FeatureAnchor(
        'a-existing',
        { start: time },
        { name: '穴あき地物', description: '' },
        { type: 'Polygon', rings },
        { layerId, parentId: null, childIds: [], isTopLevel: true }
      );
      addFeature.restore(
        new Map([['f-existing', new Feature('f-existing', 'Polygon', [anchor])]]),
        vertices
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(11, 11),
          new Coordinate(13, 11),
          new Coordinate(13, 13),
          new Coordinate(11, 13),
        ],
        layerId,
        time,
      });

      expect(() => undoRedo.execute(cmd)).not.toThrow();
      expect(addFeature.getFeatures()).toHaveLength(2);
    });

    it('parentId指定で新規面を親の下位領域として追加しUndo/Redoで復元する', () => {
      const parent = addFeature.addPolygon(
        [
          new Coordinate(-30, -30),
          new Coordinate(-20, -30),
          new Coordinate(-20, -20),
          new Coordinate(-30, -20),
        ],
        layerId,
        time,
        '親地物'
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(30, 30),
          new Coordinate(35, 30),
          new Coordinate(35, 35),
          new Coordinate(30, 35),
        ],
        layerId,
        time,
        parentId: parent.id,
      });

      undoRedo.execute(cmd);

      const child = addFeature.getFeatures().find((feature) => feature.id !== parent.id)!;
      expect(child.getActiveAnchor(time)?.placement.parentId).toBe(parent.id);
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)?.placement.childIds).toEqual([child.id]);

      undoRedo.undo();
      expect(addFeature.getFeatureById(child.id)).toBeUndefined();
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)?.placement.childIds).toEqual([]);

      undoRedo.redo();
      expect(addFeature.getFeatureById(child.id)?.getActiveAnchor(time)?.placement.parentId).toBe(parent.id);
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)?.placement.childIds).toEqual([child.id]);
    });

    it('parentId指定が親錨を分割する場合もredoで初回の錨IDを復元する', () => {
      const parentTime = new TimePoint(1000);
      const childTime = new TimePoint(1500);
      const parent = addFeature.addPolygon(
        [
          new Coordinate(-30, -30),
          new Coordinate(-20, -30),
          new Coordinate(-20, -20),
          new Coordinate(-30, -20),
        ],
        layerId,
        parentTime,
        '親地物'
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(30, 30),
          new Coordinate(35, 30),
          new Coordinate(35, 35),
          new Coordinate(30, 35),
        ],
        layerId,
        time: childTime,
        parentId: parent.id,
      });

      undoRedo.execute(cmd);

      const child = addFeature.getFeatures().find((feature) => feature.id !== parent.id)!;
      const parentAnchorIds = addFeature.getFeatureById(parent.id)!.anchors.map((anchor) => anchor.id);
      expect(parentAnchorIds).toHaveLength(2);
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(childTime)?.placement.childIds).toEqual([child.id]);

      undoRedo.undo();
      expect(addFeature.getFeatureById(parent.id)!.anchors).toHaveLength(1);

      undoRedo.redo();
      expect(addFeature.getFeatureById(child.id)?.getActiveAnchor(childTime)?.placement.parentId).toBe(parent.id);
      expect(addFeature.getFeatureById(parent.id)!.anchors.map((anchor) => anchor.id)).toEqual(parentAnchorIds);
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(childTime)?.placement.childIds).toEqual([child.id]);
    });

    it('parentId指定が事前検証で失敗した場合は地物イベントを発火しない', () => {
      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
        events.push(`added:${featureId}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
        events.push(`removed:${featureId}`);
      });

      try {
        const cmd = createCommand({
          type: 'polygon',
          coords: [
            new Coordinate(30, 30),
            new Coordinate(35, 30),
            new Coordinate(35, 35),
            new Coordinate(30, 35),
          ],
          layerId,
          time,
          parentId: 'missing-parent',
        });

        expect(() => undoRedo.execute(cmd)).toThrow('新しい親地物 "missing-parent" が指定時刻に存在しません');
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(events).toEqual([]);
    });
  });

  describe('descriptionの生成', () => {
    it('点コマンドの説明', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(0, 0), layerId, time,
      });
      expect(cmd.description).toBe('点情報を追加');
    });

    it('線コマンドの説明', () => {
      const cmd = createCommand({
        type: 'line', coords: [new Coordinate(0, 0), new Coordinate(1, 1)], layerId, time,
      });
      expect(cmd.description).toBe('線情報を追加');
    });

    it('面コマンドの説明', () => {
      const cmd = createCommand({
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
      const cmd = createCommand({
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
