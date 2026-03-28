import { describe, it, expect, beforeEach } from 'vitest';
import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';

describe('MoveVertexCommand', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  let undoRedo: UndoRedoManager;
  let vertexId: string;

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
    undoRedo = new UndoRedoManager();

    // 点を追加して頂点IDを取得
    const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const anchor = feature.anchors[0];
    if (anchor.shape.type === 'Point') {
      vertexId = anchor.shape.vertexId;
    }
  });

  it('executeで頂点が移動する', () => {
    const cmd = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    undoRedo.execute(cmd);

    const v = addFeature.getVertices().get(vertexId)!;
    expect(v.x).toBe(30);
    expect(v.y).toBe(40);
  });

  it('undoで元座標に戻る', () => {
    const cmd = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    undoRedo.execute(cmd);
    undoRedo.undo();

    const v = addFeature.getVertices().get(vertexId)!;
    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
  });

  it('redoで再度移動する', () => {
    const cmd = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    undoRedo.execute(cmd);
    undoRedo.undo();
    undoRedo.redo();

    const v = addFeature.getVertices().get(vertexId)!;
    expect(v.x).toBe(30);
    expect(v.y).toBe(40);
  });

  it('descriptionが正しい', () => {
    const cmd = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    expect(cmd.description).toBe('頂点を移動');
  });

  it('連続移動のundo/redoが正しく動作する', () => {
    const cmd1 = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    const cmd2 = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(50, 60));

    undoRedo.execute(cmd1);
    undoRedo.execute(cmd2);

    expect(addFeature.getVertices().get(vertexId)!.x).toBe(50);

    undoRedo.undo(); // cmd2をundo → (30, 40)
    expect(addFeature.getVertices().get(vertexId)!.x).toBe(30);

    undoRedo.undo(); // cmd1をundo → (10, 20)
    expect(addFeature.getVertices().get(vertexId)!.x).toBe(10);

    undoRedo.redo(); // cmd1をredo → (30, 40)
    expect(addFeature.getVertices().get(vertexId)!.x).toBe(30);
  });

  it('共有頂点グループに属する頂点を移動すると関連頂点も連動する', () => {
    const other = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const otherVertexId =
      other.anchors[0].shape.type === 'Point' ? other.anchors[0].shape.vertexId : '';
    const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    sharedGroups.set(
      'sg-1',
      new SharedVertexGroup('sg-1', [vertexId, otherVertexId], new Coordinate(10, 20))
    );

    const cmd = new MoveVertexCommand(vertexEdit, addFeature, vertexId, new Coordinate(30, 40));
    undoRedo.execute(cmd);

    expect(addFeature.getVertices().get(vertexId)!.coordinate).toEqual(new Coordinate(30, 40));
    expect(addFeature.getVertices().get(otherVertexId)!.coordinate).toEqual(new Coordinate(30, 40));
    expect(sharedGroups.get('sg-1')!.representativeCoordinate).toEqual(new Coordinate(30, 40));

    undoRedo.undo();

    expect(addFeature.getVertices().get(vertexId)!.coordinate).toEqual(new Coordinate(10, 20));
    expect(addFeature.getVertices().get(otherVertexId)!.coordinate).toEqual(new Coordinate(10, 20));
    expect(sharedGroups.get('sg-1')!.representativeCoordinate).toEqual(new Coordinate(10, 20));
  });

  it('mergeTargetVertexIdを指定するとドロップ時に共有頂点化する', () => {
    const target = addFeature.addPoint(new Coordinate(50, 60), 'l1', new TimePoint(1000));
    const targetVertexId =
      target.anchors[0].shape.type === 'Point' ? target.anchors[0].shape.vertexId : '';

    const cmd = new MoveVertexCommand(
      vertexEdit,
      addFeature,
      vertexId,
      new Coordinate(49, 59),
      targetVertexId
    );
    undoRedo.execute(cmd);

    const sharedGroups = addFeature.getSharedVertexGroups();
    expect(sharedGroups.size).toBe(1);
    const group = [...sharedGroups.values()][0];
    expect(group.vertexIds).toEqual([vertexId, targetVertexId]);
    expect(addFeature.getVertices().get(vertexId)!.coordinate).toEqual(new Coordinate(50, 60));
    expect(addFeature.getVertices().get(targetVertexId)!.coordinate).toEqual(new Coordinate(50, 60));

    undoRedo.undo();

    expect(addFeature.getSharedVertexGroups().size).toBe(0);
    expect(addFeature.getVertices().get(vertexId)!.coordinate).toEqual(new Coordinate(10, 20));
    expect(addFeature.getVertices().get(targetVertexId)!.coordinate).toEqual(new Coordinate(50, 60));
  });

  it('同一地物内の別頂点には共有頂点化しない', () => {
    const line = addFeature.addLine(
      [new Coordinate(10, 20), new Coordinate(50, 60)],
      'l1',
      new TimePoint(1000)
    );
    const lineAnchor = line.anchors[0];
    const lineVertexIds =
      lineAnchor.shape.type === 'LineString' ? [...lineAnchor.shape.vertexIds] : [];

    const cmd = new MoveVertexCommand(
      vertexEdit,
      addFeature,
      lineVertexIds[0],
      new Coordinate(49, 59),
      lineVertexIds[1]
    );
    undoRedo.execute(cmd);

    expect(addFeature.getSharedVertexGroups().size).toBe(0);
    expect(addFeature.getVertices().get(lineVertexIds[0])!.coordinate).toEqual(new Coordinate(49, 59));
    expect(addFeature.getVertices().get(lineVertexIds[1])!.coordinate).toEqual(new Coordinate(50, 60));

    undoRedo.undo();

    expect(addFeature.getVertices().get(lineVertexIds[0])!.coordinate).toEqual(new Coordinate(10, 20));
    expect(addFeature.getVertices().get(lineVertexIds[1])!.coordinate).toEqual(new Coordinate(50, 60));
  });

  it('同一地物の隣接頂点は同じ共有先頂点に共有頂点化できない', () => {
    const time = new TimePoint(1000);
    const line = addFeature.addLine(
      [new Coordinate(10, 20), new Coordinate(30, 40), new Coordinate(50, 60)],
      'l1',
      time
    );
    const target = addFeature.addPoint(new Coordinate(100, 80), 'l1', time);

    const lineAnchor = line.anchors[0];
    const lineVertexIds =
      lineAnchor.shape.type === 'LineString' ? [...lineAnchor.shape.vertexIds] : [];
    const targetVertexId =
      target.anchors[0].shape.type === 'Point' ? target.anchors[0].shape.vertexId : '';

    undoRedo.execute(
      new MoveVertexCommand(
        vertexEdit,
        addFeature,
        lineVertexIds[0],
        new Coordinate(99, 79),
        targetVertexId,
        time
      )
    );

    expect(addFeature.getSharedVertexGroups().size).toBe(1);
    expect(addFeature.getVertices().get(lineVertexIds[0])!.coordinate).toEqual(new Coordinate(100, 80));

    undoRedo.execute(
      new MoveVertexCommand(
        vertexEdit,
        addFeature,
        lineVertexIds[1],
        new Coordinate(99, 79),
        targetVertexId,
        time
      )
    );

    expect(addFeature.getSharedVertexGroups().size).toBe(1);
    expect(addFeature.getVertices().get(lineVertexIds[1])!.coordinate).toEqual(new Coordinate(99, 79));
    const group = [...addFeature.getSharedVertexGroups().values()][0];
    expect(group.vertexIds).toEqual([lineVertexIds[0], targetVertexId]);
  });
});
