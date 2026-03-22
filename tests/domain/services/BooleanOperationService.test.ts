import { describe, it, expect } from 'vitest';
import {
  toClipRing,
  fromClipRing,
  toClipPolygon,
  fromClipPolygon,
  polygonDifference,
  polygonIntersection,
  polygonUnion,
} from '@domain/services/BooleanOperationService';
import type { RingCoords } from '@domain/services/GeometryService';

// ---- ヘルパー ----

/** 正方形ポリゴン（外部リングのみ） */
function square(x: number, y: number, size: number): RingCoords {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

// ---- テスト ----

describe('BooleanOperationService', () => {
  describe('toClipRing / fromClipRing', () => {
    it('RingCoords → clip形式 → RingCoords のラウンドトリップ', () => {
      const ring: RingCoords = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
      const clip = toClipRing(ring);
      // 閉じたリングになる
      expect(clip.length).toBe(4);
      expect(clip[0]).toEqual([0, 0]);
      expect(clip[3]).toEqual([0, 0]); // 閉じ

      const roundTrip = fromClipRing(clip);
      expect(roundTrip).toEqual(ring);
    });

    it('既に閉じたリングは二重に閉じない', () => {
      const ring: RingCoords = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }];
      const clip = toClipRing(ring);
      // 最初と最後が同じなので閉じ処理は追加しない
      expect(clip.length).toBe(4);
    });

    it('空リングの変換', () => {
      expect(toClipRing([])).toEqual([]);
      expect(fromClipRing([])).toEqual([]);
    });
  });

  describe('toClipPolygon / fromClipPolygon', () => {
    it('複数リングのポリゴンを変換する', () => {
      const outer: RingCoords = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
      const hole: RingCoords = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }];
      const clip = toClipPolygon([outer, hole]);
      expect(clip.length).toBe(2);

      const back = fromClipPolygon(clip);
      expect(back.length).toBe(2);
      expect(back[0]).toEqual(outer);
      expect(back[1]).toEqual(hole);
    });
  });

  describe('polygonDifference', () => {
    it('重なる2つの正方形の差分を計算する', () => {
      const a = [square(0, 0, 10)];
      const b = [square(5, 0, 10)];
      const result = polygonDifference(a, b);
      expect(result.isEmpty).toBe(false);
      expect(result.polygons.length).toBeGreaterThanOrEqual(1);
      // 結果は左側の細長い矩形（x: 0-5, y: 0-10）になるはず
      const outerRing = result.polygons[0][0];
      // 全頂点がx:0-5の範囲内にある
      for (const p of outerRing) {
        expect(p.x).toBeGreaterThanOrEqual(-0.001);
        expect(p.x).toBeLessThanOrEqual(5.001);
      }
    });

    it('完全に覆われたポリゴンの差分は空になる', () => {
      const small = [square(2, 2, 3)];
      const large = [square(0, 0, 10)];
      const result = polygonDifference(small, large);
      expect(result.isEmpty).toBe(true);
    });

    it('重ならないポリゴンの差分は元のポリゴンを返す', () => {
      const a = [square(0, 0, 5)];
      const b = [square(10, 10, 5)];
      const result = polygonDifference(a, b);
      expect(result.isEmpty).toBe(false);
      expect(result.polygons.length).toBe(1);
    });

    it('空のsubjectは空結果', () => {
      const result = polygonDifference([], [square(0, 0, 10)]);
      expect(result.isEmpty).toBe(true);
    });

    it('空のclipはsubjectをそのまま返す', () => {
      const a = [square(0, 0, 10)];
      const result = polygonDifference(a, []);
      expect(result.isEmpty).toBe(false);
    });

    it('穴付きポリゴンの差分を計算できる', () => {
      const outer = square(0, 0, 20);
      const hole = square(5, 5, 10);
      const subject = [outer, hole]; // 穴付き
      const clip = [square(0, 0, 10)]; // 左下を削り取る
      const result = polygonDifference(subject, clip);
      expect(result.isEmpty).toBe(false);
    });
  });

  describe('polygonIntersection', () => {
    it('重なる2つの正方形の交差を計算する', () => {
      const a = [square(0, 0, 10)];
      const b = [square(5, 0, 10)];
      const result = polygonIntersection(a, b);
      expect(result.isEmpty).toBe(false);
      // 交差は x: 5-10, y: 0-10 の矩形
      const outerRing = result.polygons[0][0];
      for (const p of outerRing) {
        expect(p.x).toBeGreaterThanOrEqual(4.999);
        expect(p.x).toBeLessThanOrEqual(10.001);
      }
    });

    it('重ならないポリゴンの交差は空', () => {
      const a = [square(0, 0, 5)];
      const b = [square(10, 10, 5)];
      const result = polygonIntersection(a, b);
      expect(result.isEmpty).toBe(true);
    });

    it('空の入力は空結果', () => {
      expect(polygonIntersection([], [square(0, 0, 10)]).isEmpty).toBe(true);
      expect(polygonIntersection([square(0, 0, 10)], []).isEmpty).toBe(true);
    });
  });

  describe('polygonUnion', () => {
    it('重なる2つの正方形の和を計算する', () => {
      const a = [square(0, 0, 10)];
      const b = [square(5, 0, 10)];
      const result = polygonUnion(a, b);
      expect(result.isEmpty).toBe(false);
      // 和は x: 0-15, y: 0-10 の矩形
      const outerRing = result.polygons[0][0];
      const xs = outerRing.map(p => p.x);
      expect(Math.min(...xs)).toBeCloseTo(0);
      expect(Math.max(...xs)).toBeCloseTo(15);
    });

    it('空のaはbを返す', () => {
      const b = [square(0, 0, 10)];
      const result = polygonUnion([], b);
      expect(result.isEmpty).toBe(false);
    });

    it('空のbはaを返す', () => {
      const a = [square(0, 0, 10)];
      const result = polygonUnion(a, []);
      expect(result.isEmpty).toBe(false);
    });

    it('両方空なら空結果', () => {
      expect(polygonUnion([], []).isEmpty).toBe(true);
    });
  });
});
