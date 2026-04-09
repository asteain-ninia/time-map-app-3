import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { AddToolType } from '@presentation/state/toolMachine';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
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
import { wrapLongitudeNearReference } from '@infrastructure/rendering/featureRenderingUtils';

type PolygonAnchor = FeatureAnchor & {
  readonly shape: Extract<FeatureAnchor['shape'], { readonly type: 'Polygon' }>;
};

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
  if (!anchor || anchor.shape.type !== 'Polygon') return null;

  return { feature, anchor };
}

export function getAnchorReferenceLongitude(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): number | null {
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
  return anchor && anchor.shape.type === 'Polygon'
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

export function validatePendingPolygon(
  coords: readonly Coordinate[],
  addToolType: AddToolType,
  currentTime: TimePoint | undefined,
  layerId: string | null,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>
): string | null {
  if (addToolType !== 'polygon' || !currentTime || !layerId) return null;

  try {
    const transient = createTransientPolygonFeature(
      coords,
      layerId,
      currentTime,
      'pending-drawing',
      'pending-drawing-ring',
      'pending-drawing-v'
    );
    const validationVertices = new Map(vertices);
    for (const [vertexId, vertex] of transient.vertices) {
      validationVertices.set(vertexId, vertex);
    }
    validatePolygonOrThrow(
      transient.feature,
      features,
      validationVertices,
      currentTime,
      layerId
    );
    return null;
  } catch (error) {
    return getValidationMessage(error);
  }
}
