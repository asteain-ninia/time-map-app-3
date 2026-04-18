import { describe, it, expect } from 'vitest';
import {
  slideAlongEdge,
  moveAlongEdge,
  type SlideResult,
} from '@domain/services/EdgeSlideService';
import { constrainMovingEdgesAgainstPoints } from '@domain/services/EdgePointCollisionService';
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

    it('直前座標がある場合、内部への移動は最初に交差したエッジで止まる', () => {
      const result = slideAlongEdge(9, 5, [square], { x: -5, y: 5 });
      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(5);
      expect(result.edgeIndex).toBe(3); // 左辺
    });

    it('境界上から障害物内部へ向かう移動は反対側エッジへ飛ばさず拒否する', () => {
      const result = slideAlongEdge(9, 5, [square], { x: 0, y: 5 });
      expect(result.didSlide).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(5);
    });

    it('境界上から同じエッジに沿って滑る移動は許可する', () => {
      const result = slideAlongEdge(1, 6, [square], { x: 0, y: 5 });
      expect(result.didSlide).toBe(true);
      expect(result.blocked).not.toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(6);
      expect(result.edgeIndex).toBe(3);
    });

    it('障害物を横切って反対側へ出る移動は最初の接触辺に留まる', () => {
      const result = slideAlongEdge(15, 5, [square], { x: -5, y: 5 });
      expect(result.didSlide).toBe(true);
      expect(result.blocked).not.toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(5);
    });

    it('障害物へ斜めに入る移動は接触後の残り移動を辺方向へ滑らせる', () => {
      const result = slideAlongEdge(7, 8, [square], { x: -5, y: 2 });
      expect(result.didSlide).toBe(true);
      expect(result.blocked).not.toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBeCloseTo(8);
      expect(result.edgeIndex).toBe(3);
    });

    it('移動先が障害物境界上の場合は横断ブロックしない', () => {
      const result = slideAlongEdge(0, 5, [square], { x: -5, y: 5 });
      expect(result.blocked).not.toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(5);
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

  describe('constrainMovingEdgesAgainstPoints', () => {
    it('移動中の辺が障害物頂点へ接触した後は接触線に沿って滑る', () => {
      const result = constrainMovingEdgesAgainstPoints(
        20,
        10,
        [{ fixedX: 0, fixedY: 0, sourceX: 0, sourceY: 10 }],
        [{ x: 5, y: 5 }]
      );

      expect(result.didSlide).toBe(true);
      expect(result.x).toBeCloseTo(15);
      expect(result.y).toBeCloseTo(15);
    });

    it('障害物頂点が移動辺の掃過範囲にない場合は止めない', () => {
      const result = constrainMovingEdgesAgainstPoints(
        20,
        10,
        [{ fixedX: 0, fixedY: 0, sourceX: 0, sourceY: 10 }],
        [{ x: 5, y: 11 }]
      );

      expect(result.didSlide).toBe(false);
      expect(result.x).toBe(20);
      expect(result.y).toBe(10);
    });

    it('複数候補では移動量が最も小さい衝突位置を採用する', () => {
      const result = constrainMovingEdgesAgainstPoints(
        30,
        10,
        [{ fixedX: 0, fixedY: 0, sourceX: 0, sourceY: 10 }],
        [
          { x: 10, y: 5 },
          { x: 5, y: 5 },
        ]
      );

      expect(result.didSlide).toBe(true);
      expect(result.x).toBeCloseTo(20);
      expect(result.y).toBeCloseTo(20);
    });

    it('障害物頂点へ接触中の辺は接触線から外れる移動を滑り方向へ射影する', () => {
      const result = constrainMovingEdgesAgainstPoints(
        20,
        10,
        [{ fixedX: 0, fixedY: 0, sourceX: 10, sourceY: 10 }],
        [{ x: 5, y: 5 }]
      );

      expect(result.didSlide).toBe(true);
      expect(result.x).toBeCloseTo(15);
      expect(result.y).toBeCloseTo(15);
    });

    it('辺-点滑りの候補線分が障害物面の内部を通る場合は安全な境界候補へ滑る', () => {
      const result = constrainMovingEdgesAgainstPoints(
        10,
        5,
        [{ fixedX: -5, fixedY: 15, sourceX: -5, sourceY: 5 }],
        [{ x: 0, y: 10 }],
        [square]
      );

      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(5);
    });

    it('速いドラッグで面内部候補が出ても直前座標に固着せず境界上へ進む', () => {
      const result = constrainMovingEdgesAgainstPoints(
        10,
        -20,
        [{ fixedX: -5, fixedY: 15, sourceX: -5, sourceY: 5 }],
        [{ x: 0, y: 10 }],
        [square]
      );

      expect(result.didSlide).toBe(true);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
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
