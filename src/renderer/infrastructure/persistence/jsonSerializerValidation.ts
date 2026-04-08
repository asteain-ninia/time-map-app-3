import { TimePoint } from '@domain/value-objects/TimePoint';
import type { JsonWorld } from './jsonSerializerTypes';

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

function validateJsonWorld(json: JsonWorld): string[] {
  return [
    ...validateOrphanedVertices(json),
    ...validateTimeRanges(json),
    ...validateLayerReferences(json),
  ];
}

export { validateJsonWorld };
