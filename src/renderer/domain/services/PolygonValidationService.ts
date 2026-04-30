/**
 * ポリゴン整合性検証サービス
 *
 * UI/コマンド層から、自己交差と同レイヤー重複をまとめて検証する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { isLeafPolygonAnchor } from '@domain/value-objects/FeatureAnchor';
import { isSelfIntersecting, type RingCoords } from './GeometryService';
import {
  validatePolygonRingHierarchy,
  type RingValidationError,
} from './RingEditService';
import {
  detectConflictsForFeature,
  type SpatialConflict,
} from './ConflictDetectionService';

export interface PolygonValidationResult {
  readonly selfIntersectingRingIds: readonly string[];
  readonly ringValidationErrors: readonly RingValidationError[];
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
  // §6.6.8: ポリゴン整合性検証（自己交差・リング階層・空間競合）はいずれも末端地物のみが対象。
  // 集約地物・移行期間ノードは shape を持たない／リーフ前提検証の対象外なのでスキップする。
  if (!activeAnchor || !isLeafPolygonAnchor(activeAnchor)) {
    return {
      selfIntersectingRingIds: [],
      ringValidationErrors: [],
      conflicts: [],
      isValid: true,
    };
  }

  const selfIntersectingRingIds = activeAnchor.shape.rings
    .filter((ring) => isSelfIntersecting(resolveRingCoords(ring.vertexIds, vertices)))
    .map((ring) => ring.id);

  const ringValidationErrors = validatePolygonRingHierarchy(
    activeAnchor.shape.rings,
    vertices
  );

  const conflicts = detectConflictsForFeature(
    targetFeature,
    features,
    vertices,
    time,
    explicitLayerId
  );

  return {
    selfIntersectingRingIds,
    ringValidationErrors,
    conflicts,
    isValid:
      selfIntersectingRingIds.length === 0 &&
      ringValidationErrors.length === 0 &&
      conflicts.length === 0,
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
