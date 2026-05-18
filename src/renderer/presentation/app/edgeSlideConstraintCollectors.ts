import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { isLeafPolygonAnchor } from '@domain/value-objects/FeatureAnchor';
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

/**
 * エッジ滑り（EdgeSlide）の障害物として、ソース地物を除く全ての末端ポリゴン地物の領土リング座標を集める。
 *
 * Phase 2-D-1 で末端地物排他が地図全体へ移行した（要件定義書 §2.1 line 145-153 /
 * 開発ガイド §6.6.8）のと整合させて、Phase 2-D-6-3a で旧モデルの「同一レイヤー内のみ
 * 障害物として扱う」絞り込みを撤去した。リーフ判定（`isLeafPolygonAnchor`: shape を
 * 保持し `childIds.length === 0`）に揃えることで、コンテナおよび移行期間ノード
 * （shape あり + childIds 非空）を障害物から除外する（§6.6.8 のリーフ判定運用）。
 */
export function collectPolygonObstacleRings(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>,
  sourceFeatureIds: ReadonlySet<string>,
  referenceCoord: Coordinate
): RingCoords[] {
  if (!currentTime || sourceFeatureIds.size === 0) {
    return [];
  }

  const rings: RingCoords[] = [];
  for (const feature of features) {
    if (sourceFeatureIds.has(feature.id)) {
      continue;
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || !isLeafPolygonAnchor(anchor)) {
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

/**
 * エッジ滑りの障害物点として、ソース地物を除く全ての末端ポリゴン地物のリング頂点座標を集める。
 *
 * Phase 2-D-6-3a で同一レイヤー絞り込みを撤去し、`isLeafPolygonAnchor` で
 * 移行期間ノード・コンテナを除外する（`collectPolygonObstacleRings` と同方針）。
 */
export function collectPolygonObstacleVertices(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>,
  sourceFeatureIds: ReadonlySet<string>,
  referenceCoord: Coordinate
): ObstaclePoint[] {
  if (!currentTime || sourceFeatureIds.size === 0) {
    return [];
  }

  const points: ObstaclePoint[] = [];
  for (const feature of features) {
    if (sourceFeatureIds.has(feature.id)) {
      continue;
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || !isLeafPolygonAnchor(anchor)) {
      continue;
    }

    for (const ring of anchor.shape.rings) {
      points.push(...getShiftedRingCoords(ring.vertexIds, vertices, referenceCoord));
    }
  }

  return points;
}

/**
 * 移動中の頂点が属する末端ポリゴン地物の辺を、衝突応答用の制約として集める。
 *
 * Phase 2-D-6-3a 追補: ソース側も `isLeafPolygonAnchor` で揃え、移行期間ノード・
 * コンテナをソースから除外する（障害物側と判定経路を統一）。
 */
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
    if (!anchor || !isLeafPolygonAnchor(anchor)) {
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
