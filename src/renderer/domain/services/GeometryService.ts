/**
 * 幾何演算ドメインサービス
 *
 * §5.2: GeometryService — 距離・面積計算、交差判定、内外判定、ブーリアン演算
 * §2.1: 面情報の排他性 — 同一レイヤー内のポリゴン重なり検出
 *
 * 座標系は地理座標（度単位）。正距円筒図法を前提とする。
 */

import type { Coordinate } from '@domain/value-objects/Coordinate';

/** 2Dベクトル */
interface Vec2 {
  x: number;
  y: number;
}

// ---- セグメント交差判定 ----

/**
 * 2線分が交差するか判定する
 * Returns true if segments (p1-p2) and (p3-p4) intersect (proper or touching).
 */
export function segmentsIntersect(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  p4x: number, p4y: number
): boolean {
  const d1 = cross(p3x, p3y, p4x, p4y, p1x, p1y);
  const d2 = cross(p3x, p3y, p4x, p4y, p2x, p2y);
  const d3 = cross(p1x, p1y, p2x, p2y, p3x, p3y);
  const d4 = cross(p1x, p1y, p2x, p2y, p4x, p4y);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // 同一線上の場合
  if (d1 === 0 && onSegment(p3x, p3y, p4x, p4y, p1x, p1y)) return true;
  if (d2 === 0 && onSegment(p3x, p3y, p4x, p4y, p2x, p2y)) return true;
  if (d3 === 0 && onSegment(p1x, p1y, p2x, p2y, p3x, p3y)) return true;
  if (d4 === 0 && onSegment(p1x, p1y, p2x, p2y, p4x, p4y)) return true;

  return false;
}

/** 外積: (b-a) × (c-a) */
function cross(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** 点cが線分ab上にあるか（同一線上を前提） */
function onSegment(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  return Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) &&
         Math.min(ay, by) <= cy && cy <= Math.max(ay, by);
}

// ---- ポリゴン操作 ----

/** リング（頂点座標配列）型 */
export type RingCoords = readonly Vec2[];

/**
 * 点がポリゴン（リング）の内部にあるか判定（ray casting）
 * 既存の hitTestUtils.isPointInRing と同等だが、Coordinate入力版
 */
export function isPointInPolygon(
  px: number, py: number,
  ring: RingCoords
): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
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
 * 2つのポリゴンリングの辺が交差するか判定する
 * §2.1: 面情報の排他性の基礎判定
 *
 * 隣接辺の共有端点での接触は交差に含めない。
 */
export function ringsEdgesIntersect(
  ringA: RingCoords,
  ringB: RingCoords
): boolean {
  const nA = ringA.length;
  const nB = ringB.length;

  for (let i = 0; i < nA; i++) {
    const a1 = ringA[i];
    const a2 = ringA[(i + 1) % nA];
    for (let j = 0; j < nB; j++) {
      const b1 = ringB[j];
      const b2 = ringB[(j + 1) % nB];

      // 共有端点は交差に含めない
      if (isSamePoint(a1, b1) || isSamePoint(a1, b2) ||
          isSamePoint(a2, b1) || isSamePoint(a2, b2)) {
        continue;
      }

      if (segmentsIntersect(
        a1.x, a1.y, a2.x, a2.y,
        b1.x, b1.y, b2.x, b2.y
      )) {
        return true;
      }
    }
  }
  return false;
}

function isSamePoint(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * ポリゴンAがポリゴンBの内部に完全に含まれるか判定する
 * （Aの全頂点がBの内部にあり、辺が交差しない）
 */
export function isRingContainedIn(
  inner: RingCoords,
  outer: RingCoords
): boolean {
  // 辺が交差する場合は包含ではない
  if (ringsEdgesIntersect(inner, outer)) return false;

  // 内側リングの全頂点が外側リングの内部にあるか
  for (const p of inner) {
    if (!isPointInPolygon(p.x, p.y, outer)) return false;
  }
  return true;
}

/**
 * 2つのポリゴンリングが空間的に重なるか判定する
 * §2.1: 同一レイヤー内のポリゴン重なり検出
 *
 * 重なり = 辺の交差 OR 一方が他方を包含
 * 境界の接触（共有辺・共有頂点）は重なりに含めない。
 */
export function ringsOverlap(
  ringA: RingCoords,
  ringB: RingCoords
): boolean {
  // 辺の交差チェック
  if (ringsEdgesIntersect(ringA, ringB)) return true;

  // 包含チェック（A⊂B or B⊂A）
  // 一方の任意の頂点が他方の内部にあれば包含
  if (ringA.length > 0 && isPointInPolygon(ringA[0].x, ringA[0].y, ringB)) {
    return true;
  }
  if (ringB.length > 0 && isPointInPolygon(ringB[0].x, ringB[0].y, ringA)) {
    return true;
  }

  return false;
}

/**
 * ポリゴンが自己交差しているか判定する
 * §2.1: 衝突判定アルゴリズム — 自己交差チェック
 */
export function isSelfIntersecting(ring: RingCoords): boolean {
  const n = ring.length;
  if (n < 4) return false; // 3頂点以下は自己交差不可能

  for (let i = 0; i < n; i++) {
    const a1 = ring[i];
    const a2 = ring[(i + 1) % n];
    // i+2から始めて隣接辺をスキップ
    for (let j = i + 2; j < n; j++) {
      // 最初のエッジと最後のエッジは隣接なのでスキップ
      if (i === 0 && j === n - 1) continue;

      const b1 = ring[j];
      const b2 = ring[(j + 1) % n];

      if (segmentsIntersect(
        a1.x, a1.y, a2.x, a2.y,
        b1.x, b1.y, b2.x, b2.y
      )) {
        return true;
      }
    }
  }
  return false;
}

// ---- エッジ投影 ----

/**
 * 点からエッジへの最近接投影点を計算する
 * §2.1: エッジ沿いの滑り処理で使用
 *
 * @returns 投影点の座標と、エッジ上のパラメータt (0-1)
 */
export function projectPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): { x: number; y: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { x: ax, y: ay, t: 0 };
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: ax + t * dx,
    y: ay + t * dy,
    t,
  };
}

/**
 * ポリゴンの面積を計算する（Shoelace formula）
 * 正の値 = 反時計回り、負の値 = 時計回り
 */
export function signedArea(ring: RingCoords): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  }
  return area / 2;
}

/**
 * ポリゴンの面積（絶対値）
 */
export function polygonArea(ring: RingCoords): number {
  return Math.abs(signedArea(ring));
}

/**
 * 2点間のユークリッド距離
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}
