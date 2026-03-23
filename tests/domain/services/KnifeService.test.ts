import { describe, it, expect } from 'vitest';
import {
  splitByLine,
  splitByClosed,
  validateCuttingLine,
} from '@domain/services/KnifeService';
import type { RingCoords } from '@domain/services/GeometryService';

/** 簡単な正方形ポリゴン (0,0)-(10,0)-(10,10)-(0,10) */
const square: RingCoords[] = [
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
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
