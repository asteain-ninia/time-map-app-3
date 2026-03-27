/**
 * ヒットテスト（地物選択判定）ユーティリティ
 *
 * 要件定義書 §2.3.3.1: クリック位置に基づくアクティブ地物の選択
 *
 * 全判定は地理座標（lon/lat）ベースで行う。
 * ズームレベルに応じた閾値は呼び出し側で調整する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { Layer } from '@domain/entities/Layer';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { FeatureAnchor, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import { unwrapLongitudeSequence } from './featureRenderingUtils';

/** ヒットテスト結果 */
export interface HitTestResult {
  featureId: string;
  anchor: FeatureAnchor;
}

/**
 * 点と点の距離（地理座標、度単位の2D距離）
 */
export function geoDistance(
  lon1: number, lat1: number,
  lon2: number, lat2: number
): number {
  const dx = lon1 - lon2;
  const dy = lat1 - lat2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 点から線分への最短距離
 */
export function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return geoDistance(px, py, ax, ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return geoDistance(px, py, projX, projY);
}

/**
 * 点がポリゴン（リング）の内部にあるか判定（ray casting）
 */
export function isPointInRing(
  px: number, py: number,
  ringCoords: readonly Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  const n = ringCoords.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ringCoords[i].x, yi = ringCoords[i].y;
    const xj = ringCoords[j].x, yj = ringCoords[j].y;
    if (
      ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * リングの頂点IDリストを座標配列に変換
 */
function resolveRingCoords(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): Array<{ x: number; y: number }> {
  const coords: Array<{ x: number; y: number }> = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) coords.push({ x: v.x, y: v.y });
  }
  return coords;
}

/** リング座標列を東西端またぎ込みで連続化する */
function unwrapRingCoords(
  coords: readonly Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  const longitudes = unwrapLongitudeSequence(coords.map((coord) => coord.x));
  return coords.map((coord, index) => ({ x: longitudes[index], y: coord.y }));
}

/** クリック経度の候補（中央世界と隣接ラップ） */
function getWrappedClickLongitudes(lon: number): number[] {
  return [lon, lon - 360, lon + 360];
}

/**
 * 点情報のヒットテスト
 */
function hitTestPoint(
  clickLon: number, clickLat: number,
  shape: FeatureShape & { type: 'Point' },
  vertices: ReadonlyMap<string, Vertex>,
  threshold: number
): boolean {
  const v = vertices.get(shape.vertexId);
  if (!v) return false;
  return geoDistance(clickLon, clickLat, v.x, v.y) <= threshold;
}

/**
 * 線情報のヒットテスト
 */
function hitTestLine(
  clickLon: number, clickLat: number,
  shape: FeatureShape & { type: 'LineString' },
  vertices: ReadonlyMap<string, Vertex>,
  threshold: number
): boolean {
  const coords = unwrapRingCoords(resolveRingCoords(shape.vertexIds, vertices));
  if (coords.length < 2) return false;

  for (const candidateLon of getWrappedClickLongitudes(clickLon)) {
    for (let i = 0; i < coords.length - 1; i++) {
      const dist = pointToSegmentDistance(
        candidateLon, clickLat,
        coords[i].x, coords[i].y,
        coords[i + 1].x, coords[i + 1].y
      );
      if (dist <= threshold) return true;
    }
  }
  return false;
}

/**
 * 面情報のヒットテスト（evenodd判定）
 */
function hitTestPolygon(
  clickLon: number, clickLat: number,
  shape: FeatureShape & { type: 'Polygon' },
  vertices: ReadonlyMap<string, Vertex>
): boolean {
  for (const candidateLon of getWrappedClickLongitudes(clickLon)) {
    // evenodd: 全リングの内外判定をトグルする
    let inside = false;
    for (const ring of shape.rings) {
      const coords = unwrapRingCoords(resolveRingCoords(ring.vertexIds, vertices));
      if (coords.length < 3) continue;
      if (isPointInRing(candidateLon, clickLat, coords)) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

/**
 * クリック位置に最も近い地物を特定する
 *
 * @param clickCoord クリック位置の地理座標
 * @param features 全地物
 * @param vertices 全頂点
 * @param layers 全レイヤー
 * @param currentTime 現在時刻
 * @param thresholdDeg 点/線のヒット閾値（度単位）
 * @returns ヒットした地物、なければ null
 */
export function hitTest(
  clickCoord: Coordinate,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  layers: readonly Layer[],
  currentTime: TimePoint,
  thresholdDeg: number
): HitTestResult | null {
  const lon = clickCoord.x;
  const lat = clickCoord.y;

  // 表示中レイヤーをorder降順（上のレイヤーが優先）
  const visibleLayerIds = new Set(
    layers.filter((l) => l.visible).map((l) => l.id)
  );

  // 上のレイヤーから順に検索するため、order降順でソートされた
  // レイヤーIDの優先度マップを作成
  const layerPriority = new Map<string, number>();
  for (const l of layers) {
    if (l.visible) layerPriority.set(l.id, l.order);
  }

  // 候補を収集
  const candidates: Array<{
    featureId: string;
    anchor: FeatureAnchor;
    layerOrder: number;
  }> = [];

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) continue;
    if (!visibleLayerIds.has(anchor.placement.layerId)) continue;

    let hit = false;
    if (anchor.shape.type === 'Point') {
      hit = hitTestPoint(lon, lat, anchor.shape, vertices, thresholdDeg);
    } else if (anchor.shape.type === 'LineString') {
      hit = hitTestLine(lon, lat, anchor.shape, vertices, thresholdDeg);
    } else if (anchor.shape.type === 'Polygon') {
      hit = hitTestPolygon(lon, lat, anchor.shape, vertices);
    }

    if (hit) {
      candidates.push({
        featureId: feature.id,
        anchor,
        layerOrder: layerPriority.get(anchor.placement.layerId) ?? 0,
      });
    }
  }

  if (candidates.length === 0) return null;

  // 上のレイヤー（order大）を優先
  candidates.sort((a, b) => b.layerOrder - a.layerOrder);
  return {
    featureId: candidates[0].featureId,
    anchor: candidates[0].anchor,
  };
}
