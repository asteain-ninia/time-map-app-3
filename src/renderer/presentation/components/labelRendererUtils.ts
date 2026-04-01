import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import {
  geoToWrappedSvgX,
  geoToSvgY,
  unwrapLongitudeSequence,
} from '@infrastructure/rendering/featureRenderingUtils';

export interface LabelPosition {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_LABEL_MIN_ZOOM = 2;

function getVertexCoordinates(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): Array<{ lon: number; lat: number }> {
  const coordinates: Array<{ lon: number; lat: number }> = [];

  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      coordinates.push({ lon: vertex.x, lat: vertex.y });
    }
  }

  return coordinates;
}

export function getFeatureLabelPosition(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): LabelPosition | null {
  if (anchor.shape.type === 'Point') {
    const vertex = vertices.get(anchor.shape.vertexId);
    return vertex
      ? { x: geoToWrappedSvgX(vertex.x), y: geoToSvgY(vertex.y) }
      : null;
  }

  if (anchor.shape.type === 'LineString') {
    const midpointVertexId = anchor.shape.vertexIds[Math.floor(anchor.shape.vertexIds.length / 2)];
    if (!midpointVertexId) return null;

    const vertex = vertices.get(midpointVertexId);
    return vertex
      ? { x: geoToWrappedSvgX(vertex.x), y: geoToSvgY(vertex.y) }
      : null;
  }

  const outerRing = anchor.shape.rings[0];
  if (!outerRing) return null;

  const coordinates = getVertexCoordinates(outerRing.vertexIds, vertices);
  if (coordinates.length === 0) return null;

  const unwrappedLongitudes = unwrapLongitudeSequence(
    coordinates.map((coordinate) => coordinate.lon)
  );
  const longitudeSum = unwrappedLongitudes.reduce((sum, lon) => sum + lon, 0);
  const latitudeSum = coordinates.reduce((sum, coordinate) => sum + coordinate.lat, 0);

  return {
    x: geoToWrappedSvgX(longitudeSum / coordinates.length),
    y: geoToSvgY(latitudeSum / coordinates.length),
  };
}

export function measureFeatureLabelArea(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): number {
  if (anchor.shape.type !== 'Polygon') return 0;

  const outerRing = anchor.shape.rings[0];
  if (!outerRing) return 0;

  const coordinates = getVertexCoordinates(outerRing.vertexIds, vertices);
  if (coordinates.length < 3) return 0;

  const unwrappedLongitudes = unwrapLongitudeSequence(
    coordinates.map((coordinate) => coordinate.lon)
  );

  let signedArea = 0;
  for (let index = 0; index < coordinates.length; index++) {
    const nextIndex = (index + 1) % coordinates.length;
    signedArea +=
      unwrappedLongitudes[index] * coordinates[nextIndex].lat -
      unwrappedLongitudes[nextIndex] * coordinates[index].lat;
  }

  return Math.abs(signedArea) / 2;
}

export function measureFeatureLabelLength(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): number {
  if (anchor.shape.type !== 'LineString') return 0;

  const coordinates = getVertexCoordinates(anchor.shape.vertexIds, vertices);
  if (coordinates.length < 2) return 0;

  const unwrappedLongitudes = unwrapLongitudeSequence(
    coordinates.map((coordinate) => coordinate.lon)
  );

  let length = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const dx = unwrappedLongitudes[index] - unwrappedLongitudes[index - 1];
    const dy = coordinates[index].lat - coordinates[index - 1].lat;
    length += Math.hypot(dx, dy);
  }

  return length;
}

export function shouldRenderFeatureLabel(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>,
  zoom: number,
  labelAreaThreshold: number
): boolean {
  if (!anchor.property.name) return false;

  const minZoom = anchor.property.labelVisibility?.minZoom ?? DEFAULT_LABEL_MIN_ZOOM;
  if (zoom < minZoom) return false;

  const minDisplayLength = anchor.property.labelVisibility?.minDisplayLength;
  if (
    anchor.shape.type === 'LineString' &&
    minDisplayLength !== undefined &&
    measureFeatureLabelLength(anchor, vertices) < minDisplayLength
  ) {
    return false;
  }

  if (
    anchor.shape.type === 'Polygon' &&
    labelAreaThreshold > 0 &&
    measureFeatureLabelArea(anchor, vertices) < labelAreaThreshold
  ) {
    return false;
  }

  return getFeatureLabelPosition(anchor, vertices) !== null;
}
