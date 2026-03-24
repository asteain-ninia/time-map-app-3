import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';

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
