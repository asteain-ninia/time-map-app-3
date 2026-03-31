import { describe, it, expect, beforeEach } from 'vitest';
import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Vertex } from '@domain/entities/Vertex';
import { Ring } from '@domain/value-objects/Ring';

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

  it('同一線形内の別頂点には共有頂点化しない', () => {
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

  it('同一地物でも別リングの頂点には共有頂点化できる', () => {
    const time = new TimePoint(1000);
    const polygon = addFeature.addPolygon(
      [
        new Coordinate(0, 0),
        new Coordinate(30, 0),
        new Coordinate(30, 30),
        new Coordinate(0, 30),
      ],
      'l1',
      time
    );

    const activeAnchor = polygon.getActiveAnchor(time)!;
    if (activeAnchor.shape.type !== 'Polygon') {
      throw new Error('polygon anchor expected');
    }

    const polygonVertices = addFeature.getVertices() as Map<string, Vertex>;
    polygonVertices.set('h1', new Vertex('h1', new Coordinate(6, 6)));
    polygonVertices.set('h2', new Vertex('h2', new Coordinate(24, 6)));
    polygonVertices.set('h3', new Vertex('h3', new Coordinate(24, 24)));
    polygonVertices.set('h4', new Vertex('h4', new Coordinate(6, 24)));
    polygonVertices.set('i1', new Vertex('i1', new Coordinate(8, 8)));
    polygonVertices.set('i2', new Vertex('i2', new Coordinate(12, 8)));
    polygonVertices.set('i3', new Vertex('i3', new Coordinate(10, 12)));

    const holeRing = new Ring(
      'hole-1',
      ['h1', 'h2', 'h3', 'h4'],
      'hole',
      activeAnchor.shape.rings[0].id
    );
    const islandRing = new Ring(
      'island-1',
      ['i1', 'i2', 'i3'],
      'territory',
      holeRing.id
    );
    const updatedFeature = polygon.withAnchors([
      activeAnchor.withShape({
        type: 'Polygon',
        rings: [...activeAnchor.shape.rings, holeRing, islandRing],
      }),
    ]);
    (addFeature.getFeaturesMap() as Map<string, typeof polygon>).set(polygon.id, updatedFeature);

    undoRedo.execute(
      new MoveVertexCommand(
        vertexEdit,
        addFeature,
        'h1',
        new Coordinate(8, 8),
        'i1',
        time
      )
    );

    expect(addFeature.getSharedVertexGroups().size).toBe(1);
    const group = [...addFeature.getSharedVertexGroups().values()][0];
    expect(group.vertexIds).toContain('h1');
    expect(group.vertexIds).toContain('i1');
    expect(addFeature.getVertices().get('h1')!.coordinate).toEqual(new Coordinate(8, 8));
    expect(addFeature.getVertices().get('i1')!.coordinate).toEqual(new Coordinate(8, 8));
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

  it('自己交差する頂点移動は拒否する', () => {
    const time = new TimePoint(1000);
    const polygon = addFeature.addPolygon(
      [
        new Coordinate(0, 0),
        new Coordinate(10, 0),
        new Coordinate(10, 10),
        new Coordinate(0, 10),
      ],
      'l1',
      time
    );
    const anchor = polygon.getActiveAnchor(time)!;
    const vertexIds =
      anchor.shape.type === 'Polygon' ? [...anchor.shape.rings[0].vertexIds] : [];

    const cmd = new MoveVertexCommand(
      vertexEdit,
      addFeature,
      vertexIds[1],
      new Coordinate(5, 15),
      null,
      time
    );

    expect(() => undoRedo.execute(cmd)).toThrow('自己交差');
    expect(addFeature.getVertices().get(vertexIds[1])!.coordinate).toEqual(new Coordinate(10, 0));
  });

  it('穴リングが親領土から外れる頂点移動は拒否する', () => {
    const time = new TimePoint(1000);
    const polygon = addFeature.addPolygon(
      [
        new Coordinate(0, 0),
        new Coordinate(20, 0),
        new Coordinate(20, 20),
        new Coordinate(0, 20),
      ],
      'l1',
      time
    );

    const activeAnchor = polygon.getActiveAnchor(time)!;
    if (activeAnchor.shape.type !== 'Polygon') {
      throw new Error('polygon anchor expected');
    }

    const holeVertices = addFeature.getVertices() as Map<string, Vertex>;
    holeVertices.set('h1', new Vertex('h1', new Coordinate(4, 4)));
    holeVertices.set('h2', new Vertex('h2', new Coordinate(16, 4)));
    holeVertices.set('h3', new Vertex('h3', new Coordinate(16, 16)));
    holeVertices.set('h4', new Vertex('h4', new Coordinate(4, 16)));

    const holeRing = new Ring(
      'hole-1',
      ['h1', 'h2', 'h3', 'h4'],
      'hole',
      activeAnchor.shape.rings[0].id
    );
    const updatedFeature = polygon.withAnchors([
      activeAnchor.withShape({
        type: 'Polygon',
        rings: [...activeAnchor.shape.rings, holeRing],
      }),
    ]);
    (addFeature.getFeaturesMap() as Map<string, typeof polygon>).set(polygon.id, updatedFeature);

    const cmd = new MoveVertexCommand(
      vertexEdit,
      addFeature,
      'h3',
      new Coordinate(24, 16),
      null,
      time
    );

    expect(() => undoRedo.execute(cmd)).toThrow('親リングの内部に完全に収まっていません');
    expect(addFeature.getVertices().get('h3')!.coordinate).toEqual(new Coordinate(16, 16));
  });
});
