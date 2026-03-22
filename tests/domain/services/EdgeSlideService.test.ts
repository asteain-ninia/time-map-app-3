import { describe, it, expect } from 'vitest';
import {
  slideAlongEdge,
  moveAlongEdge,
  type SlideResult,
} from '@domain/services/EdgeSlideService';
import type { RingCoords } from '@domain/services/GeometryService';

const square: RingCoords = [
  { x: 0, y: 0 }, { x: 10, y: 0 },
  { x: 10, y: 10 }, { x: 0, y: 10 },
];

describe('EdgeSlideService', () => {
  describe('slideAlongEdge', () => {
    it('障害物の外にいる場合は滑らない', () => {
      const result = slideAlongEdge(15, 5, [square]);
      expect(result.didSlide).toBe(false);
      expect(result.x).toBe(15);
      expect(result.y).toBe(5);
    });

    it('障害物の内部に入る場合、最も近いエッジへ投影される', () => {
      // (5, 1) はsquare内部。最も近いエッジは下辺 y=0
      const result = slideAlongEdge(5, 1, [square]);
      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(5);
      expect(result.y).toBe(0);
      expect(result.edgeIndex).toBe(0); // 下辺
    });

    it('右辺に最も近い場合、右辺へ投影される', () => {
      // (9, 5) はsquare内部。最も近いエッジは右辺 x=10
      const result = slideAlongEdge(9, 5, [square]);
      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(10);
      expect(result.y).toBe(5);
      expect(result.edgeIndex).toBe(1); // 右辺
    });

    it('複数の障害物の最初にヒットしたものに滑る', () => {
      const square2: RingCoords = [
        { x: 20, y: 0 }, { x: 30, y: 0 },
        { x: 30, y: 10 }, { x: 20, y: 10 },
      ];
      // (5, 5) はsquare内部
      const result = slideAlongEdge(5, 5, [square, square2]);
      expect(result.didSlide).toBe(true);
    });

    it('どの障害物にも入らない場合は滑らない', () => {
      const result = slideAlongEdge(15, 15, [square]);
      expect(result.didSlide).toBe(false);
    });

    it('障害物が空の場合は滑らない', () => {
      const result = slideAlongEdge(5, 5, []);
      expect(result.didSlide).toBe(false);
    });

    it('角付近では最も近いエッジに投影される', () => {
      // (1, 1) は左下角付近。下辺と左辺のどちらかに投影
      const result = slideAlongEdge(1, 1, [square]);
      expect(result.didSlide).toBe(true);
      // 下辺(y=0)か左辺(x=0)のどちらかに投影される。距離は同じなので最初に見つかった方
      expect(result.edgeIndex).not.toBeNull();
    });
  });

  describe('moveAlongEdge', () => {
    it('エッジに沿って正方向に移動する', () => {
      // 下辺(0,0)-(10,0)の中点(5,0)から右方向へ移動
      const result = moveAlongEdge(
        5, 0,    // current position
        1, 0,    // drag direction: right
        square,
        0,       // edge index: bottom edge
        3        // move amount
      );
      expect(result.didSlide).toBe(true);
      expect(result.x).toBeCloseTo(8);
      expect(result.y).toBeCloseTo(0);
      expect(result.edgeIndex).toBe(0);
    });

    it('エッジに沿って逆方向に移動する', () => {
      // 下辺の中点(5,0)から左方向へ
      const result = moveAlongEdge(
        5, 0,
        -1, 0,   // drag direction: left
        square,
        0,
        3
      );
      expect(result.didSlide).toBe(true);
      expect(result.x).toBeCloseTo(2);
      expect(result.y).toBeCloseTo(0);
    });

    it('エッジ端に到達すると次のエッジに遷移する', () => {
      // 下辺の(8,0)から右方向へ5移動 → 端点(10,0)到達、次のエッジへ
      const result = moveAlongEdge(
        8, 0,
        1, 0,
        square,
        0,
        5
      );
      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(10);
      expect(result.y).toBe(0);
      expect(result.edgeIndex).toBe(1); // 右辺へ遷移
    });

    it('エッジ始点方向に到達すると前のエッジに遷移する', () => {
      // 下辺の(2,0)から左方向へ5移動 → 始点(0,0)到達、前のエッジへ
      const result = moveAlongEdge(
        2, 0,
        -1, 0,
        square,
        0,
        5
      );
      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.edgeIndex).toBe(3); // 左辺（前のエッジ）へ遷移
    });

    it('ドラッグ方向がエッジに垂直な場合は動かない', () => {
      // 下辺で上方向にドラッグ → 内積=0 → 移動量0
      const result = moveAlongEdge(
        5, 0,
        0, 1,    // drag direction: up (perpendicular to bottom edge)
        square,
        0,
        3
      );
      // 内積が0なので正方向に微小移動
      expect(result.didSlide).toBe(true);
    });

    it('退化エッジ（長さ0）では現在位置を維持する', () => {
      const degenerateRing: RingCoords = [
        { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 10 },
      ];
      const result = moveAlongEdge(5, 5, 1, 0, degenerateRing, 0, 3);
      expect(result.x).toBe(5);
      expect(result.y).toBe(5);
    });
  });
});
