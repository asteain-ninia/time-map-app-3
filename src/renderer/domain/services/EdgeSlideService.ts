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
  /** 滑っているエッジのインデックス（なければ null） */
  readonly edgeIndex: number | null;
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
  obstacles: readonly RingCoords[]
): SlideResult {
  // 移動先がどの障害物ポリゴンの内部にも入らなければそのまま
  let collidingRing: RingCoords | null = null;
  for (const ring of obstacles) {
    if (isPointInPolygon(targetX, targetY, ring)) {
      collidingRing = ring;
      break;
    }
  }

  if (!collidingRing) {
    return { x: targetX, y: targetY, didSlide: false, edgeIndex: null };
  }

  // 最も近いエッジを見つけて投影する
  return findNearestEdgeProjection(targetX, targetY, collidingRing);
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
