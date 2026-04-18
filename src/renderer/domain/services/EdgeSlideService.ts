/**
 * エッジ滑り処理サービス
 *
 * §2.1: 面情報の排他性 — エッジ沿いの滑り処理
 *
 * 頂点がポリゴンのエッジに接触した際、エッジに沿って「滑る」動作を実装する。
 * - エッジ上への垂直投影点を計算
 * - ドラッグ方向とエッジの方向ベクトルの内積で移動方向を決定
 * - エッジ端（頂点）到達時は次のエッジへ自動遷移
 */

import {
  projectPointOnSegment,
  isPointInPolygon,
  type RingCoords,
} from './GeometryService';

/** エッジ滑り結果 */
export interface SlideResult {
  /** 滑り後の座標 */
  readonly x: number;
  readonly y: number;
  /** 滑りが発生したか */
  readonly didSlide: boolean;
  /** 障害物を横切るため移動を拒否したか */
  readonly blocked?: boolean;
  /** 滑っているエッジのインデックス（なければ null） */
  readonly edgeIndex: number | null;
}

interface Point2 {
  readonly x: number;
  readonly y: number;
}

interface SegmentHit {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly edgeIndex: number;
  readonly ring: RingCoords;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/**
 * 移動先がポリゴン内部に入る場合、最も近いエッジに沿って滑らせる
 *
 * @param targetX 移動先X座標
 * @param targetY 移動先Y座標
 * @param obstacles 障害物ポリゴンのリング座標配列
 * @returns 滑り処理後の座標
 */
export function slideAlongEdge(
  targetX: number,
  targetY: number,
  obstacles: readonly RingCoords[],
  source?: { readonly x: number; readonly y: number }
): SlideResult {
  const firstHit = source
    ? findFirstSegmentRingIntersection(source.x, source.y, targetX, targetY, obstacles)
    : null;

  // 移動先がどの障害物ポリゴンの内部にも入らなければそのまま
  let collidingRing: RingCoords | null = null;
  for (const ring of obstacles) {
    if (isPointInPolygon(targetX, targetY, ring)) {
      collidingRing = ring;
      break;
    }
  }

  if (firstHit) {
    return slideFromSegmentHit(firstHit, targetX, targetY);
  }

  if (!collidingRing) {
    return { x: targetX, y: targetY, didSlide: false, edgeIndex: null };
  }

  if (source && isPointOnRingBoundary(source.x, source.y, collidingRing)) {
    const boundarySlide = findBoundarySlideProjection(
      source.x,
      source.y,
      targetX,
      targetY,
      collidingRing
    );
    if (boundarySlide && !isSamePointWithinEpsilon(boundarySlide, source)) {
      return {
        x: boundarySlide.x,
        y: boundarySlide.y,
        didSlide: true,
        edgeIndex: boundarySlide.edgeIndex,
      };
    }

    return {
      x: source.x,
      y: source.y,
      didSlide: false,
      blocked: true,
      edgeIndex: null,
    };
  }

  // 最も近いエッジを見つけて投影する
  return findNearestEdgeProjection(targetX, targetY, collidingRing);
}

function isPointOnRingBoundary(px: number, py: number, ring: RingCoords): boolean {
  const epsilon = 1e-9;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const projection = projectPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    const dx = px - projection.x;
    const dy = py - projection.y;
    if (dx * dx + dy * dy <= epsilon * epsilon) {
      return true;
    }
  }
  return false;
}

function findBoundarySlideProjection(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  ring: RingCoords
): (Point2 & { readonly edgeIndex: number }) | null {
  const epsilon = 1e-9;
  let bestProjection: (Point2 & { readonly edgeIndex: number }) | null = null;
  let bestDistance = Infinity;

  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const sourceProjection = projectPointOnSegment(sourceX, sourceY, a.x, a.y, b.x, b.y);
    const sourceDx = sourceX - sourceProjection.x;
    const sourceDy = sourceY - sourceProjection.y;
    if (sourceDx * sourceDx + sourceDy * sourceDy > epsilon * epsilon) {
      continue;
    }

    const targetProjection = projectPointOnSegment(targetX, targetY, a.x, a.y, b.x, b.y);
    const targetDx = targetX - targetProjection.x;
    const targetDy = targetY - targetProjection.y;
    const distance = targetDx * targetDx + targetDy * targetDy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProjection = {
        x: targetProjection.x,
        y: targetProjection.y,
        edgeIndex: index,
      };
    }
  }

  return bestProjection;
}

function isSamePointWithinEpsilon(
  a: Point2,
  b: Point2,
  epsilon: number = 1e-9
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= epsilon * epsilon;
}

function findFirstSegmentRingIntersection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  obstacles: readonly RingCoords[]
): SegmentHit | null {
  let bestHit: SegmentHit | null = null;

  for (const ring of obstacles) {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      const hit = getSegmentIntersection(
        startX,
        startY,
        endX,
        endY,
        a.x,
        a.y,
        b.x,
        b.y
      );

      if (!hit) {
        continue;
      }

      if (!bestHit || hit.t < bestHit.t) {
        bestHit = {
          ...hit,
          edgeIndex: index,
          ring,
          ax: a.x,
          ay: a.y,
          bx: b.x,
          by: b.y,
        };
      }
    }
  }

  return bestHit;
}

function getSegmentIntersection(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number
): { readonly x: number; readonly y: number; readonly t: number } | null {
  const epsilon = 1e-9;
  const rx = p2x - p1x;
  const ry = p2y - p1y;
  const sx = q2x - q1x;
  const sy = q2y - q1y;
  const denominator = cross2(rx, ry, sx, sy);
  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const qpx = q1x - p1x;
  const qpy = q1y - p1y;
  const t = cross2(qpx, qpy, sx, sy) / denominator;
  const u = cross2(qpx, qpy, rx, ry) / denominator;

  if (t <= epsilon || t >= 1 - epsilon || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return {
    x: p1x + t * rx,
    y: p1y + t * ry,
    t,
  };
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function slideFromSegmentHit(
  hit: SegmentHit,
  targetX: number,
  targetY: number
): SlideResult {
  const projected = projectRemainingMoveAlongSegment(
    hit.x,
    hit.y,
    targetX,
    targetY,
    hit.ax,
    hit.ay,
    hit.bx,
    hit.by
  );

  return {
    x: projected.x,
    y: projected.y,
    didSlide: true,
    edgeIndex: hit.edgeIndex,
  };
}

function projectRemainingMoveAlongSegment(
  contactX: number,
  contactY: number,
  targetX: number,
  targetY: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): Point2 {
  const epsilon = 1e-9;
  const edgeX = bx - ax;
  const edgeY = by - ay;
  const edgeLengthSq = edgeX * edgeX + edgeY * edgeY;
  if (edgeLengthSq <= epsilon * epsilon) {
    return { x: contactX, y: contactY };
  }

  const remainingX = targetX - contactX;
  const remainingY = targetY - contactY;
  const scalar = (remainingX * edgeX + remainingY * edgeY) / edgeLengthSq;
  const projectedX = contactX + scalar * edgeX;
  const projectedY = contactY + scalar * edgeY;
  return projectPointOnSegment(projectedX, projectedY, ax, ay, bx, by);
}

/**
 * ポリゴンの最も近いエッジへの投影点を計算する
 */
function findNearestEdgeProjection(
  px: number, py: number,
  ring: RingCoords
): SlideResult {
  let bestDist = Infinity;
  let bestX = px;
  let bestY = py;
  let bestEdgeIndex: number | null = null;

  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];

    const proj = projectPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    const dx = px - proj.x;
    const dy = py - proj.y;
    const dist = dx * dx + dy * dy;

    if (dist < bestDist) {
      bestDist = dist;
      bestX = proj.x;
      bestY = proj.y;
      bestEdgeIndex = i;
    }
  }

  return {
    x: bestX,
    y: bestY,
    didSlide: true,
    edgeIndex: bestEdgeIndex,
  };
}

/**
 * エッジに沿った方向への移動を計算する
 * §2.1: ドラッグ方向とエッジの方向ベクトルの内積を使用
 *
 * @param currentX 現在のX座標（エッジ上の点）
 * @param currentY 現在のY座標
 * @param dragDirX ドラッグ方向X
 * @param dragDirY ドラッグ方向Y
 * @param ring 滑っているポリゴンのリング
 * @param edgeIndex 現在のエッジインデックス
 * @param moveAmount 移動量
 * @returns 移動後の座標
 */
export function moveAlongEdge(
  currentX: number, currentY: number,
  dragDirX: number, dragDirY: number,
  ring: RingCoords,
  edgeIndex: number,
  moveAmount: number
): SlideResult {
  const n = ring.length;
  const a = ring[edgeIndex];
  const b = ring[(edgeIndex + 1) % n];

  // エッジの方向ベクトル
  const edgeDx = b.x - a.x;
  const edgeDy = b.y - a.y;
  const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

  if (edgeLen === 0) {
    return { x: currentX, y: currentY, didSlide: true, edgeIndex };
  }

  // 正規化エッジ方向
  const edgeNx = edgeDx / edgeLen;
  const edgeNy = edgeDy / edgeLen;

  // ドラッグ方向とエッジ方向の内積で移動方向を決定
  const dot = dragDirX * edgeNx + dragDirY * edgeNy;
  const signedMove = dot >= 0 ? moveAmount : -moveAmount;

  // 現在位置からのエッジパラメータ
  const proj = projectPointOnSegment(currentX, currentY, a.x, a.y, b.x, b.y);
  const newT = proj.t + (signedMove / edgeLen);

  if (newT >= 0 && newT <= 1) {
    // エッジ内で移動完了
    return {
      x: a.x + newT * edgeDx,
      y: a.y + newT * edgeDy,
      didSlide: true,
      edgeIndex,
    };
  }

  // §2.1: エッジの端に到達 → 次のエッジへ遷移
  if (newT > 1) {
    // 終点方向 → 次のエッジへ
    const nextEdge = (edgeIndex + 1) % n;
    const nextB = ring[(nextEdge + 1) % n];
    return {
      x: b.x,
      y: b.y,
      didSlide: true,
      edgeIndex: nextEdge,
    };
  } else {
    // 始点方向 → 前のエッジへ
    const prevEdge = (edgeIndex - 1 + n) % n;
    return {
      x: a.x,
      y: a.y,
      didSlide: true,
      edgeIndex: prevEdge,
    };
  }
}
