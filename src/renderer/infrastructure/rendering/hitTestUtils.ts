/**
 * ヒットテスト（地物選択判定）ユーティリティ
 *
 * 要件定義書 §2.3.3.1: クリック位置に基づくアクティブ地物の選択
 *
 * 全判定は地理座標（lon/lat）ベースで行う。
 * ズームレベルに応じた閾値は呼び出し側で調整する。
 */

import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureAnchor, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { MapSceneEntry, PolygonRings } from '@presentation/components/mapSceneEntries';

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
  return getWrappedClickLongitudes(clickLon).some((candidateLon) =>
    geoDistance(candidateLon, clickLat, v.x, v.y) <= threshold
  );
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
  const coords = resolveRingCoords(shape.vertexIds, vertices);
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
 *
 * sceneEntries の `polygonRings` を直接受け取る。`polygonRings` は
 * `mapSceneEntries.collectMapSceneEntries` が解決済みで保持する座標列であり、
 * リーフは自身の shape、childIds 非空は派生形状（または fallback）に解決済み。
 * 描画 (`FeatureRenderer.getPolygonPath`) と wrapOffsets と同じ座標列を共有することで、
 * 「描画されているのに選択できない」「描画されていないのに選択できる」を構造的に排除する
 * （開発ガイド §6.6.9）。
 */
function hitTestPolygon(
  clickLon: number, clickLat: number,
  polygonRings: PolygonRings
): boolean {
  if (polygonRings.length === 0) return false;

  for (const candidateLon of getWrappedClickLongitudes(clickLon)) {
    // evenodd: 全リングの内外判定をトグルする
    let inside = false;
    for (const coords of polygonRings) {
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
 * @param sceneEntries 描画/入力で同時に扱う地物エントリ列（描画対象と一致）
 * @param vertices 全頂点
 * @param thresholdDeg 点/線のヒット閾値（度単位）
 * @returns ヒットした地物、なければ null
 *
 * 描画・ヒットテスト・頂点選択コンテキスト・wrapOffsets は同じ `sceneEntries` を参照する
 * （開発ガイド §6.1.2 / §6.6.9 / §6.0.1 検出観点2）。これにより「画面に描画されないが
 * クリック選択できる」状態が発生しない。Polygon-like の判定は `entry.polygonRings !== null`
 * で行い（MapSceneEntry 規約: Polygon entry は必ず non-null、Point/LineString は必ず null）、
 * `feature.featureType` をハードコードしない（§6.6.9 適用パターン: 判定をデータ側に寄せる）。
 * tie-break ポリシーは Phase 2.5-C で depth + DOM target 一致の 3 キー（開発ガイド §6.2.25
 * 採用ポリシー）として再設計する計画。
 */
export function hitTest(
  clickCoord: Coordinate,
  sceneEntries: readonly MapSceneEntry[],
  vertices: ReadonlyMap<string, Vertex>,
  thresholdDeg: number
): HitTestResult | null {
  const lon = clickCoord.x;
  const lat = clickCoord.y;

  for (const entry of sceneEntries) {
    const { feature, anchor } = entry;

    let hit = false;
    if (anchor.shape?.type === 'Point') {
      hit = hitTestPoint(lon, lat, anchor.shape, vertices, thresholdDeg);
    } else if (anchor.shape?.type === 'LineString') {
      hit = hitTestLine(lon, lat, anchor.shape, vertices, thresholdDeg);
    } else if (entry.polygonRings !== null) {
      hit = hitTestPolygon(lon, lat, entry.polygonRings);
    }

    if (hit) {
      return { featureId: feature.id, anchor };
    }
  }

  return null;
}
