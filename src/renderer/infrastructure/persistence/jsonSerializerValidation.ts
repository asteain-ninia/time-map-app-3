import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { Ring, type RingType } from '@domain/value-objects/Ring';
import { isSelfIntersecting, type RingCoords } from '@domain/services/GeometryService';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import type { JsonRing, JsonWorld } from './jsonSerializerTypes';

const COORDINATE_EPSILON = 1e-9;

function validateOrphanedVertices(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertexIds = new Set(json.vertices.map((vertex) => vertex.id));

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (anchor.shape.type === 'Point' && anchor.shape.vertexId) {
        if (!vertexIds.has(anchor.shape.vertexId)) {
          errors.push(`Feature "${feature.id}" references non-existent vertex "${anchor.shape.vertexId}"`);
        }
      }
      if (anchor.shape.type === 'LineString' && anchor.shape.vertexIds) {
        for (const vertexId of anchor.shape.vertexIds) {
          if (!vertexIds.has(vertexId)) {
            errors.push(`Feature "${feature.id}" references non-existent vertex "${vertexId}"`);
          }
        }
      }
      if (anchor.shape.type === 'Polygon' && anchor.shape.rings) {
        for (const ring of anchor.shape.rings) {
          for (const vertexId of ring.vertexIds) {
            if (!vertexIds.has(vertexId)) {
              errors.push(`Feature "${feature.id}" ring "${ring.id}" references non-existent vertex "${vertexId}"`);
            }
          }
        }
      }
    }
  }

  return errors;
}

function validateTimeRanges(json: JsonWorld): string[] {
  const errors: string[] = [];

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!anchor.timeRange.end) {
        continue;
      }

      const start = new TimePoint(
        anchor.timeRange.start.year,
        anchor.timeRange.start.month,
        anchor.timeRange.start.day
      );
      const end = new TimePoint(
        anchor.timeRange.end.year,
        anchor.timeRange.end.month,
        anchor.timeRange.end.day
      );
      if (end.isBefore(start)) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" has end time before start time`
        );
      }
    }
  }

  return errors;
}

function validateLayerReferences(json: JsonWorld): string[] {
  const errors: string[] = [];
  const layerIds = new Set(json.layers.map((layer) => layer.id));

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!layerIds.has(anchor.placement.layerId)) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" references non-existent layer "${anchor.placement.layerId}"`
        );
      }
    }
  }

  return errors;
}

function validatePlacementInvariants(json: JsonWorld): string[] {
  const errors: string[] = [];

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      const expected = anchor.placement.parentId === null;
      if (anchor.placement.isTopLevel !== expected) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" placement.isTopLevel must equal (parentId === null)`
        );
      }
    }
  }

  return errors;
}

function validateSharedVertexGroups(json: JsonWorld): string[] {
  const errors: string[] = [];
  const verticesById = new Map(json.vertices.map((vertex) => [vertex.id, vertex]));
  const vertexGroupIds = new Map<string, string>();

  for (const group of json.sharedVertexGroups ?? []) {
    if (group.vertexIds.length < 2) {
      errors.push(`Shared vertex group "${group.id}" must contain at least 2 vertices`);
    }

    for (const duplicateVertexId of findDuplicates(group.vertexIds)) {
      errors.push(`Shared vertex group "${group.id}" contains duplicate vertex "${duplicateVertexId}"`);
    }

    for (const vertexId of group.vertexIds) {
      const previousGroupId = vertexGroupIds.get(vertexId);
      if (previousGroupId && previousGroupId !== group.id) {
        errors.push(
          `Vertex "${vertexId}" belongs to multiple shared vertex groups ("${previousGroupId}" and "${group.id}")`
        );
      }
      vertexGroupIds.set(vertexId, group.id);

      const vertex = verticesById.get(vertexId);
      if (!vertex) {
        errors.push(`Shared vertex group "${group.id}" references non-existent vertex "${vertexId}"`);
        continue;
      }

      if (
        !coordinatesEqual(vertex.x, group.representativeCoordinate.x) ||
        !coordinatesEqual(vertex.y, group.representativeCoordinate.y)
      ) {
        errors.push(
          `Shared vertex group "${group.id}" vertex "${vertexId}" coordinate does not match representativeCoordinate`
        );
      }
    }
  }

  return errors;
}

function validatePolygons(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertices = new Map(
    json.vertices.map((vertex) => [
      vertex.id,
      new Vertex(vertex.id, new Coordinate(vertex.x, vertex.y)),
    ])
  );

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (anchor.shape.type !== 'Polygon') {
        continue;
      }
      if (!anchor.shape.rings) {
        continue;
      }

      const rings = anchor.shape.rings;
      const anchorErrors = validatePolygonRings(feature.id, anchor.id, rings, vertices);
      errors.push(...anchorErrors);
    }
  }

  return errors;
}

function validatePolygonRings(
  featureId: string,
  anchorId: string,
  jsonRings: readonly JsonRing[],
  vertices: ReadonlyMap<string, Vertex>
): string[] {
  const errors: string[] = [];
  const validRings: Ring[] = [];
  let canRunGeometryValidation = true;

  for (const duplicateRingId of findDuplicates(jsonRings.map((ring) => ring.id))) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}" contains duplicate ring "${duplicateRingId}"`);
    canRunGeometryValidation = false;
  }

  if (!jsonRings.some((ring) => ring.ringType === 'territory' && ring.parentId === null)) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}" polygon requires a top-level territory ring`);
  }

  for (const ring of jsonRings) {
    let ringIsValidForGeometry = true;

    if (ring.vertexIds.length < 3) {
      errors.push(`Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" requires at least 3 vertices`);
      ringIsValidForGeometry = false;
    }

    for (const duplicateVertexId of findDuplicates(ring.vertexIds)) {
      errors.push(
        `Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" contains duplicate vertex "${duplicateVertexId}"`
      );
      ringIsValidForGeometry = false;
    }

    if (!isRingType(ring.ringType)) {
      errors.push(
        `Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" has unknown ring type "${ring.ringType}"`
      );
      ringIsValidForGeometry = false;
    }

    if (ring.vertexIds.some((vertexId) => !vertices.has(vertexId))) {
      ringIsValidForGeometry = false;
    }

    if (!ringIsValidForGeometry) {
      canRunGeometryValidation = false;
      continue;
    }

    validRings.push(new Ring(ring.id, ring.vertexIds, ring.ringType, ring.parentId));
  }

  if (!canRunGeometryValidation) {
    return errors;
  }

  for (const ring of validRings) {
    if (isSelfIntersecting(resolveRingCoords(ring, vertices))) {
      errors.push(`Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" is self-intersecting`);
    }
  }

  for (const error of validatePolygonRingHierarchy(validRings, vertices)) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}": ${error.message}`);
  }

  return errors;
}

function validateJsonWorld(json: JsonWorld): string[] {
  return [
    ...validateOrphanedVertices(json),
    ...validateTimeRanges(json),
    ...validateLayerReferences(json),
    ...validatePlacementInvariants(json),
    ...validateSharedVertexGroups(json),
    ...validatePolygons(json),
  ];
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function isRingType(value: string): value is RingType {
  return value === 'territory' || value === 'hole';
}

function resolveRingCoords(
  ring: Ring,
  vertices: ReadonlyMap<string, Vertex>
): RingCoords {
  return ring.vertexIds.map((vertexId) => {
    const vertex = vertices.get(vertexId);
    if (!vertex) {
      throw new Error(`Vertex "${vertexId}" not found`);
    }
    return { x: vertex.x, y: vertex.y };
  });
}

function coordinatesEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= COORDINATE_EPSILON;
}

export { validateJsonWorld };
