import { describe, it, expect } from 'vitest';
import {
  splitByLine,
  splitPolygonsByLine,
  splitByClosed,
  validateCuttingLine,
  validateCuttingLineForPolygons,
} from '@domain/services/KnifeService';
import { polygonArea, type RingCoords } from '@domain/services/GeometryService';

/** 簡単な正方形ポリゴン (0,0)-(10,0)-(10,10)-(0,10) */
const square: RingCoords[] = [
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
];

/** 離れた正方形ポリゴン (20,0)-(30,0)-(30,10)-(20,10) */
const shiftedSquare: RingCoords[] = [
  [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }],
];

/** 穴付きポリゴン */
const squareWithHole: RingCoords[] = [
  // 外周
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  // 穴 (3,3)-(7,3)-(7,7)-(3,7) — 時計回り
  [{ x: 3, y: 3 }, { x: 3, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 3 }],
];

/** 長方形ポリゴン (0,0)-(20,0)-(20,10)-(0,10) */
const rectangle: RingCoords[] = [
  [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
];

/** C字形ポリゴン。右側を縦に切ると片側が2つの離れた領域になる */
const cShape: RingCoords[] = [
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 8 },
    { x: 10, y: 8 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
];

/** 右側に細い接続部を持つC字形ポリゴン */
const rightConnectedCShape: RingCoords[] = [
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 8 },
    { x: 9, y: 8 },
    { x: 9, y: 2 },
    { x: 0, y: 2 },
  ],
];

describe('KnifeService', () => {
  describe('validateCuttingLine', () => {
    it('2点未満の分断線は無効', () => {
      const result = validateCuttingLine(square, [{ x: 5, y: -1 }], false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2点以上');
    });

    it('閉線で3点未満は無効', () => {
      const result = validateCuttingLine(
        square,
        [{ x: 3, y: 3 }, { x: 7, y: 3 }],
        true
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('3点以上');
    });

    it('空ポリゴンは無効', () => {
      const result = validateCuttingLine([], [{ x: 0, y: 0 }, { x: 10, y: 10 }], false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('有効なポリゴン');
    });

    it('ポリゴンを横断しない分断線は無効', () => {
      const result = validateCuttingLine(
        square,
        [{ x: -5, y: -5 }, { x: -3, y: -3 }],
        false
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('横断していません');
    });

    it('ポリゴンを横断する分断線は有効', () => {
      const result = validateCuttingLine(
        square,
        [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        false
      );
      expect(result.valid).toBe(true);
    });

    it('複数territoryの交差回数を合算して横断扱いにしない', () => {
      const result = validateCuttingLineForPolygons(
        [square, shiftedSquare],
        [{ x: 5, y: 5 }, { x: 25, y: 5 }],
        false
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('横断していません');
    });

    it('閉線がポリゴン内部にあれば有効', () => {
      const result = validateCuttingLine(
        square,
        [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }],
        true
      );
      expect(result.valid).toBe(true);
    });

    it('閉線がポリゴン外部のみなら無効', () => {
      const result = validateCuttingLine(
        square,
        [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }],
        true
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ポリゴン内部');
    });
  });

  describe('splitByLine（二分割）', () => {
    it('正方形を垂直に二分割する', () => {
      const result = splitByLine(
        square,
        [{ x: 5, y: -1 }, { x: 5, y: 11 }]
      );
      expect(result.success).toBe(true);
      expect(result.pieceA.length).toBeGreaterThanOrEqual(1);
      expect(result.pieceB.length).toBeGreaterThanOrEqual(1);
    });

    it('長方形を水平に二分割する', () => {
      const result = splitByLine(
        rectangle,
        [{ x: -1, y: 5 }, { x: 21, y: 5 }]
      );
      expect(result.success).toBe(true);
      expect(result.pieceA.length).toBeGreaterThanOrEqual(1);
      expect(result.pieceB.length).toBeGreaterThanOrEqual(1);
    });

    it('斜めの分断線で分割する', () => {
      const result = splitByLine(
        square,
        [{ x: -1, y: 0 }, { x: 11, y: 10 }]
      );
      expect(result.success).toBe(true);
    });

    it('ポリゴンを横断しない分断線は失敗する', () => {
      const result = splitByLine(
        square,
        [{ x: -5, y: -5 }, { x: -3, y: -3 }]
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('分割結果の2片は空でない', () => {
      const result = splitByLine(
        square,
        [{ x: 5, y: -1 }, { x: 5, y: 11 }]
      );
      if (result.success) {
        // 各片の外周リングは3頂点以上
        expect(result.pieceA[0].length).toBeGreaterThanOrEqual(3);
        expect(result.pieceB[0].length).toBeGreaterThanOrEqual(3);
      }
    });

    it('穴付きポリゴンを穴を横切って分割できる', () => {
      const result = splitByLine(
        squareWithHole,
        [{ x: 5, y: -1 }, { x: 5, y: 11 }]
      );
      expect(result.success).toBe(true);
    });

    it('凹ポリゴンの片側が複数片になっても全片を保持する', () => {
      const result = splitByLine(
        cShape,
        [{ x: 5, y: -1 }, { x: 5, y: 11 }]
      );

      expect(result.success).toBe(true);
      expect(result.pieceAPolygons).toHaveLength(1);
      expect(result.pieceBPolygons).toHaveLength(2);
      expect(sumPolygonsArea([...result.pieceAPolygons, ...result.pieceBPolygons]))
        .toBeCloseTo(sumPolygonsArea([cShape]), 6);
    });

    it('開線が横断していない離れたterritoryは延長半平面で分断しない', () => {
      const result = splitPolygonsByLine(
        [square, shiftedSquare],
        [{ x: -1, y: 5 }, { x: 11, y: 5 }]
      );

      expect(result.success).toBe(true);
      const untouchedPolygons = [...result.pieceAPolygons, ...result.pieceBPolygons]
        .filter((polygon) => {
          const bounds = getRingBounds(polygon[0]);
          return bounds.minX === 20 && bounds.maxX === 30;
        });

      expect(untouchedPolygons).toHaveLength(1);
      expect(getRingBounds(untouchedPolygons[0][0])).toEqual({
        minX: 20,
        maxX: 30,
        minY: 0,
        maxY: 10,
      });
      expect(result.pieceAPolygons).toContain(untouchedPolygons[0]);
    });

    it('同一ポリゴン内の延長線上にある未横断部分を分断しない', () => {
      const result = splitByLine(
        cShape,
        [{ x: 5, y: -1 }, { x: 5, y: 3 }]
      );

      expect(result.success).toBe(true);
      expect(result.pieceAPolygons).toHaveLength(1);
      expect(result.pieceBPolygons).toHaveLength(1);
      expect(sumPolygonsArea([...result.pieceAPolygons, ...result.pieceBPolygons]))
        .toBeCloseTo(sumPolygonsArea([cShape]), 6);

      const splitOffBounds = getRingBounds(result.pieceBPolygons[0][0]);
      expect(splitOffBounds).toEqual({
        minX: 5,
        maxX: 10,
        minY: 0,
        maxY: 2,
      });
    });

    it('開線端点が境界に触れるだけの未横断部分を分断しない', () => {
      const result = splitByLine(
        cShape,
        [{ x: 5, y: -1 }, { x: 5, y: 8 }]
      );

      expect(result.success).toBe(true);
      expect(result.pieceAPolygons).toHaveLength(1);
      expect(result.pieceBPolygons).toHaveLength(1);
      expect(sumPolygonsArea([...result.pieceAPolygons, ...result.pieceBPolygons]))
        .toBeCloseTo(sumPolygonsArea([cShape]), 6);

      const splitOffBounds = getRingBounds(result.pieceBPolygons[0][0]);
      expect(splitOffBounds).toEqual({
        minX: 5,
        maxX: 10,
        minY: 0,
        maxY: 2,
      });
    });

    it('開線端点が別の腕の内部で止まる未横断部分を分断しない', () => {
      const result = splitByLine(
        cShape,
        [{ x: 5, y: -1 }, { x: 5, y: 9 }]
      );

      expect(result.success).toBe(true);
      expect(result.pieceAPolygons).toHaveLength(1);
      expect(result.pieceBPolygons).toHaveLength(1);
      expect(sumPolygonsArea([...result.pieceAPolygons, ...result.pieceBPolygons]))
        .toBeCloseTo(sumPolygonsArea([cShape]), 6);

      const splitOffBounds = getRingBounds(result.pieceBPolygons[0][0]);
      expect(splitOffBounds).toEqual({
        minX: 5,
        maxX: 10,
        minY: 0,
        maxY: 2,
      });
    });

    it('人工延長で再結合した大きい未横断部分を反対側へ寄せず分割を成功させる', () => {
      const result = splitByLine(
        rightConnectedCShape,
        [{ x: 8, y: -1 }, { x: 8, y: 3 }]
      );

      expect(result.success).toBe(true);
      expect(result.pieceAPolygons.length).toBeGreaterThan(0);
      expect(result.pieceBPolygons.length).toBeGreaterThan(0);
      expect(sumPolygonsArea([...result.pieceAPolygons, ...result.pieceBPolygons]))
        .toBeCloseTo(sumPolygonsArea([rightConnectedCShape]), 6);

      const splitOffBounds = [...result.pieceAPolygons, ...result.pieceBPolygons]
        .map((polygon) => getRingBounds(polygon[0]))
        .find((bounds) =>
          bounds.minX === 0 &&
          bounds.maxX === 8 &&
          bounds.minY === 0 &&
          bounds.maxY === 2
        );
      expect(splitOffBounds).toBeDefined();
    });
  });

  describe('splitByClosed（閉線分割）', () => {
    it('正方形内の閉線で分割する', () => {
      const closedLine = [
        { x: 3, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ];
      const result = splitByClosed(square, closedLine);
      expect(result.success).toBe(true);
      expect(result.pieceA.length).toBeGreaterThanOrEqual(1); // 外側
      expect(result.pieceB.length).toBeGreaterThanOrEqual(1); // 内側
    });

    it('閉線の内側（pieceB）は閉線と同じ形状', () => {
      const closedLine = [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ];
      const result = splitByClosed(square, closedLine);
      if (result.success) {
        // 内側の外周リングは4頂点以上（閉線形状）
        expect(result.pieceB[0].length).toBeGreaterThanOrEqual(3);
      }
    });

    it('ポリゴン外の閉線は失敗する', () => {
      const closedLine = [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
      ];
      const result = splitByClosed(square, closedLine);
      expect(result.success).toBe(false);
    });

    it('三角形の閉線で分割する', () => {
      const closedLine = [
        { x: 5, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ];
      const result = splitByClosed(square, closedLine);
      expect(result.success).toBe(true);
    });

    it('2点の閉線は無効', () => {
      const result = splitByClosed(
        square,
        [{ x: 3, y: 3 }, { x: 7, y: 3 }]
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('3点以上');
    });
  });
});

function sumPolygonsArea(polygons: readonly (readonly RingCoords[])[]): number {
  return polygons.reduce((total, polygon) => total + polygonAreaOf(polygon), 0);
}

function polygonAreaOf(polygon: readonly RingCoords[]): number {
  if (polygon.length === 0) return 0;
  const [outer, ...holes] = polygon;
  return polygonArea(outer) - holes.reduce((sum, hole) => sum + polygonArea(hole), 0);
}

function getRingBounds(ring: RingCoords): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  return ring.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}
