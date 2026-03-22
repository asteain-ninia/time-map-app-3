import { describe, it, expect, beforeEach } from 'vitest';
import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

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
});
