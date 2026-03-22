import { describe, it, expect } from 'vitest';
import {
  segmentsIntersect,
  isPointInPolygon,
  ringsEdgesIntersect,
  isRingContainedIn,
  ringsOverlap,
  isSelfIntersecting,
  projectPointOnSegment,
  signedArea,
  polygonArea,
  distance,
  type RingCoords,
} from '@domain/services/GeometryService';

describe('GeometryService', () => {
  describe('segmentsIntersect', () => {
    it('交差する2線分はtrue', () => {
      expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    });

    it('交差しない2線分はfalse', () => {
      expect(segmentsIntersect(0, 0, 5, 5, 6, 6, 10, 10)).toBe(false);
    });

    it('平行な2線分はfalse', () => {
      expect(segmentsIntersect(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false);
    });

    it('端点で接触する場合はtrue', () => {
      expect(segmentsIntersect(0, 0, 5, 5, 5, 5, 10, 0)).toBe(true);
    });

    it('T字接触する場合はtrue', () => {
      expect(segmentsIntersect(0, 0, 10, 0, 5, -5, 5, 5)).toBe(true);
    });

    it('同一線上で重なる場合はtrue', () => {
      expect(segmentsIntersect(0, 0, 10, 0, 5, 0, 15, 0)).toBe(true);
    });

    it('同一線上で離れている場合はfalse', () => {
      expect(segmentsIntersect(0, 0, 3, 0, 5, 0, 10, 0)).toBe(false);
    });
  });

  describe('isPointInPolygon', () => {
    const square: RingCoords = [
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 10, y: 10 }, { x: 0, y: 10 },
    ];

    it('内部の点はtrue', () => {
      expect(isPointInPolygon(5, 5, square)).toBe(true);
    });

    it('外部の点はfalse', () => {
      expect(isPointInPolygon(15, 5, square)).toBe(false);
    });

    it('L字型ポリゴンの凹部はfalse', () => {
      const lShape: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 },
        { x: 10, y: 5 }, { x: 5, y: 5 },
        { x: 5, y: 10 }, { x: 0, y: 10 },
      ];
      expect(isPointInPolygon(2, 2, lShape)).toBe(true);
      expect(isPointInPolygon(8, 8, lShape)).toBe(false);
    });
  });

  describe('ringsEdgesIntersect', () => {
    it('辺が交差するリングペアはtrue', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ];
      const ringB: RingCoords = [
        { x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 5 },
      ];
      expect(ringsEdgesIntersect(ringA, ringB)).toBe(true);
    });

    it('完全に分離したリングペアはfalse', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ];
      const ringB: RingCoords = [
        { x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }, { x: 10, y: 5 },
      ];
      expect(ringsEdgesIntersect(ringA, ringB)).toBe(false);
    });

    it('共有頂点で接触するリングは交差しない', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ];
      const ringB: RingCoords = [
        { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 },
      ];
      expect(ringsEdgesIntersect(ringA, ringB)).toBe(false);
    });

    it('内包関係のリングは辺交差しない', () => {
      const outer: RingCoords = [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ];
      const inner: RingCoords = [
        { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
      ];
      expect(ringsEdgesIntersect(outer, inner)).toBe(false);
    });
  });

  describe('isRingContainedIn', () => {
    it('完全に包含されるリングはtrue', () => {
      const outer: RingCoords = [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ];
      const inner: RingCoords = [
        { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
      ];
      expect(isRingContainedIn(inner, outer)).toBe(true);
    });

    it('部分的に重なるリングはfalse', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ];
      const ringB: RingCoords = [
        { x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 5 },
      ];
      expect(isRingContainedIn(ringA, ringB)).toBe(false);
    });

    it('完全に分離したリングはfalse', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ];
      const ringB: RingCoords = [
        { x: 20, y: 20 }, { x: 25, y: 20 }, { x: 25, y: 25 }, { x: 20, y: 25 },
      ];
      expect(isRingContainedIn(ringA, ringB)).toBe(false);
    });
  });

  describe('ringsOverlap', () => {
    it('辺が交差するリングは重なるtrue', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ];
      const ringB: RingCoords = [
        { x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 5 },
      ];
      expect(ringsOverlap(ringA, ringB)).toBe(true);
    });

    it('内包関係は重なるtrue', () => {
      const outer: RingCoords = [
        { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
      ];
      const inner: RingCoords = [
        { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
      ];
      expect(ringsOverlap(outer, inner)).toBe(true);
    });

    it('分離したリングは重ならないfalse', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ];
      const ringB: RingCoords = [
        { x: 10, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 5 }, { x: 10, y: 5 },
      ];
      expect(ringsOverlap(ringA, ringB)).toBe(false);
    });

    it('共有辺で接触するだけのリングは重ならないfalse', () => {
      const ringA: RingCoords = [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 },
      ];
      const ringB: RingCoords = [
        { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 },
      ];
      expect(ringsOverlap(ringA, ringB)).toBe(false);
    });
  });

  describe('isSelfIntersecting', () => {
    it('凸ポリゴンは自己交差しない', () => {
      const square: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ];
      expect(isSelfIntersecting(square)).toBe(false);
    });

    it('8の字形は自己交差する', () => {
      const bowTie: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 },
      ];
      expect(isSelfIntersecting(bowTie)).toBe(true);
    });

    it('凹ポリゴンは自己交差しない', () => {
      const lShape: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 },
        { x: 10, y: 5 }, { x: 5, y: 5 },
        { x: 5, y: 10 }, { x: 0, y: 10 },
      ];
      expect(isSelfIntersecting(lShape)).toBe(false);
    });

    it('3頂点以下は自己交差不可', () => {
      const triangle: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 },
      ];
      expect(isSelfIntersecting(triangle)).toBe(false);
    });
  });

  describe('projectPointOnSegment', () => {
    it('線分の中間への投影', () => {
      const result = projectPointOnSegment(5, 3, 0, 0, 10, 0);
      expect(result.x).toBe(5);
      expect(result.y).toBe(0);
      expect(result.t).toBe(0.5);
    });

    it('線分の始点側への投影', () => {
      const result = projectPointOnSegment(-5, 0, 0, 0, 10, 0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.t).toBe(0);
    });

    it('線分の終点側への投影', () => {
      const result = projectPointOnSegment(15, 0, 0, 0, 10, 0);
      expect(result.x).toBe(10);
      expect(result.y).toBe(0);
      expect(result.t).toBe(1);
    });

    it('退化線分（点）への投影', () => {
      const result = projectPointOnSegment(5, 5, 3, 3, 3, 3);
      expect(result.x).toBe(3);
      expect(result.y).toBe(3);
      expect(result.t).toBe(0);
    });
  });

  describe('signedArea / polygonArea', () => {
    it('反時計回りの正方形の面積', () => {
      const square: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      ];
      expect(polygonArea(square)).toBe(100);
    });

    it('時計回りでもpolygonAreaは正の値', () => {
      const square: RingCoords = [
        { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 },
      ];
      expect(polygonArea(square)).toBe(100);
    });

    it('三角形の面積', () => {
      const triangle: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 },
      ];
      expect(polygonArea(triangle)).toBe(50);
    });
  });

  describe('distance', () => {
    it('同一点の距離は0', () => {
      expect(distance(5, 5, 5, 5)).toBe(0);
    });

    it('3-4-5三角形', () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
    });

    it('水平距離', () => {
      expect(distance(0, 0, 10, 0)).toBe(10);
    });
  });
});
