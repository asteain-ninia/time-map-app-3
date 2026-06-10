import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureCommand, type AddFeatureParams } from '@application/commands/AddFeatureCommand';
import { MoveFeatureCommand } from '@application/commands/MoveFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
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
  let reassignParent: ReassignFeatureParentUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(1000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    reassignParent = new ReassignFeatureParentUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  function createCommand(params: AddFeatureParams): AddFeatureCommand {
    return new AddFeatureCommand(addFeature, params, reassignParent);
  }

  describe('点情報の追加', () => {
    it('executeで点が追加される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
      });

      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('undoで点と頂点が除去される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
      });
      undoRedo.execute(cmd);

      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('redo で再追加される', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
      });
      undoRedo.execute(cmd);
      undoRedo.undo();

      undoRedo.redo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('redoで初回追加IDを復元し後続の地物移動を再実行できる', () => {
      const addCommand = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
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

    it('undoでfeature:removed、redoでfeature:addedを対称に発火する', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
      });
      undoRedo.execute(cmd);
      const featureId = addFeature.getFeatures()[0].id;

      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId: id }) => {
        events.push(`added:${id}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId: id }) => {
        events.push(`removed:${id}`);
      });

      try {
        undoRedo.undo();
        expect(events).toEqual([`removed:${featureId}`]);

        events.length = 0;
        undoRedo.redo();
        expect(events).toEqual([`added:${featureId}`]);
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });
  });

  describe('線情報の追加', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 20)];

    it('executeで線が追加される', () => {
      const cmd = createCommand({
        type: 'line', coords, time,
      });
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Line');
      expect(addFeature.getVertices().size).toBe(3);
    });

    it('undoで線と全頂点が除去される', () => {
      const cmd = createCommand({
        type: 'line', coords, time,
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
        type: 'polygon', coords, time,
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
        type: 'polygon', coords, time,
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
        type: 'polygon', coords: bowTie, time,
      });

      expect(() => undoRedo.execute(cmd)).toThrow('自己交差');
      expect(addFeature.getFeatures()).toHaveLength(0);
    });

    it('既存ポリゴンと重なる面は追加を拒否する', () => {
      addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
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
        { parentId: null, childIds: [], isTopLevel: true }
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
        time,
        parentId: parent.id,
      });

      undoRedo.execute(cmd);

      // リーフ親が子を獲得して集約地物化し、離れた子のため旧形状全体が直轄領になる
      // （要件定義書 §2.1 line 225-227）。直轄領は名称末尾「直轄領」で識別する。
      const parentAnchor = addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)!;
      expect(parentAnchor.shape).toBeUndefined();
      expect(parentAnchor.placement.childIds).toHaveLength(2);
      const directId = parentAnchor.placement.childIds.find((id) =>
        addFeature.getFeatureById(id)!.getActiveAnchor(time)!.property.name.endsWith('直轄領')
      )!;
      const childId = parentAnchor.placement.childIds.find((id) => id !== directId)!;
      expect(addFeature.getFeatureById(childId)!.getActiveAnchor(time)?.placement.parentId).toBe(parent.id);
      expect(addFeature.getFeatureById(directId)!.getActiveAnchor(time)?.placement.parentId).toBe(parent.id);

      // Undo: 子・直轄領ともに消滅し、親は末端地物（shape あり）へ戻る
      undoRedo.undo();
      expect(addFeature.getFeatureById(childId)).toBeUndefined();
      expect(addFeature.getFeatureById(directId)).toBeUndefined();
      const undoneParent = addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)!;
      expect(undoneParent.placement.childIds).toEqual([]);
      expect(undoneParent.shape?.type).toBe('Polygon');

      // Redo: 子・直轄領を復元し、親は再び集約地物化する
      undoRedo.redo();
      expect(addFeature.getFeatureById(childId)?.getActiveAnchor(time)?.placement.parentId).toBe(parent.id);
      expect(addFeature.getFeatureById(directId)).toBeDefined();
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)?.placement.childIds.slice().sort())
        .toEqual([childId, directId].sort());
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
        time: childTime,
        parentId: parent.id,
      });

      undoRedo.execute(cmd);

      // 親錨は childTime で分割され、[parentTime, childTime) は末端のまま、
      // [childTime, ∞) は集約地物化して子＋直轄領を持つ（要件定義書 §2.1 line 225-227）。
      const parentAnchorIds = addFeature.getFeatureById(parent.id)!.anchors.map((anchor) => anchor.id);
      expect(parentAnchorIds).toHaveLength(2);
      const childIdsAfter = addFeature.getFeatureById(parent.id)!.getActiveAnchor(childTime)!.placement.childIds;
      expect(childIdsAfter).toHaveLength(2);
      const directId = childIdsAfter.find((id) =>
        addFeature.getFeatureById(id)!.getActiveAnchor(childTime)!.property.name.endsWith('直轄領')
      )!;
      const childId = childIdsAfter.find((id) => id !== directId)!;

      undoRedo.undo();
      expect(addFeature.getFeatureById(parent.id)!.anchors).toHaveLength(1);
      expect(addFeature.getFeatureById(childId)).toBeUndefined();
      expect(addFeature.getFeatureById(directId)).toBeUndefined();

      undoRedo.redo();
      expect(addFeature.getFeatureById(childId)?.getActiveAnchor(childTime)?.placement.parentId).toBe(parent.id);
      // redo は初回 execute 時の錨IDをスナップショット復元する（§6.4.12）
      expect(addFeature.getFeatureById(parent.id)!.anchors.map((anchor) => anchor.id)).toEqual(parentAnchorIds);
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(childTime)?.placement.childIds.slice().sort())
        .toEqual([childId, directId].sort());
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

    it('parentId指定で親リーフ内部に子を描けて、親が集約地物化し直轄領が生成される', () => {
      // 親（末端地物）= 10×10。Issue 2 回帰: 旧実装は親自身を末端排他障害物として
      // 親内部の子追加をコマンド入口で拒否していた。
      const parent = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 0),
          new Coordinate(10, 10),
          new Coordinate(0, 10),
        ],
        time,
        '親地物'
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(2, 2),
          new Coordinate(6, 2),
          new Coordinate(6, 6),
          new Coordinate(2, 6),
        ],
        time,
        parentId: parent.id,
      });

      expect(() => undoRedo.execute(cmd)).not.toThrow();

      // 親は集約地物化（shape 破棄）し、子 + 直轄領を下位領域に持つ
      const parentAnchor = addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)!;
      expect(parentAnchor.shape).toBeUndefined();
      expect(parentAnchor.placement.childIds).toHaveLength(2);
      const directId = parentAnchor.placement.childIds.find((id) =>
        addFeature.getFeatureById(id)!.getActiveAnchor(time)!.property.name.endsWith('直轄領')
      )!;
      expect(directId).toBeDefined();
      // 直轄領 = 親 − 子 は穴あき（子が親内部）
      const dShape = addFeature.getFeatureById(directId)!.getActiveAnchor(time)!.shape;
      if (dShape?.type === 'Polygon') {
        expect(dShape.rings.filter((r) => r.ringType === 'hole')).toHaveLength(1);
      }

      // Undo で子・直轄領が消え、親が末端地物へ戻る
      undoRedo.undo();
      expect(addFeature.getFeatureById(directId)).toBeUndefined();
      expect(addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)?.shape?.type).toBe('Polygon');
    });

    it('parentId指定のundo/redoで直轄領・変更済み親を含む全変更地物へ対称にイベントを発火する', () => {
      const parent = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 0),
          new Coordinate(10, 10),
          new Coordinate(0, 10),
        ],
        time,
        '親地物'
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(2, 2),
          new Coordinate(6, 2),
          new Coordinate(6, 6),
          new Coordinate(2, 6),
        ],
        time,
        parentId: parent.id,
      });
      undoRedo.execute(cmd);

      const parentAnchor = addFeature.getFeatureById(parent.id)!.getActiveAnchor(time)!;
      const directId = parentAnchor.placement.childIds.find((id) =>
        addFeature.getFeatureById(id)!.getActiveAnchor(time)!.property.name.endsWith('直轄領')
      )!;
      const childId = parentAnchor.placement.childIds.find((id) => id !== directId)!;

      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
        events.push(`added:${featureId}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
        events.push(`removed:${featureId}`);
      });

      try {
        // undo: 子・直轄領の削除は feature:removed、復元される変更済み親は feature:added（過不足なく）
        undoRedo.undo();
        expect([...events].sort()).toEqual(
          [`removed:${childId}`, `removed:${directId}`, `added:${parent.id}`].sort()
        );

        // redo: 子・直轄領の再追加と集約地物化した親の復元はすべて feature:added（過不足なく）
        events.length = 0;
        undoRedo.redo();
        expect([...events].sort()).toEqual(
          [`added:${childId}`, `added:${directId}`, `added:${parent.id}`].sort()
        );
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });

    it('parentId指定でも親以外の末端地物と重なる子は引き続き拒否する', () => {
      const parent = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(4, 0),
          new Coordinate(4, 4),
          new Coordinate(0, 4),
        ],
        time,
        '親地物'
      );
      // 兄弟末端地物（親の外）。子がこれと重なる場合は親を除外しても拒否されるべき。
      addFeature.addPolygon(
        [
          new Coordinate(6, 6),
          new Coordinate(10, 6),
          new Coordinate(10, 10),
          new Coordinate(6, 10),
        ],
        time,
        '兄弟地物'
      );

      const cmd = createCommand({
        type: 'polygon',
        coords: [
          new Coordinate(5, 5),
          new Coordinate(9, 5),
          new Coordinate(9, 9),
          new Coordinate(5, 9),
        ],
        time,
        parentId: parent.id,
      });

      expect(() => undoRedo.execute(cmd)).toThrow('重なっています');
      // 拒否時は新地物を残さない
      expect(addFeature.getFeatures()).toHaveLength(2);
    });
  });

  describe('descriptionの生成', () => {
    it('点コマンドの説明', () => {
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(0, 0), time,
      });
      expect(cmd.description).toBe('点情報を追加');
    });

    it('線コマンドの説明', () => {
      const cmd = createCommand({
        type: 'line', coords: [new Coordinate(0, 0), new Coordinate(1, 1)], time,
      });
      expect(cmd.description).toBe('線情報を追加');
    });

    it('面コマンドの説明', () => {
      const cmd = createCommand({
        type: 'polygon', coords: [new Coordinate(0, 0), new Coordinate(1, 0), new Coordinate(1, 1)], time,
      });
      expect(cmd.description).toBe('面情報を追加');
    });
  });

  describe('既存地物への影響なし', () => {
    it('undo時に他の地物は影響を受けない', () => {
      // 先に地物を1つ追加
      addFeature.addPoint(new Coordinate(50, 50), time);

      // コマンドで2つ目を追加
      const cmd = createCommand({
        type: 'point', coord: new Coordinate(10, 20), time,
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
