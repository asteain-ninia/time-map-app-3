import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { Vertex } from '@domain/entities/Vertex';
import {
  shiftLongitudeSequenceNearReference,
  unwrapLongitudeSequence,
} from './featureRenderingUtils';

/**
 * 形状定義から全頂点IDリストをリンググループ毎に取得する
 */
export function getShapeVertexGroups(shape: FeatureShape): string[][] {
  if (shape.type === 'Point') return [[shape.vertexId]];
  if (shape.type === 'LineString') return [shape.vertexIds as string[]];
  if (shape.type === 'Polygon') return shape.rings.map((r) => r.vertexIds as string[]);
  return [];
}

/**
 * 形状定義から全頂点IDを重複排除で取得する
 */
export function getUniqueVertexIds(shape: FeatureShape): string[] {
  const ids = new Set<string>();
  for (const group of getShapeVertexGroups(shape)) {
    for (const id of group) ids.add(id);
  }
  return [...ids];
}

/** エッジ（隣接する頂点ペア） */
export interface Edge {
  readonly v1: string;
  readonly v2: string;
}

export interface VertexPosition {
  readonly vertexId: string;
  readonly x: number;
  readonly y: number;
}

export interface EdgePosition {
  readonly v1: string;
  readonly v2: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function resolveGroupPositions(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>,
  referenceLon?: number
): VertexPosition[] {
  const resolved: Array<{ vertexId: string; lon: number; lat: number }> = [];

  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      resolved.push({ vertexId, lon: vertex.x, lat: vertex.y });
    }
  }

  if (resolved.length === 0) return [];

  const unwrappedLongitudes = unwrapLongitudeSequence(resolved.map((vertex) => vertex.lon));
  const alignedLongitudes =
    referenceLon === undefined
      ? unwrappedLongitudes
      : shiftLongitudeSequenceNearReference(unwrappedLongitudes, referenceLon);

  return resolved.map((vertex, index) => ({
    vertexId: vertex.vertexId,
    x: alignedLongitudes[index],
    y: vertex.lat,
  }));
}

/**
 * 形状定義からエッジ（隣接頂点ペア）を取得する
 * LineStringは開いたエッジ列、Polygonリングは閉じたエッジ列
 */
export function getShapeEdges(shape: FeatureShape): Edge[] {
  const edges: Edge[] = [];
  if (shape.type === 'Point') return edges;

  if (shape.type === 'LineString') {
    const ids = shape.vertexIds;
    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ v1: ids[i], v2: ids[i + 1] });
    }
  }

  if (shape.type === 'Polygon') {
    for (const ring of shape.rings) {
      const ids = ring.vertexIds;
      for (let i = 0; i < ids.length - 1; i++) {
        edges.push({ v1: ids[i], v2: ids[i + 1] });
      }
      if (ids.length >= 3) {
        edges.push({ v1: ids[ids.length - 1], v2: ids[0] });
      }
    }
  }

  return edges;
}

export function getShapeVertexPositions(
  shape: FeatureShape,
  vertices: ReadonlyMap<string, Vertex>
): VertexPosition[] {
  if (shape.type === 'Point') {
    const vertex = vertices.get(shape.vertexId);
    return vertex ? [{ vertexId: shape.vertexId, x: vertex.x, y: vertex.y }] : [];
  }

  const positioned = new Map<string, VertexPosition>();
  let polygonReferenceLon: number | undefined;

  for (const group of getShapeVertexGroups(shape)) {
    const positions = resolveGroupPositions(
      group,
      vertices,
      shape.type === 'Polygon' ? polygonReferenceLon : undefined
    );
    if (shape.type === 'Polygon' && polygonReferenceLon === undefined && positions.length > 0) {
      polygonReferenceLon = positions[0].x;
    }

    for (const position of positions) {
      if (!positioned.has(position.vertexId)) {
        positioned.set(position.vertexId, position);
      }
    }
  }

  return [...positioned.values()];
}

export function getShapeEdgePositions(
  shape: FeatureShape,
  vertices: ReadonlyMap<string, Vertex>
): EdgePosition[] {
  const edges: EdgePosition[] = [];
  if (shape.type === 'Point') return edges;

  let polygonReferenceLon: number | undefined;

  for (const group of getShapeVertexGroups(shape)) {
    const positions = resolveGroupPositions(
      group,
      vertices,
      shape.type === 'Polygon' ? polygonReferenceLon : undefined
    );
    if (shape.type === 'Polygon' && polygonReferenceLon === undefined && positions.length > 0) {
      polygonReferenceLon = positions[0].x;
    }

    for (let i = 0; i < positions.length - 1; i++) {
      edges.push({
        v1: positions[i].vertexId,
        v2: positions[i + 1].vertexId,
        x1: positions[i].x,
        y1: positions[i].y,
        x2: positions[i + 1].x,
        y2: positions[i + 1].y,
      });
    }

    if (shape.type === 'Polygon' && positions.length >= 3) {
      const last = positions[positions.length - 1];
      const first = positions[0];
      edges.push({
        v1: last.vertexId,
        v2: first.vertexId,
        x1: last.x,
        y1: last.y,
        x2: first.x,
        y2: first.y,
      });
    }
  }

  return edges;
}
