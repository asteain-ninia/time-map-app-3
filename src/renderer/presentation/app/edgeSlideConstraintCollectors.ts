import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from '@domain/services/GeometryService';
import type {
  MovingEdgeConstraint,
  ObstaclePoint,
} from '@domain/services/EdgePointCollisionService';
import {
  shiftLongitudeSequenceNearReference,
  unwrapLongitudeSequence,
} from '@infrastructure/rendering/featureRenderingUtils';

export type { MovingEdgeConstraint, ObstaclePoint };

export function collectSameLayerPolygonObstacleRings(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>,
  sourceFeatureIds: ReadonlySet<string>,
  referenceCoord: Coordinate
): RingCoords[] {
  if (!currentTime || sourceFeatureIds.size === 0) {
    return [];
  }

  const sourceLayerIds = collectSourceLayerIds(features, currentTime, sourceFeatureIds);
  if (sourceLayerIds.size === 0) {
    return [];
  }

  const rings: RingCoords[] = [];
  for (const feature of features) {
    if (sourceFeatureIds.has(feature.id)) {
      continue;
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (
      !anchor ||
      anchor.shape.type !== 'Polygon' ||
      !sourceLayerIds.has(anchor.placement.layerId)
    ) {
      continue;
    }

    for (const ring of anchor.shape.rings) {
      if (ring.ringType !== 'territory') {
        continue;
      }

      const shiftedCoords = getShiftedRingCoords(ring.vertexIds, vertices, referenceCoord);
      if (shiftedCoords.length < 3) {
        continue;
      }

      rings.push(shiftedCoords);
    }
  }

  return rings;
}

export function collectSameLayerPolygonObstacleVertices(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>,
  sourceFeatureIds: ReadonlySet<string>,
  referenceCoord: Coordinate
): ObstaclePoint[] {
  if (!currentTime || sourceFeatureIds.size === 0) {
    return [];
  }

  const sourceLayerIds = collectSourceLayerIds(features, currentTime, sourceFeatureIds);
  if (sourceLayerIds.size === 0) {
    return [];
  }

  const points: ObstaclePoint[] = [];
  for (const feature of features) {
    if (sourceFeatureIds.has(feature.id)) {
      continue;
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (
      !anchor ||
      anchor.shape.type !== 'Polygon' ||
      !sourceLayerIds.has(anchor.placement.layerId)
    ) {
      continue;
    }

    for (const ring of anchor.shape.rings) {
      points.push(...getShiftedRingCoords(ring.vertexIds, vertices, referenceCoord));
    }
  }

  return points;
}

export function collectMovingPolygonEdgeConstraints(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>,
  movingVertexIds: ReadonlySet<string>,
  sourceFeatureIds: ReadonlySet<string>,
  referenceCoord: Coordinate
): MovingEdgeConstraint[] {
  if (!currentTime || movingVertexIds.size === 0 || sourceFeatureIds.size === 0) {
    return [];
  }

  const constraints: MovingEdgeConstraint[] = [];
  for (const feature of features) {
    if (!sourceFeatureIds.has(feature.id)) {
      continue;
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') {
      continue;
    }

    for (const ring of anchor.shape.rings) {
      const coords = getShiftedRingCoords(ring.vertexIds, vertices, referenceCoord);
      if (coords.length !== ring.vertexIds.length || coords.length < 3) {
        continue;
      }

      for (let index = 0; index < ring.vertexIds.length; index += 1) {
        if (!movingVertexIds.has(ring.vertexIds[index])) {
          continue;
        }

        const source = coords[index];
        const previous = coords[(index - 1 + coords.length) % coords.length];
        const next = coords[(index + 1) % coords.length];
        constraints.push(
          buildMovingEdgeConstraint(previous, source),
          buildMovingEdgeConstraint(next, source)
        );
      }
    }
  }

  return constraints;
}

function collectSourceLayerIds(
  features: readonly Feature[],
  currentTime: TimePoint,
  sourceFeatureIds: ReadonlySet<string>
): Set<string> {
  const sourceLayerIds = new Set<string>();
  for (const feature of features) {
    if (!sourceFeatureIds.has(feature.id)) {
      continue;
    }
    const anchor = feature.getActiveAnchor(currentTime);
    if (anchor) {
      sourceLayerIds.add(anchor.placement.layerId);
    }
  }
  return sourceLayerIds;
}

function getShiftedRingCoords(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>,
  referenceCoord: Coordinate
): RingCoords {
  const rawCoords = vertexIds
    .map((vertexId) => vertices.get(vertexId))
    .filter((vertex): vertex is Vertex => vertex !== undefined)
    .map((vertex) => ({ x: vertex.x, y: vertex.y }));

  if (rawCoords.length === 0) {
    return [];
  }

  const unwrappedLongitudes = unwrapLongitudeSequence(rawCoords.map((coord) => coord.x));
  const shiftedLongitudes = shiftLongitudeSequenceNearReference(
    unwrappedLongitudes,
    referenceCoord.x
  );
  return rawCoords.map((coord, index) => ({
    x: shiftedLongitudes[index],
    y: coord.y,
  }));
}

function buildMovingEdgeConstraint(
  fixed: { readonly x: number; readonly y: number },
  source: { readonly x: number; readonly y: number }
): MovingEdgeConstraint {
  return {
    fixedX: fixed.x,
    fixedY: fixed.y,
    sourceX: source.x,
    sourceY: source.y,
  };
}
