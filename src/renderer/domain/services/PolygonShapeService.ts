import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import {
  isPointInPolygon,
  polygonArea,
  type RingCoords,
} from './GeometryService';

export interface PolygonRingDraft {
  readonly id: string;
  readonly coords: RingCoords;
  readonly ringType: 'territory' | 'hole';
  readonly parentId: string | null;
}

/**
 * Polygon shape のリングを polygon-clipping 互換の
 * 「1 territory + 直下の holes」単位へ変換する。
 *
 * 警告（退化データでの挙動差）: 欠落頂点を `{ x: 0, y: 0 }` で埋め、3 頂点未満の退化
 * リングも除外しないため、退化データでは原点へ飛んだ偽頂点入りの polygon を返す。
 * `HierarchyService.resolvePolygonAnchorPolygons` は同じ構造化を「欠落頂点 skip +
 * 3 頂点未満除外」の filter 規則で行っており、両者は退化データで非対称（開発ガイド
 * §6.6.9 のドリフト類型）。既存 consumer（ナイフ確定可否判定 / `SplitFeatureCommand` /
 * `MergeFeatureCommand`）は現挙動でテスト固定されているため維持するが、**新規経路は
 * 本関数ではなく `HierarchyService.resolvePolygonAnchorPolygons` を検討すること**。
 * 結合・分割経路自体の刷新は Phase 4-6/4-7（現状.md §6.10）の射程。
 */
export function resolvePolygonShapePolygons(
  shape: FeatureShape & { type: 'Polygon' },
  vertices: ReadonlyMap<string, Vertex>
): RingCoords[][] {
  const rings = shape.rings.map((ring) => ({
    ringId: ring.id,
    ringType: ring.ringType,
    parentId: ring.parentId,
    coords: ring.vertexIds.map((vid) => {
      const vertex = vertices.get(vid);
      return vertex ? { x: vertex.x, y: vertex.y } : { x: 0, y: 0 };
    }),
  }));

  const holesByParentId = new Map<string, RingCoords[]>();
  for (const ring of rings) {
    if (ring.ringType !== 'hole' || ring.parentId === null) continue;
    if (!holesByParentId.has(ring.parentId)) {
      holesByParentId.set(ring.parentId, []);
    }
    holesByParentId.get(ring.parentId)!.push(ring.coords);
  }

  return rings
    .filter((ring) => ring.ringType === 'territory')
    .map((ring) => [ring.coords, ...(holesByParentId.get(ring.ringId) ?? [])]);
}

export function buildPolygonRingDrafts(
  polygons: readonly (readonly RingCoords[])[],
  createRingId: () => string
): PolygonRingDraft[] {
  const drafts: PolygonRingDraft[] = [];

  for (const polygon of polygons) {
    let territoryRingId: string | null = null;
    for (let i = 0; i < polygon.length; i++) {
      const coords = polygon[i];
      const ringId = createRingId();
      if (i === 0) {
        territoryRingId = ringId;
        drafts.push({ id: ringId, coords, ringType: 'territory', parentId: null });
      } else {
        drafts.push({ id: ringId, coords, ringType: 'hole', parentId: territoryRingId });
      }
    }
  }

  return drafts;
}

export function rebuildTerritoryHierarchy(
  drafts: readonly PolygonRingDraft[]
): PolygonRingDraft[] {
  const holes = drafts.filter((draft) => draft.ringType === 'hole');
  return drafts.map((draft) => {
    if (draft.ringType !== 'territory') {
      return draft;
    }

    const containingHole = holes
      .filter((hole) => isRingStrictlyInsideRing(draft.coords, hole.coords))
      .toSorted((a, b) => polygonArea(a.coords) - polygonArea(b.coords))[0];

    return containingHole
      ? { ...draft, parentId: containingHole.id }
      : { ...draft, parentId: null };
  });
}

function isRingStrictlyInsideRing(inner: RingCoords, outer: RingCoords): boolean {
  return inner.length > 0 && inner.every((point) => isPointInPolygon(point.x, point.y, outer));
}
