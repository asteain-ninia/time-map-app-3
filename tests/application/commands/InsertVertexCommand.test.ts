import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { InsertVertexCommand } from '@application/commands/InsertVertexCommand';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('InsertVertexCommand', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  let undoRedo: UndoRedoManager;
  let time: TimePoint;

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
    undoRedo = new UndoRedoManager();
    time = new TimePoint(1000);
  });

  it('線の頂点挿入をUndo/Redoできる', () => {
    const line = addFeature.addLine(
      [new Coordinate(0, 0), new Coordinate(10, 0)],
      'l1',
      time
    );
    const originalVertexIds = line.getActiveAnchor(time)!.shape.type === 'LineString'
      ? [...line.getActiveAnchor(time)!.shape.vertexIds]
      : [];

    const command = new InsertVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      edgeIndex: 0,
      coordinate: new Coordinate(5, 0),
    });
    undoRedo.execute(command);

    const insertedVertexId = command.insertedVertexId;
    expect(insertedVertexId).not.toBeNull();
    expect(addFeature.getVertices().has(insertedVertexId!)).toBe(true);
    expect(getLineVertexIds(line.id)).toEqual([
      originalVertexIds[0],
      insertedVertexId,
      originalVertexIds[1],
    ]);

    undoRedo.undo();

    expect(addFeature.getVertices().has(insertedVertexId!)).toBe(false);
    expect(getLineVertexIds(line.id)).toEqual(originalVertexIds);

    undoRedo.redo();

    const redoneVertexId = command.insertedVertexId;
    expect(redoneVertexId).toBe(insertedVertexId);
    expect(addFeature.getVertices().has(redoneVertexId!)).toBe(true);
    expect(getLineVertexIds(line.id)).toEqual([
      originalVertexIds[0],
      insertedVertexId,
      originalVertexIds[1],
    ]);
  });

  it('面のリング頂点挿入をUndoできる', () => {
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
    if (anchor.shape.type !== 'Polygon') {
      throw new Error('polygon expected');
    }
    const ring = anchor.shape.rings[0];

    const command = new InsertVertexCommand(vertexEdit, addFeature, {
      type: 'polygon',
      featureId: polygon.id,
      currentTime: time,
      ringId: ring.id,
      edgeIndex: 0,
      coordinate: new Coordinate(5, 0),
    });
    undoRedo.execute(command);

    expect(getPolygonRingVertexIds(polygon.id, ring.id)).toHaveLength(5);

    undoRedo.undo();

    expect(getPolygonRingVertexIds(polygon.id, ring.id)).toEqual([...ring.vertexIds]);
    expect(addFeature.getVertices().has(command.insertedVertexId!)).toBe(false);
  });

  function getLineVertexIds(featureId: string): readonly string[] {
    const feature = addFeature.getFeatureById(featureId);
    const shape = feature?.getActiveAnchor(time)?.shape;
    return shape?.type === 'LineString' ? [...shape.vertexIds] : [];
  }

  function getPolygonRingVertexIds(featureId: string, ringId: string): readonly string[] {
    const feature = addFeature.getFeatureById(featureId);
    const shape = feature?.getActiveAnchor(time)?.shape;
    if (shape?.type !== 'Polygon') return [];
    return [...(shape.rings.find((ring) => ring.id === ringId)?.vertexIds ?? [])];
  }
});
