import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { AddToolType } from '@presentation/state/toolMachine';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from '@domain/services/GeometryService';
import { slideAlongEdge } from '@domain/services/EdgeSlideService';
import {
  constrainMovingEdgesAgainstPoints,
  type MovingEdgeConstraint,
  type ObstaclePoint,
} from '@domain/services/EdgePointCollisionService';
import type { RingDrawingState } from '@infrastructure/rendering/ringDrawingManager';
import {
  isRingDrawingPointAllowed,
  resolveRingDrawingPlacement,
} from '@domain/services/RingEditService';
import {
  PolygonValidationError,
  createTransientPolygonFeature,
  validatePolygonOrThrow,
} from '@application/polygonValidation';
import {
  wrapLongitudeNearReference,
} from '@infrastructure/rendering/featureRenderingUtils';

type PolygonAnchor = FeatureAnchor & {
  readonly shape: Extract<FeatureAnchor['shape'], { readonly type: 'Polygon' }>;
};

function isPolygonAnchor(anchor: FeatureAnchor): anchor is PolygonAnchor {
  return anchor.shape !== undefined && anchor.shape.type === 'Polygon';
}

export type { MovingEdgeConstraint, ObstaclePoint };

export interface RingDrawingTarget {
  readonly feature: Feature;
  readonly anchor: PolygonAnchor;
}

export function getValidationMessage(error: unknown): string {
  if (error instanceof PolygonValidationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '形状を確定できません';
}

export function buildValidationVertices(
  existingVertices: ReadonlyMap<string, Vertex>,
  updates: readonly { vertexId: string; coordinate: Coordinate }[]
): Map<string, Vertex> {
  const validationVertices = new Map(existingVertices);
  for (const update of updates) {
    const existing = validationVertices.get(update.vertexId);
    validationVertices.set(
      update.vertexId,
      existing
        ? existing.withCoordinate(update.coordinate)
        : new Vertex(update.vertexId, update.coordinate.clampLatitude())
    );
  }
  return validationVertices;
}

export function getRingDrawingTarget(
  features: readonly Feature[],
  ringDrawingState: RingDrawingState | null,
  currentTime: TimePoint | undefined
): RingDrawingTarget | null {
  if (!ringDrawingState || !currentTime) return null;

  const feature = features.find((candidate) => candidate.id === ringDrawingState.featureId);
  if (!feature) return null;

  const anchor = feature.getActiveAnchor(currentTime);
  if (!anchor || !isPolygonAnchor(anchor)) return null;

  return { feature, anchor };
}

export function getAnchorReferenceLongitude(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): number | null {
  if (!anchor.shape) return null;
  switch (anchor.shape.type) {
    case 'Point':
      return vertices.get(anchor.shape.vertexId)?.x ?? null;
    case 'LineString': {
      for (const vertexId of anchor.shape.vertexIds) {
        const vertex = vertices.get(vertexId);
        if (vertex) return vertex.x;
      }
      return null;
    }
    case 'Polygon': {
      for (const ring of anchor.shape.rings) {
        for (const vertexId of ring.vertexIds) {
          const vertex = vertices.get(vertexId);
          if (vertex) return vertex.x;
        }
      }
      return null;
    }
  }
}

export function getSelectedPolygonReferenceLongitude(
  features: readonly Feature[],
  selectionFeatureId: string | null,
  currentTime: TimePoint | undefined,
  vertices: ReadonlyMap<string, Vertex>
): number | null {
  if (!selectionFeatureId || !currentTime) return null;
  const feature = features.find((candidate) => candidate.id === selectionFeatureId);
  const anchor = feature?.getActiveAnchor(currentTime);
  return anchor && anchor.shape && anchor.shape.type === 'Polygon'
    ? getAnchorReferenceLongitude(anchor, vertices)
    : null;
}

export function alignCoordinateNearReference(
  coord: Coordinate,
  currentCoords: readonly Coordinate[],
  fallbackReferenceLon: number | null = null
): Coordinate {
  const referenceLon = currentCoords.at(-1)?.x ?? fallbackReferenceLon;
  return referenceLon === null
    ? coord
    : new Coordinate(wrapLongitudeNearReference(coord.x, referenceLon), coord.y);
}

export function resolveEdgeSlideCoordinate(
  coord: Coordinate,
  obstacleRings: readonly RingCoords[],
  previousCoord?: Coordinate,
  movingEdges: readonly MovingEdgeConstraint[] = [],
  obstaclePoints: readonly ObstaclePoint[] = []
): Coordinate {
  const slideResult = slideAlongEdge(coord.x, coord.y, obstacleRings, previousCoord);
  if (slideResult.blocked && previousCoord) {
    return previousCoord;
  }
  const ringConstrainedCoord = slideResult.didSlide
    ? new Coordinate(slideResult.x, slideResult.y).clampLatitude()
    : coord;
  const edgePointResult = constrainMovingEdgesAgainstPoints(
    ringConstrainedCoord.x,
    ringConstrainedCoord.y,
    movingEdges,
    obstaclePoints,
    obstacleRings
  );
  return edgePointResult.didSlide
    ? new Coordinate(edgePointResult.x, edgePointResult.y).clampLatitude()
    : ringConstrainedCoord;
}

export function getRingDrawingConstraintMessage(
  target: RingDrawingTarget | null,
  ringDrawingState: RingDrawingState | null,
  vertices: ReadonlyMap<string, Vertex>
): string {
  if (!target) return 'ポリゴン地物が選択されていません';
  if (!ringDrawingState || ringDrawingState.coords.length === 0) {
    return '穴/飛び地を開始できません';
  }

  const resolution = resolveRingDrawingPlacement(
    target.anchor.shape.rings,
    vertices,
    { x: ringDrawingState.coords[0].x, y: ringDrawingState.coords[0].y }
  );
  if (!resolution.placement) {
    return resolution.message ?? '穴/飛び地を開始できません';
  }

  switch (resolution.placement.constraint.kind) {
    case 'territory':
      return '穴追加中の頂点は開始した領土リングの内部に配置してください';
    case 'hole':
      return '飛び地追加中の頂点は開始した穴リングの内部に配置してください';
    case 'outside':
      return '飛び地追加中の頂点は選択中ポリゴンの外部に配置してください';
  }
}

export function validateRingDrawingVertex(
  coord: Coordinate,
  target: RingDrawingTarget | null,
  ringDrawingState: RingDrawingState | null,
  vertices: ReadonlyMap<string, Vertex>
): string | null {
  if (!target) return 'ポリゴン地物が選択されていません';

  const alignedCoord = alignCoordinateNearReference(
    coord,
    ringDrawingState?.coords ?? [],
    getAnchorReferenceLongitude(target.anchor, vertices)
  );

  if (!ringDrawingState || ringDrawingState.coords.length === 0) {
    const resolution = resolveRingDrawingPlacement(
      target.anchor.shape.rings,
      vertices,
      { x: alignedCoord.x, y: alignedCoord.y }
    );
    return resolution.message;
  }

  const resolution = resolveRingDrawingPlacement(
    target.anchor.shape.rings,
    vertices,
    { x: ringDrawingState.coords[0].x, y: ringDrawingState.coords[0].y }
  );
  if (!resolution.placement) {
    return resolution.message ?? '穴/飛び地を開始できません';
  }

  return isRingDrawingPointAllowed(
    { x: alignedCoord.x, y: alignedCoord.y },
    resolution.placement,
    target.anchor.shape.rings,
    vertices
  )
    ? null
    : getRingDrawingConstraintMessage(target, ringDrawingState, vertices);
}

/**
 * 追加ツールで描画中・確定前のポリゴンを検証する。
 *
 * `parentId` を指定した場合は親自身を末端排他の障害物から除外する。これは
 * `AddFeatureCommand`（コマンド層）の親除外（[`AddFeatureCommand.ts:92-94`](../../application/commands/AddFeatureCommand.ts)）と
 * 対称にすべき制約で、UI 確定手前で親リーフ内部の頂点配置が末端排他としてブロックされる
 * silent な経路漏れを防ぐ（開発ガイド §6.1.8「状態遷移の検出は入力経路でゲートせず結果状態で
 * 判定する」の射程: 同じ「親除外」制約をコマンド経路と UI 経路の両方で網羅）。
 *
 * 親除外の正当性は要件定義書 §2.1 line 225-227（末端→集約遷移で親形状は下位領域の和へ
 * 置換される）に依拠。親以外の末端地物との重なり（親外へのはみ出し）は引き続き拒否する。
 */
export function validatePendingPolygon(
  coords: readonly Coordinate[],
  addToolType: AddToolType,
  currentTime: TimePoint | undefined,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  parentId: string | null = null
): string | null {
  if (addToolType !== 'polygon' || !currentTime) return null;

  try {
    const transient = createTransientPolygonFeature(
      coords,
      currentTime,
      'pending-drawing',
      'pending-drawing-ring',
      'pending-drawing-v'
    );
    const validationVertices = new Map(vertices);
    for (const [vertexId, vertex] of transient.vertices) {
      validationVertices.set(vertexId, vertex);
    }
    const obstacleFeatures = parentId
      ? features.filter((feature) => feature.id !== parentId)
      : features;
    validatePolygonOrThrow(
      transient.feature,
      obstacleFeatures,
      validationVertices,
      currentTime
    );
    return null;
  } catch (error) {
    return getValidationMessage(error);
  }
}
