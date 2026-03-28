import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor as FeatureAnchorEntity } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { validatePolygonFeature } from '@domain/services/PolygonValidationService';

export class PolygonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolygonValidationError';
  }
}

export function createTransientPolygonFeature(
  coords: readonly Coordinate[],
  layerId: string,
  time: TimePoint,
  featureId = 'temp-feature',
  ringId = 'temp-ring',
  vertexPrefix = 'temp-v'
): { feature: Feature; vertices: Map<string, Vertex> } {
  const vertices = new Map<string, Vertex>();
  const vertexIds = coords.map((coord, index) => {
    const vertexId = `${vertexPrefix}-${index}`;
    vertices.set(vertexId, new Vertex(vertexId, coord.normalize()));
    return vertexId;
  });

  const anchor = new FeatureAnchorEntity(
    'temp-anchor',
    { start: time },
    { name: 'temp', description: '' },
    { type: 'Polygon', rings: [new Ring(ringId, vertexIds, 'territory', null)] },
    { layerId, parentId: null, childIds: [] }
  );

  return {
    feature: new Feature(featureId, 'Polygon', [anchor]),
    vertices,
  };
}

export function collectImpactedFeatureIdsByVertexIds(
  features: readonly Feature[],
  vertexIds: Iterable<string>,
  time: TimePoint
): string[] {
  const targetVertexIds = new Set(vertexIds);
  const impactedFeatureIds: string[] = [];

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) continue;

    if (anchorContainsAnyVertex(anchor, targetVertexIds)) {
      impactedFeatureIds.push(feature.id);
    }
  }

  return impactedFeatureIds;
}

export function validatePolygonOrThrow(
  targetFeature: Feature,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint,
  explicitLayerId?: string
): void {
  const result = validatePolygonFeature(
    targetFeature,
    features,
    vertices,
    time,
    explicitLayerId
  );

  if (result.selfIntersectingRingIds.length > 0) {
    throw new PolygonValidationError('ポリゴンが自己交差しています');
  }

  if (result.conflicts.length > 0) {
    const firstConflict = result.conflicts[0];
    const otherFeatureId =
      firstConflict.featureIdA === targetFeature.id
        ? firstConflict.featureIdB
        : firstConflict.featureIdA;
    throw new PolygonValidationError(
      `ポリゴンが同一レイヤーの地物 "${otherFeatureId}" と重なっています`
    );
  }
}

export function validatePolygonFeatureIdsOrThrow(
  featureIds: readonly string[],
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint
): void {
  for (const featureId of featureIds) {
    const feature = features.find((candidate) => candidate.id === featureId);
    if (!feature || feature.featureType !== 'Polygon') continue;
    validatePolygonOrThrow(feature, features, vertices, time);
  }
}

function anchorContainsAnyVertex(
  anchor: FeatureAnchor,
  vertexIds: ReadonlySet<string>
): boolean {
  switch (anchor.shape.type) {
    case 'Point':
      return vertexIds.has(anchor.shape.vertexId);
    case 'LineString':
      return anchor.shape.vertexIds.some((vertexId) => vertexIds.has(vertexId));
    case 'Polygon':
      return anchor.shape.rings.some((ring) =>
        ring.vertexIds.some((vertexId) => vertexIds.has(vertexId))
      );
  }
}
