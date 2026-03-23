/**
 * ナイフツール（分割）ドメインサービス
 *
 * §2.3.3.2: ナイフツール — 二分割/閉線分割ロジック
 *
 * 面情報を分断線によって2つの面に分割する。
 * - 二分割: 分断線（開いたパス）が面を横断 → polygon-clipping の差分/交差で2片を得る
 * - 閉線分割: 分断線が閉じた形状 → 閉線内側と外側に分割
 *
 * 穴リング横切り時の処理も含む（polygon-clipping が自動的に処理する）。
 */

import polygonClipping from 'polygon-clipping';
import type { RingCoords } from './GeometryService';
import { polygonArea, segmentsIntersect, isPointInPolygon } from './GeometryService';
import {
  toClipPolygon,
  fromClipPolygon,
  polygonDifference,
  polygonIntersection,
} from './BooleanOperationService';

/** 分割結果 */
export interface KnifeSplitResult {
  /** 分割が成功したか */
  readonly success: boolean;
  /** 分割片A（通常は大きい方） */
  readonly pieceA: readonly RingCoords[];
  /** 分割片B（通常は小さい方） */
  readonly pieceB: readonly RingCoords[];
  /** エラーメッセージ（失敗時） */
  readonly error?: string;
}

/** 分断線のバリデーション結果 */
export interface KnifeValidation {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * 分断線（開いたパス）を幅を持ったポリゴンに拡張する
 *
 * 分断線の左側/右側を区別するために、分断線を中心とした
 * 非常に薄いポリゴンを生成する。実際の分割には別アプローチを使用。
 */

/**
 * 分断線の法線方向にオフセットしたパスを生成する
 */
function offsetPath(
  line: readonly { x: number; y: number }[],
  offset: number
): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = i > 0 ? line[i - 1] : null;
    const curr = line[i];
    const next = i < line.length - 1 ? line[i + 1] : null;

    // 法線ベクトルを計算
    let nx = 0, ny = 0;
    if (prev && next) {
      // 前後の辺の法線の平均
      const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
      const n1 = normalize(-dy1, dx1);
      const n2 = normalize(-dy2, dx2);
      nx = (n1.x + n2.x) / 2;
      ny = (n1.y + n2.y) / 2;
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 0) { nx /= len; ny /= len; }
    } else if (next) {
      const dx = next.x - curr.x, dy = next.y - curr.y;
      const n = normalize(-dy, dx);
      nx = n.x; ny = n.y;
    } else if (prev) {
      const dx = curr.x - prev.x, dy = curr.y - prev.y;
      const n = normalize(-dy, dx);
      nx = n.x; ny = n.y;
    }

    result.push({ x: curr.x + nx * offset, y: curr.y + ny * offset });
  }
  return result;
}

function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * 分断線から左右を分ける「切断ポリゴン」を生成する
 *
 * 分断線を大きく一方向にオフセットし、分断線の「片側」を覆う
 * 巨大なポリゴンを作る。
 */
function buildHalfPlane(
  line: readonly { x: number; y: number }[],
  side: 'left' | 'right',
  extent: number
): RingCoords {
  const offset = side === 'left' ? extent : -extent;
  const offsetted = offsetPath(line, offset);

  // 分断線 + オフセット線を逆順で閉じたポリゴンを作る
  // line の順方向 → offsetの逆方向
  const poly: { x: number; y: number }[] = [
    ...line,
    ...offsetted.reverse(),
  ];
  return poly;
}

/**
 * 二分割: 開いた分断線でポリゴンを2つに分割する
 *
 * §2.3.3.2: ナイフツールで面を横断する分断線を作成
 *
 * @param polygon 分割対象ポリゴンのリング群（外周 + 穴）
 * @param cuttingLine 分断線の座標列（2点以上）
 * @returns 分割結果
 */
export function splitByLine(
  polygon: readonly RingCoords[],
  cuttingLine: readonly { x: number; y: number }[]
): KnifeSplitResult {
  const validation = validateCuttingLine(polygon, cuttingLine, false);
  if (!validation.valid) {
    return { success: false, pieceA: [], pieceB: [], error: validation.error };
  }

  // 分断線の左右の半平面ポリゴンを作り、
  // polygon と各半平面の交差で2片を得る
  const extent = computeExtent(polygon) * 2;

  const leftHalf = buildHalfPlane(cuttingLine, 'left', extent);
  const rightHalf = buildHalfPlane(cuttingLine, 'right', extent);

  const pieceAResult = polygonIntersection(polygon, [leftHalf]);
  const pieceBResult = polygonIntersection(polygon, [rightHalf]);

  if (pieceAResult.isEmpty || pieceBResult.isEmpty) {
    return {
      success: false,
      pieceA: [],
      pieceB: [],
      error: '分断線がポリゴンを2つに分割していません',
    };
  }

  // 各片のリング群を取得（最大のポリゴンを採用）
  const pieceA = selectLargestPolygon(pieceAResult.polygons);
  const pieceB = selectLargestPolygon(pieceBResult.polygons);

  return { success: true, pieceA, pieceB };
}

/**
 * 閉線分割: 閉じた分断線でポリゴンを内側と外側に分割する
 *
 * §2.3.3.2: ナイフツール（閉線分割）— 任意の閉じた形状で分割
 *
 * @param polygon 分割対象ポリゴンのリング群
 * @param closedLine 閉じた分断線（始点と終点が接続）
 * @returns 分割結果（pieceA=外側、pieceB=内側）
 */
export function splitByClosed(
  polygon: readonly RingCoords[],
  closedLine: readonly { x: number; y: number }[]
): KnifeSplitResult {
  const validation = validateCuttingLine(polygon, closedLine, true);
  if (!validation.valid) {
    return { success: false, pieceA: [], pieceB: [], error: validation.error };
  }

  // 閉線の内側 = polygon ∩ closedLine
  const insideResult = polygonIntersection(polygon, [closedLine]);
  // 閉線の外側 = polygon - closedLine
  const outsideResult = polygonDifference(polygon, [closedLine]);

  if (insideResult.isEmpty || outsideResult.isEmpty) {
    return {
      success: false,
      pieceA: [],
      pieceB: [],
      error: '閉線がポリゴンを2つに分割していません',
    };
  }

  const pieceA = selectLargestPolygon(outsideResult.polygons); // 外側
  const pieceB = selectLargestPolygon(insideResult.polygons);  // 内側

  return { success: true, pieceA, pieceB };
}

/**
 * 分断線のバリデーション
 *
 * @param polygon 対象ポリゴン
 * @param line 分断線
 * @param isClosed 閉線かどうか
 */
export function validateCuttingLine(
  polygon: readonly RingCoords[],
  line: readonly { x: number; y: number }[],
  isClosed: boolean
): KnifeValidation {
  if (line.length < 2) {
    return { valid: false, error: '分断線には2点以上が必要です' };
  }

  if (isClosed && line.length < 3) {
    return { valid: false, error: '閉線には3点以上が必要です' };
  }

  if (polygon.length === 0 || polygon[0].length < 3) {
    return { valid: false, error: '有効なポリゴンが必要です' };
  }

  if (!isClosed) {
    // 二分割: 分断線がポリゴンの外周と少なくとも2回交差するか確認
    const outerRing = polygon[0];
    const intersections = countLineRingIntersections(line, outerRing);
    if (intersections < 2) {
      return { valid: false, error: '分断線がポリゴンを横断していません（外周と2回以上交差する必要があります）' };
    }
  } else {
    // 閉線: 閉線の少なくとも一部がポリゴン内部にあるか確認
    const outerRing = polygon[0];
    const hasInside = line.some(p => isPointInPolygon(p.x, p.y, outerRing));
    if (!hasInside) {
      return { valid: false, error: '閉線がポリゴン内部に含まれていません' };
    }
  }

  return { valid: true };
}

/**
 * 分断線とリングの交差回数を数える
 */
function countLineRingIntersections(
  line: readonly { x: number; y: number }[],
  ring: RingCoords
): number {
  let count = 0;
  const nRing = ring.length;

  for (let i = 0; i < line.length - 1; i++) {
    const l1 = line[i];
    const l2 = line[i + 1];
    for (let j = 0; j < nRing; j++) {
      const r1 = ring[j];
      const r2 = ring[(j + 1) % nRing];
      if (segmentsIntersect(l1.x, l1.y, l2.x, l2.y, r1.x, r1.y, r2.x, r2.y)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * ポリゴン群の中から面積最大のものを選択する
 */
function selectLargestPolygon(
  polygons: readonly (readonly RingCoords[])[]
): RingCoords[] {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return polygons[0].map(r => [...r]);

  let maxArea = -1;
  let maxIdx = 0;
  for (let i = 0; i < polygons.length; i++) {
    const area = polygons[i].length > 0 ? polygonArea(polygons[i][0]) : 0;
    if (area > maxArea) {
      maxArea = area;
      maxIdx = i;
    }
  }
  return polygons[maxIdx].map(r => [...r]);
}

/**
 * ポリゴンの外接矩形の対角線長を計算（エクステント）
 */
function computeExtent(polygon: readonly RingCoords[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of polygon) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  return Math.sqrt(dx * dx + dy * dy);
}
