/**
 * ポリゴン整合性検証サービス
 *
 * UI/コマンド層から、自己交差と同レイヤー重複をまとめて検証する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { isSelfIntersecting, type RingCoords } from './GeometryService';
import {
  detectConflictsForFeature,
  type SpatialConflict,
} from './ConflictDetectionService';

export interface PolygonValidationResult {
  readonly selfIntersectingRingIds: readonly string[];
  readonly conflicts: readonly SpatialConflict[];
  readonly isValid: boolean;
}

export function validatePolygonFeature(
  targetFeature: Feature,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint,
  explicitLayerId?: string
): PolygonValidationResult {
  const activeAnchor = targetFeature.getActiveAnchor(time);
  if (!activeAnchor || activeAnchor.shape.type !== 'Polygon') {
    return {
      selfIntersectingRingIds: [],
      conflicts: [],
      isValid: true,
    };
  }

  const selfIntersectingRingIds = activeAnchor.shape.rings
    .filter((ring) => isSelfIntersecting(resolveRingCoords(ring.vertexIds, vertices)))
    .map((ring) => ring.id);

  const conflicts = detectConflictsForFeature(
    targetFeature,
    features,
    vertices,
    time,
    explicitLayerId
  );

  return {
    selfIntersectingRingIds,
    conflicts,
    isValid: selfIntersectingRingIds.length === 0 && conflicts.length === 0,
  };
}

function resolveRingCoords(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): RingCoords {
  const coords: { x: number; y: number }[] = [];
  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (!vertex) {
      throw new Error(`Vertex "${vertexId}" not found`);
    }
    coords.push({ x: vertex.x, y: vertex.y });
  }
  return coords;
}
