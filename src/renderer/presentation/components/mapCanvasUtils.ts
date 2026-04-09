import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';

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
