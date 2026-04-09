/**
 * ブーリアン演算ドメインサービス
 *
 * §2.2.3: 整合性維持プロセス — ブーリアン演算による空間的競合解決
 * §5.3.1: ResolveFeatureAnchorConflictsUseCase — 差分演算
 *
 * polygon-clipping ライブラリをラップし、ドメインの RingCoords 型と相互変換する。
 * 競合解決時に「非優先ポリゴン - 優先ポリゴン」の差分を計算する。
 */

import polygonClipping from 'polygon-clipping';
import type { RingCoords } from './GeometryService';

/** ブーリアン演算結果 */
export interface BooleanResult {
  /** 結果のポリゴン群（空なら完全に削除された） */
  readonly polygons: readonly RingCoords[][];
  /** 結果が空か（完全削除） */
  readonly isEmpty: boolean;
}

interface LongitudeBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * RingCoords をpolygon-clippingのRing形式に変換する
 *
 * polygon-clipping: [x, y][] の配列（閉じたリング = 最初と最後が同じ）
 * RingCoords: {x, y}[] の配列（開いたリング）
 */
export function toClipRing(ring: RingCoords): [number, number][] {
  const result: [number, number][] = ring.map(p => [p.x, p.y]);
  // polygon-clipping は閉じたリングを期待する
  if (result.length > 0) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      result.push([first[0], first[1]]);
    }
  }
  return result;
}

/**
 * polygon-clippingのRing形式をRingCoordsに変換する
 *
 * 閉じたリングを開いたリングに変換（最後の頂点を除去）
 */
export function fromClipRing(clipRing: [number, number][]): RingCoords {
  if (clipRing.length <= 1) return [];
  // 閉じたリングなら最後の重複を除去
  const last = clipRing[clipRing.length - 1];
  const first = clipRing[0];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  const points = isClosed ? clipRing.slice(0, -1) : clipRing;
  return points.map(([x, y]) => ({ x, y }));
}

/**
 * ポリゴン（リング群）をpolygon-clippingのPolygon形式に変換する
 *
 * @param rings リング座標配列（外部リング + 穴リング群）
 */
export function toClipPolygon(rings: readonly RingCoords[]): [number, number][][] {
  return rings.map(ring => toClipRing(ring));
}

/**
 * polygon-clippingのPolygon形式をリング座標配列に変換する
 */
export function fromClipPolygon(clipPolygon: [number, number][][]): RingCoords[] {
  return clipPolygon.map(ring => fromClipRing(ring));
}

export function shiftRingCoords(
  rings: readonly RingCoords[],
  deltaLongitude: number
): RingCoords[] {
  return rings.map((ring) =>
    ring.map((point) => ({ x: point.x + deltaLongitude, y: point.y }))
  );
}

export function findOverlappingLongitudeShift(
  reference: readonly RingCoords[],
  target: readonly RingCoords[]
): number | null {
  for (const shift of buildLongitudeShiftCandidates(reference, target)) {
    if (!polygonIntersection(reference, shiftRingCoords(target, shift)).isEmpty) {
      return shift;
    }
  }
  return null;
}

function buildLongitudeShiftCandidates(
  reference: readonly RingCoords[],
  target: readonly RingCoords[]
): number[] {
  const referenceBounds = getLongitudeBounds(reference);
  const targetBounds = getLongitudeBounds(target);
  if (!referenceBounds || !targetBounds) {
    return [0];
  }

  const referenceCenter = (referenceBounds.min + referenceBounds.max) / 2;
  const targetCenter = (targetBounds.min + targetBounds.max) / 2;
  const startIndex = Math.ceil((referenceBounds.min - targetBounds.max) / 360);
  const endIndex = Math.floor((referenceBounds.max - targetBounds.min) / 360);

  if (startIndex > endIndex) {
    return [Math.round((referenceCenter - targetCenter) / 360) * 360];
  }

  const candidates: number[] = [];
  for (let index = startIndex; index <= endIndex; index++) {
    candidates.push(index * 360);
  }

  return candidates.toSorted((a, b) => {
    const shiftedCenterA = targetCenter + a;
    const shiftedCenterB = targetCenter + b;
    const distanceA = Math.abs(referenceCenter - shiftedCenterA);
    const distanceB = Math.abs(referenceCenter - shiftedCenterB);
    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }
    return Math.abs(a) - Math.abs(b);
  });
}

function getLongitudeBounds(rings: readonly RingCoords[]): LongitudeBounds | null {
  let min = Infinity;
  let max = -Infinity;

  for (const ring of rings) {
    for (const point of ring) {
      if (point.x < min) {
        min = point.x;
      }
      if (point.x > max) {
        max = point.x;
      }
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return { min, max };
}

/**
 * ポリゴンの差分を計算する（subject - clip）
 *
 * §5.3.1: 非優先ポリゴンから優先ポリゴンの領域を差し引く
 *
 * @param subject 差し引かれるポリゴン（非優先側）のリング群
 * @param clip 差し引くポリゴン（優先側）のリング群
 * @returns 差分結果
 */
export function polygonDifference(
  subject: readonly RingCoords[],
  clip: readonly RingCoords[]
): BooleanResult {
  if (subject.length === 0) {
    return { polygons: [], isEmpty: true };
  }
  if (clip.length === 0) {
    return { polygons: [subject.map(r => [...r])], isEmpty: false };
  }

  const subjectClip = toClipPolygon(subject);
  const clipClip = toClipPolygon(clip);

  const result = polygonClipping.difference(subjectClip, clipClip);

  const polygons = result.map(poly => fromClipPolygon(poly));
  return {
    polygons,
    isEmpty: polygons.length === 0,
  };
}

/**
 * ポリゴンの交差を計算する
 *
 * @param a ポリゴンAのリング群
 * @param b ポリゴンBのリング群
 * @returns 交差結果
 */
export function polygonIntersection(
  a: readonly RingCoords[],
  b: readonly RingCoords[]
): BooleanResult {
  if (a.length === 0 || b.length === 0) {
    return { polygons: [], isEmpty: true };
  }

  const aClip = toClipPolygon(a);
  const bClip = toClipPolygon(b);

  const result = polygonClipping.intersection(aClip, bClip);

  const polygons = result.map(poly => fromClipPolygon(poly));
  return {
    polygons,
    isEmpty: polygons.length === 0,
  };
}

/**
 * ポリゴンの和を計算する
 *
 * @param a ポリゴンAのリング群
 * @param b ポリゴンBのリング群
 * @returns 和結果
 */
export function polygonUnion(
  a: readonly RingCoords[],
  b: readonly RingCoords[]
): BooleanResult {
  if (a.length === 0 && b.length === 0) {
    return { polygons: [], isEmpty: true };
  }
  if (a.length === 0) {
    return { polygons: [b.map(r => [...r])], isEmpty: false };
  }
  if (b.length === 0) {
    return { polygons: [a.map(r => [...r])], isEmpty: false };
  }

  const aClip = toClipPolygon(a);
  const bClip = toClipPolygon(b);

  const result = polygonClipping.union(aClip, bClip);

  const polygons = result.map(poly => fromClipPolygon(poly));
  return {
    polygons,
    isEmpty: polygons.length === 0,
  };
}
