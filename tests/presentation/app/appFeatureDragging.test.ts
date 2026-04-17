import { describe, expect, it } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  applyFeatureTranslationPreview,
  createFeatureDragSnapshot,
  restoreFeatureDragSnapshot,
} from '@presentation/app/appFeatureDragging';

describe('appFeatureDragging', () => {
  it('緯度クランプ後のプレビューも開始時スナップショットへ厳密復元する', () => {
    const addFeature = new AddFeatureUseCase();
    const time = new TimePoint(2000);
    const pointA = addFeature.addPoint(new Coordinate(10, 89), 'l1', time);
    const pointB = addFeature.addPoint(new Coordinate(10, 89), 'l1', time);
    const anchorA = pointA.getActiveAnchor(time)!;
    const anchorB = pointB.getActiveAnchor(time)!;
    if (anchorA.shape.type !== 'Point' || anchorB.shape.type !== 'Point') {
      throw new Error('test setup failed');
    }

    const vertices = addFeature.getVertices();
    const sharedGroups = addFeature.getSharedVertexGroups();
    const sharedGroup = new SharedVertexGroup(
      'sg-1',
      [anchorA.shape.vertexId, anchorB.shape.vertexId],
      new Coordinate(10, 89)
    );
    (sharedGroups as Map<string, SharedVertexGroup>).set(sharedGroup.id, sharedGroup);

    const snapshot = createFeatureDragSnapshot(pointA, time, vertices, sharedGroups);
    applyFeatureTranslationPreview(
      pointA,
      time,
      0,
      10,
      vertices as Map<string, Vertex>,
      sharedGroups as Map<string, SharedVertexGroup>
    );

    expect(vertices.get(anchorA.shape.vertexId)!.coordinate).toEqual(new Coordinate(10, 90));
    expect(vertices.get(anchorB.shape.vertexId)!.coordinate).toEqual(new Coordinate(10, 90));
    expect(sharedGroups.get(sharedGroup.id)!.representativeCoordinate).toEqual(new Coordinate(10, 90));

    restoreFeatureDragSnapshot(
      snapshot,
      vertices as Map<string, Vertex>,
      sharedGroups as Map<string, SharedVertexGroup>
    );

    expect(vertices.get(anchorA.shape.vertexId)!.coordinate).toEqual(new Coordinate(10, 89));
    expect(vertices.get(anchorB.shape.vertexId)!.coordinate).toEqual(new Coordinate(10, 89));
    expect(sharedGroups.get(sharedGroup.id)!.representativeCoordinate).toEqual(new Coordinate(10, 89));
  });
});
