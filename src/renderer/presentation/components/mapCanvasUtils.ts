import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export interface MapCanvasVertexHandleEntry {
  readonly featureId: string;
  readonly anchor: FeatureAnchor;
  readonly showEdgeHandles: boolean;
}

export interface MapCanvasViewBoxValues {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SvgMapViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface ParsedSvgMap {
  readonly content: string;
  readonly viewBox: SvgMapViewBox;
}

interface LongitudeBounds {
  readonly minSvgX: number;
  readonly maxSvgX: number;
}

export function getAnchorVertexCount(anchor: FeatureAnchor): number {
  switch (anchor.shape.type) {
    case 'Point':
      return 1;
    case 'LineString':
      return anchor.shape.vertexIds.length;
    case 'Polygon':
      return anchor.shape.rings.reduce((sum, ring) => sum + ring.vertexIds.length, 0);
  }
}

export function normalizeRenderFps(fps: number): number {
  if (!Number.isFinite(fps)) {
    return 60;
  }
  return Math.max(1, Math.min(60, Math.round(fps)));
}

export function normalizeVertexMarkerDisplayLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1000;
  }
  return Math.max(1, Math.round(limit));
}

export function normalizeZoomLimits(min: number, max: number): { min: number; max: number } {
  const safeMin = Number.isFinite(min) ? min : 1;
  const safeMax = Number.isFinite(max) ? max : 50;
  const lower = Math.max(0.1, Math.min(safeMin, safeMax));
  const upper = Math.max(lower, Math.max(safeMin, safeMax));
  return { min: lower, max: upper };
}

export function formatSurveyDistance(distanceKm: number): string {
  return distanceKm < 100
    ? distanceKm.toFixed(1)
    : Math.round(distanceKm).toLocaleString();
}

function parseLength(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/^([+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?)/i);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSvgAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return attributes.match(pattern)?.[1];
}

function parseViewBox(attributes: string): SvgMapViewBox | null {
  const rawViewBox = getSvgAttribute(attributes, 'viewBox');
  if (rawViewBox) {
    const values = rawViewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      values.length === 4 &&
      values.every(Number.isFinite) &&
      values[2] > 0 &&
      values[3] > 0
    ) {
      return {
        minX: values[0],
        minY: values[1],
        width: values[2],
        height: values[3],
      };
    }
  }

  const width = parseLength(getSvgAttribute(attributes, 'width'));
  const height = parseLength(getSvgAttribute(attributes, 'height'));
  return width && height
    ? { minX: 0, minY: 0, width, height }
    : null;
}

function sanitizeSvgContent(content: string): string {
  return content
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
}

export function parseSvgMap(svgText: string): ParsedSvgMap | null {
  const match = svgText.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) {
    return null;
  }

  const viewBox = parseViewBox(match[1]);
  if (!viewBox) {
    return null;
  }

  return {
    content: sanitizeSvgContent(match[2]),
    viewBox,
  };
}

export function createBaseMapTransform(viewBox: SvgMapViewBox): string {
  const scaleX = 360 / viewBox.width;
  const scaleY = 180 / viewBox.height;
  const translateX = -viewBox.minX * scaleX;
  const translateY = -viewBox.minY * scaleY;
  return `matrix(${scaleX} 0 0 ${scaleY} ${translateX} ${translateY})`;
}

export function computeRenderWrapOffsets(
  viewBox: MapCanvasViewBoxValues,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  currentTime?: TimePoint,
  options?: {
    readonly visibleLayerIds?: ReadonlySet<string>;
    readonly extraCoords?: readonly Coordinate[];
    readonly basePaddingTiles?: number;
  }
): number[] {
  const offsets = new Set<number>();
  const basePaddingTiles = options?.basePaddingTiles ?? 1;

  addBaseWrapOffsets(offsets, viewBox, basePaddingTiles);

  if (currentTime) {
    for (const feature of features) {
      const anchor = feature.getActiveAnchor(currentTime);
      if (!anchor) {
        continue;
      }
      if (options?.visibleLayerIds && !options.visibleLayerIds.has(anchor.placement.layerId)) {
        continue;
      }

      const bounds = getAnchorLongitudeBounds(anchor, vertices);
      if (!bounds) {
        continue;
      }
      addGeometryWrapOffsets(offsets, viewBox, bounds);
    }
  }

  const extraBounds = getCoordinateLongitudeBounds(options?.extraCoords ?? []);
  if (extraBounds) {
    addGeometryWrapOffsets(offsets, viewBox, extraBounds);
  }

  return [...offsets].toSorted((a, b) => a - b);
}

function addBaseWrapOffsets(
  offsets: Set<number>,
  viewBox: MapCanvasViewBoxValues,
  paddingTiles: number
): void {
  const epsilon = 1e-9;
  const startTile = Math.floor(viewBox.x / 360) - paddingTiles;
  const endTile = Math.floor((viewBox.x + viewBox.width - epsilon) / 360) + paddingTiles;

  for (let tile = startTile; tile <= endTile; tile++) {
    offsets.add(tile * 360);
  }
}

function addGeometryWrapOffsets(
  offsets: Set<number>,
  viewBox: MapCanvasViewBoxValues,
  bounds: LongitudeBounds
): void {
  const startTile = Math.ceil((viewBox.x - bounds.maxSvgX) / 360);
  const endTile = Math.floor((viewBox.x + viewBox.width - bounds.minSvgX) / 360);

  for (let tile = startTile; tile <= endTile; tile++) {
    offsets.add(tile * 360);
  }
}

function getAnchorLongitudeBounds(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): LongitudeBounds | null {
  const longitudes: number[] = [];

  switch (anchor.shape.type) {
    case 'Point': {
      const vertex = vertices.get(anchor.shape.vertexId);
      if (vertex) {
        longitudes.push(vertex.x);
      }
      break;
    }
    case 'LineString': {
      for (const vertexId of anchor.shape.vertexIds) {
        const vertex = vertices.get(vertexId);
        if (vertex) {
          longitudes.push(vertex.x);
        }
      }
      break;
    }
    case 'Polygon': {
      for (const ring of anchor.shape.rings) {
        for (const vertexId of ring.vertexIds) {
          const vertex = vertices.get(vertexId);
          if (vertex) {
            longitudes.push(vertex.x);
          }
        }
      }
      break;
    }
  }

  return getLongitudeBounds(longitudes);
}

function getCoordinateLongitudeBounds(coords: readonly Coordinate[]): LongitudeBounds | null {
  return getLongitudeBounds(coords.map((coord) => coord.x));
}

function getLongitudeBounds(longitudes: readonly number[]): LongitudeBounds | null {
  if (longitudes.length === 0) {
    return null;
  }

  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const lon of longitudes) {
    if (lon < minLon) {
      minLon = lon;
    }
    if (lon > maxLon) {
      maxLon = lon;
    }
  }

  return {
    minSvgX: minLon + 180,
    maxSvgX: maxLon + 180,
  };
}
