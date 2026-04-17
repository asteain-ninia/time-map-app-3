import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  findGroupForVertex,
  getLinkedVertexIds,
} from '@domain/services/SharedVertexService';

export interface FeatureDragSnapshot {
  readonly vertexCoordinates: ReadonlyMap<string, Coordinate>;
  readonly sharedGroupCoordinates: ReadonlyMap<string, Coordinate>;
}

interface FeatureTranslationTargets {
  readonly vertexIds: readonly string[];
  readonly sharedGroupIds: readonly string[];
}

function collectAnchorVertexIds(feature: Feature, currentTime: TimePoint): Set<string> {
  const anchor = feature.getActiveAnchor(currentTime);
  const vertexIds = new Set<string>();
  if (!anchor) return vertexIds;

  switch (anchor.shape.type) {
    case 'Point':
      vertexIds.add(anchor.shape.vertexId);
      break;
    case 'LineString':
      for (const vertexId of anchor.shape.vertexIds) {
        vertexIds.add(vertexId);
      }
      break;
    case 'Polygon':
      for (const ring of anchor.shape.rings) {
        for (const vertexId of ring.vertexIds) {
          vertexIds.add(vertexId);
        }
      }
      break;
  }

  return vertexIds;
}

export function collectFeatureTranslationTargets(
  feature: Feature,
  currentTime: TimePoint,
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>
): FeatureTranslationTargets {
  const movedVertexIds = new Set<string>();
  const affectedGroupIds = new Set<string>();

  for (const vertexId of collectAnchorVertexIds(feature, currentTime)) {
    const linkedVertexIds = getLinkedVertexIds(vertexId, sharedGroups);
    const translatedVertexIds = linkedVertexIds.length > 0 ? linkedVertexIds : [vertexId];
    for (const translatedVertexId of translatedVertexIds) {
      movedVertexIds.add(translatedVertexId);
    }

    const group = findGroupForVertex(vertexId, sharedGroups);
    if (group) {
      affectedGroupIds.add(group.id);
    }
  }

  return {
    vertexIds: [...movedVertexIds],
    sharedGroupIds: [...affectedGroupIds],
  };
}

export function createFeatureDragSnapshot(
  feature: Feature,
  currentTime: TimePoint,
  vertices: ReadonlyMap<string, Vertex>,
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>
): FeatureDragSnapshot {
  const targets = collectFeatureTranslationTargets(feature, currentTime, sharedGroups);
  const vertexCoordinates = new Map<string, Coordinate>();
  const sharedGroupCoordinates = new Map<string, Coordinate>();

  for (const vertexId of targets.vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      vertexCoordinates.set(vertexId, vertex.coordinate);
    }
  }

  for (const groupId of targets.sharedGroupIds) {
    const group = sharedGroups.get(groupId);
    if (group) {
      sharedGroupCoordinates.set(groupId, group.representativeCoordinate);
    }
  }

  return { vertexCoordinates, sharedGroupCoordinates };
}

export function restoreFeatureDragSnapshot(
  snapshot: FeatureDragSnapshot,
  vertices: Map<string, Vertex>,
  sharedGroups: Map<string, SharedVertexGroup>
): void {
  for (const [vertexId, coordinate] of snapshot.vertexCoordinates) {
    const vertex = vertices.get(vertexId);
    if (!vertex) continue;
    vertices.set(vertexId, vertex.withCoordinate(coordinate));
  }

  for (const [groupId, coordinate] of snapshot.sharedGroupCoordinates) {
    const group = sharedGroups.get(groupId);
    if (!group) continue;
    sharedGroups.set(groupId, group.withRepresentativeCoordinate(coordinate));
  }
}

export function applyFeatureTranslationPreview(
  feature: Feature,
  currentTime: TimePoint,
  dx: number,
  dy: number,
  vertices: Map<string, Vertex>,
  sharedGroups: Map<string, SharedVertexGroup>
): void {
  const targets = collectFeatureTranslationTargets(feature, currentTime, sharedGroups);

  for (const vertexId of targets.vertexIds) {
    const vertex = vertices.get(vertexId);
    if (!vertex) continue;
    vertices.set(
      vertexId,
      vertex.withCoordinate(
        new Coordinate(vertex.coordinate.x + dx, vertex.coordinate.y + dy).clampLatitude()
      )
    );
  }

  for (const groupId of targets.sharedGroupIds) {
    const group = sharedGroups.get(groupId);
    if (!group) continue;
    sharedGroups.set(
      groupId,
      group.withRepresentativeCoordinate(
        new Coordinate(
          group.representativeCoordinate.x + dx,
          group.representativeCoordinate.y + dy
        ).clampLatitude()
      )
    );
  }
}
