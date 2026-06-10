import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { DeleteVertexCommand, DeleteVerticesCommand } from '@application/commands/DeleteVertexCommand';
import { InsertVertexCommand } from '@application/commands/InsertVertexCommand';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { eventBus } from '@application/EventBus';
import type { Feature } from '@domain/entities/Feature';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('DeleteVertexCommand', () => {
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

  it('線の頂点削除をUndo/Redoできる', () => {
    const line = addFeature.addLine(
      [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(20, 0)],
      time
    );
    const vertexIds = getLineVertexIds(line.id);
    const targetVertexId = vertexIds[1];

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      vertexId: targetVertexId,
    }));

    expect(getLineVertexIds(line.id)).toEqual([vertexIds[0], vertexIds[2]]);

    undoRedo.undo();

    expect(getLineVertexIds(line.id)).toEqual(vertexIds);

    undoRedo.redo();

    expect(getLineVertexIds(line.id)).toEqual([vertexIds[0], vertexIds[2]]);
  });

  it('挿入した線上の点を削除した直後のUndoで挿入点が復元される', () => {
    const line = addFeature.addLine(
      [new Coordinate(0, 0), new Coordinate(10, 0)],
      time
    );
    const originalVertexIds = getLineVertexIds(line.id);

    const insertCommand = new InsertVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      edgeIndex: 0,
      coordinate: new Coordinate(5, 0),
    });
    undoRedo.execute(insertCommand);
    const insertedVertexId = insertCommand.insertedVertexId!;

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      vertexId: insertedVertexId,
    }));

    expect(getLineVertexIds(line.id)).toEqual(originalVertexIds);
    expect(addFeature.getVertices().has(insertedVertexId)).toBe(false);

    undoRedo.undo();

    expect(getLineVertexIds(line.id)).toEqual([
      originalVertexIds[0],
      insertedVertexId,
      originalVertexIds[1],
    ]);

    undoRedo.undo();

    expect(getLineVertexIds(line.id)).toEqual(originalVertexIds);
    expect(addFeature.getVertices().has(insertedVertexId)).toBe(false);
  });

  it('挿入と削除を連続Undo後にRedoしても削除対象IDがずれない', () => {
    const line = addFeature.addLine(
      [new Coordinate(0, 0), new Coordinate(10, 0)],
      time
    );
    const originalVertexIds = getLineVertexIds(line.id);

    const insertCommand = new InsertVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      edgeIndex: 0,
      coordinate: new Coordinate(5, 0),
    });
    undoRedo.execute(insertCommand);
    const insertedVertexId = insertCommand.insertedVertexId!;

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      vertexId: insertedVertexId,
    }));

    undoRedo.undo();
    undoRedo.undo();
    expect(getLineVertexIds(line.id)).toEqual(originalVertexIds);
    expect(addFeature.getVertices().has(insertedVertexId)).toBe(false);

    undoRedo.redo();
    expect(insertCommand.insertedVertexId).toBe(insertedVertexId);
    expect(getLineVertexIds(line.id)).toEqual([
      originalVertexIds[0],
      insertedVertexId,
      originalVertexIds[1],
    ]);

    undoRedo.redo();
    expect(getLineVertexIds(line.id)).toEqual(originalVertexIds);
    expect(addFeature.getVertices().has(insertedVertexId)).toBe(false);
  });

  it('頂点削除で地物が消える場合もUndoで復元できる', () => {
    const polygon = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
      time
    );
    const anchor = polygon.getActiveAnchor(time)!;
    if (anchor.shape.type !== 'Polygon') {
      throw new Error('polygon expected');
    }
    const ring = anchor.shape.rings[0];

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'polygon',
      featureId: polygon.id,
      currentTime: time,
      ringId: ring.id,
      vertexId: ring.vertexIds[0],
    }));

    expect(addFeature.getFeatureById(polygon.id)).toBeUndefined();

    undoRedo.undo();

    expect(addFeature.getFeatureById(polygon.id)).toBeDefined();
    expect(getPolygonRingVertexIds(polygon.id, ring.id)).toEqual([...ring.vertexIds]);
  });

  it('共有頂点を削除すると共有グループからも除去される', () => {
    const line = addFeature.addLine(
      [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(20, 0)],
      time
    );
    const point = addFeature.addPoint(new Coordinate(10, 0), time);
    const lineVertexIds = getLineVertexIds(line.id);
    const targetVertexId = lineVertexIds[1];
    const pointShape = point.getActiveAnchor(time)!.shape;
    const pointVertexId = pointShape.type === 'Point' ? pointShape.vertexId : '';
    const sharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    sharedGroups.set(
      'sg-1',
      new SharedVertexGroup('sg-1', [targetVertexId, pointVertexId], new Coordinate(10, 0))
    );

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'line',
      featureId: line.id,
      currentTime: time,
      vertexId: targetVertexId,
    }));

    expect(addFeature.getVertices().has(targetVertexId)).toBe(false);
    expect(addFeature.getSharedVertexGroups().has('sg-1')).toBe(false);

    undoRedo.undo();

    expect(addFeature.getVertices().has(targetVertexId)).toBe(true);
    expect(addFeature.getSharedVertexGroups().get('sg-1')?.vertexIds)
      .toEqual([targetVertexId, pointVertexId]);
  });

  it('複数頂点削除は1つのUndo履歴としてまとめて復元される', () => {
    const line = addFeature.addLine(
      [
        new Coordinate(0, 0),
        new Coordinate(10, 0),
        new Coordinate(20, 0),
        new Coordinate(30, 0),
      ],
      time
    );
    const vertexIds = getLineVertexIds(line.id);

    undoRedo.execute(new DeleteVerticesCommand(vertexEdit, addFeature, [
      {
        type: 'line',
        featureId: line.id,
        currentTime: time,
        vertexId: vertexIds[1],
      },
      {
        type: 'line',
        featureId: line.id,
        currentTime: time,
        vertexId: vertexIds[2],
      },
    ]));

    expect(undoRedo.undoCount).toBe(1);
    expect(getLineVertexIds(line.id)).toEqual([vertexIds[0], vertexIds[3]]);

    undoRedo.undo();

    expect(getLineVertexIds(line.id)).toEqual(vertexIds);
  });

  it('退化削除（面3点未満）で掃除された親も undo で復元され feature:added が発火する（§6.4.16）', () => {
    const polygon = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
      time
    );
    const sibling = addFeature.addPolygon(
      [new Coordinate(20, 0), new Coordinate(30, 0), new Coordinate(30, 10)],
      time
    );
    // 集約地物（shape なしコンテナ）の下に polygon と sibling をぶら下げる
    const container = addFeature.buildContainerFeature(
      time,
      [polygon.id, sibling.id],
      { name: 'コンテナ', description: '' }
    );
    const featuresMap = addFeature.getFeaturesMap() as Map<string, Feature>;
    featuresMap.set(container.id, container);
    for (const childId of [polygon.id, sibling.id]) {
      const child = featuresMap.get(childId)!;
      featuresMap.set(childId, child.withAnchors(
        child.anchors.map(a => a.withPlacement(
          createAnchorPlacement(container.id, a.placement.childIds)
        ))
      ));
    }

    const shape = addFeature.getFeatureById(polygon.id)!.getActiveAnchor(time)!.shape;
    const ring = shape?.type === 'Polygon' ? shape.rings[0] : undefined;

    undoRedo.execute(new DeleteVertexCommand(vertexEdit, addFeature, {
      type: 'polygon',
      featureId: polygon.id,
      currentTime: time,
      ringId: ring!.id,
      vertexId: ring!.vertexIds[0],
    }));

    // 退化削除で polygon が消え、親 childIds から掃除される
    expect(addFeature.getFeatureById(polygon.id)).toBeUndefined();
    expect(addFeature.getFeatureById(container.id)!.anchors[0].placement.childIds)
      .toEqual([sibling.id]);

    const events: string[] = [];
    const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
      events.push(`added:${featureId}`);
    });
    const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
      events.push(`removed:${featureId}`);
    });

    try {
      undoRedo.undo();

      // 親子相互整合が完全復元
      expect(addFeature.getFeatureById(polygon.id)).toBeDefined();
      expect(addFeature.getFeatureById(container.id)!.anchors[0].placement.childIds)
        .toEqual([polygon.id, sibling.id]);

      // touch した全地物（削除地物 + 掃除された親）へ過不足なく通知（§6.4.16 厳密一致）
      expect([...events].sort()).toEqual(
        [`added:${polygon.id}`, `added:${container.id}`].sort()
      );
    } finally {
      unsubscribeAdded();
      unsubscribeRemoved();
    }
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
