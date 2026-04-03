import { beforeEach, describe, expect, it } from 'vitest';
import { MoveVerticesCommand } from '@application/commands/MoveVerticesCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';

describe('MoveVerticesCommand', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  let undoRedo: UndoRedoManager;

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  it('executeで複数頂点が同じ移動量で移動する', () => {
    const pointA = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const pointB = addFeature.addPoint(new Coordinate(30, 40), 'l1', new TimePoint(1000));
    const vertexIdA = pointA.anchors[0].shape.type === 'Point' ? pointA.anchors[0].shape.vertexId : '';
    const vertexIdB = pointB.anchors[0].shape.type === 'Point' ? pointB.anchors[0].shape.vertexId : '';

    const cmd = new MoveVerticesCommand(
      vertexEdit,
      addFeature,
      [vertexIdA, vertexIdB],
      5,
      -3
    );
    undoRedo.execute(cmd);

    expect(addFeature.getVertices().get(vertexIdA)!.coordinate).toEqual(new Coordinate(15, 17));
    expect(addFeature.getVertices().get(vertexIdB)!.coordinate).toEqual(new Coordinate(35, 37));
  });

  it('複数頂点移動でも180度を超える経度を保持する', () => {
    const pointA = addFeature.addPoint(new Coordinate(170, 20), 'l1', new TimePoint(1000));
    const pointB = addFeature.addPoint(new Coordinate(175, 40), 'l1', new TimePoint(1000));
    const vertexIdA = pointA.anchors[0].shape.type === 'Point' ? pointA.anchors[0].shape.vertexId : '';
    const vertexIdB = pointB.anchors[0].shape.type === 'Point' ? pointB.anchors[0].shape.vertexId : '';

    undoRedo.execute(
      new MoveVerticesCommand(
        vertexEdit,
        addFeature,
        [vertexIdA, vertexIdB],
        20,
        0
      )
    );

    expect(addFeature.getVertices().get(vertexIdA)!.x).toBe(190);
    expect(addFeature.getVertices().get(vertexIdB)!.x).toBe(195);
  });

  it('undoで全頂点を元座標に戻す', () => {
    const pointA = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const pointB = addFeature.addPoint(new Coordinate(30, 40), 'l1', new TimePoint(1000));
    const vertexIdA = pointA.anchors[0].shape.type === 'Point' ? pointA.anchors[0].shape.vertexId : '';
    const vertexIdB = pointB.anchors[0].shape.type === 'Point' ? pointB.anchors[0].shape.vertexId : '';

    undoRedo.execute(
      new MoveVerticesCommand(
        vertexEdit,
        addFeature,
        [vertexIdA, vertexIdB],
        5,
        -3
      )
    );
    undoRedo.undo();

    expect(addFeature.getVertices().get(vertexIdA)!.coordinate).toEqual(new Coordinate(10, 20));
    expect(addFeature.getVertices().get(vertexIdB)!.coordinate).toEqual(new Coordinate(30, 40));
  });

  it('共有頂点グループを含む複数頂点移動では代表座標も更新する', () => {
    const pointA = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const pointB = addFeature.addPoint(new Coordinate(30, 40), 'l1', new TimePoint(1000));
    const pointC = addFeature.addPoint(new Coordinate(10, 20), 'l1', new TimePoint(1000));
    const vertexIdA = pointA.anchors[0].shape.type === 'Point' ? pointA.anchors[0].shape.vertexId : '';
    const vertexIdB = pointB.anchors[0].shape.type === 'Point' ? pointB.anchors[0].shape.vertexId : '';
    const vertexIdC = pointC.anchors[0].shape.type === 'Point' ? pointC.anchors[0].shape.vertexId : '';
    const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    sharedGroups.set(
      'sg-1',
      new SharedVertexGroup('sg-1', [vertexIdA, vertexIdC], new Coordinate(10, 20))
    );

    undoRedo.execute(
      new MoveVerticesCommand(
        vertexEdit,
        addFeature,
        [vertexIdA, vertexIdB, vertexIdC],
        8,
        2
      )
    );

    expect(addFeature.getVertices().get(vertexIdA)!.coordinate).toEqual(new Coordinate(18, 22));
    expect(addFeature.getVertices().get(vertexIdB)!.coordinate).toEqual(new Coordinate(38, 42));
    expect(addFeature.getVertices().get(vertexIdC)!.coordinate).toEqual(new Coordinate(18, 22));
    expect(sharedGroups.get('sg-1')!.representativeCoordinate).toEqual(new Coordinate(18, 22));
  });

  it('同一レイヤーの面重複を生む複数頂点移動は拒否する', () => {
    const time = new TimePoint(1000);
    const polygonA = addFeature.addPolygon(
      [
        new Coordinate(0, 0),
        new Coordinate(10, 0),
        new Coordinate(10, 10),
        new Coordinate(0, 10),
      ],
      'l1',
      time
    );
    addFeature.addPolygon(
      [
        new Coordinate(20, 0),
        new Coordinate(30, 0),
        new Coordinate(30, 10),
        new Coordinate(20, 10),
      ],
      'l1',
      time
    );

    const anchorA = polygonA.getActiveAnchor(time)!;
    const movedVertexIds =
      anchorA.shape.type === 'Polygon'
        ? [anchorA.shape.rings[0].vertexIds[1], anchorA.shape.rings[0].vertexIds[2]]
        : [];

    const cmd = new MoveVerticesCommand(
      vertexEdit,
      addFeature,
      movedVertexIds,
      15,
      0,
      time
    );

    expect(() => undoRedo.execute(cmd)).toThrow('重なっています');
    expect(addFeature.getVertices().get(movedVertexIds[0])!.coordinate).toEqual(new Coordinate(10, 0));
    expect(addFeature.getVertices().get(movedVertexIds[1])!.coordinate).toEqual(new Coordinate(10, 10));
  });
});
