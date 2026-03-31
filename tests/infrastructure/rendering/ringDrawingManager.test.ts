import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  startRingDrawing,
  addRingVertex,
  undoRingVertex,
  canConfirmRing,
} from '@infrastructure/rendering/ringDrawingManager';

describe('ringDrawingManager', () => {
  describe('startRingDrawing', () => {
    it('自動判定モードでリング描画を開始する', () => {
      const state = startRingDrawing('auto', 'f1');
      expect(state.type).toBe('auto');
      expect(state.featureId).toBe('f1');
      expect(state.coords).toEqual([]);
    });

    it('明示的な飛び地モードも保持できる', () => {
      const state = startRingDrawing('exclave', 'f1');
      expect(state.type).toBe('exclave');
    });
  });

  describe('addRingVertex', () => {
    it('座標を追加する', () => {
      const state = startRingDrawing('auto', 'f1');
      const c1 = new Coordinate(10, 20);
      const updated = addRingVertex(state, c1);
      expect(updated.coords).toHaveLength(1);
      expect(updated.coords[0]).toBe(c1);
    });

    it('複数座標を順次追加する', () => {
      let state = startRingDrawing('auto', 'f1');
      state = addRingVertex(state, new Coordinate(10, 20));
      state = addRingVertex(state, new Coordinate(15, 25));
      state = addRingVertex(state, new Coordinate(20, 30));
      expect(state.coords).toHaveLength(3);
    });

    it('元の状態は変更されない（イミュータブル）', () => {
      const state = startRingDrawing('auto', 'f1');
      const updated = addRingVertex(state, new Coordinate(10, 20));
      expect(state.coords).toHaveLength(0);
      expect(updated.coords).toHaveLength(1);
    });
  });

  describe('undoRingVertex', () => {
    it('最後の頂点を削除する', () => {
      let state = startRingDrawing('auto', 'f1');
      state = addRingVertex(state, new Coordinate(10, 20));
      state = addRingVertex(state, new Coordinate(15, 25));
      state = undoRingVertex(state);
      expect(state.coords).toHaveLength(1);
    });

    it('空の場合は変更なし', () => {
      const state = startRingDrawing('auto', 'f1');
      const updated = undoRingVertex(state);
      expect(updated.coords).toHaveLength(0);
    });
  });

  describe('canConfirmRing', () => {
    it('3点未満では確定不可', () => {
      let state = startRingDrawing('auto', 'f1');
      expect(canConfirmRing(state)).toBe(false);
      state = addRingVertex(state, new Coordinate(10, 20));
      expect(canConfirmRing(state)).toBe(false);
      state = addRingVertex(state, new Coordinate(15, 25));
      expect(canConfirmRing(state)).toBe(false);
    });

    it('3点以上で確定可能', () => {
      let state = startRingDrawing('auto', 'f1');
      state = addRingVertex(state, new Coordinate(10, 20));
      state = addRingVertex(state, new Coordinate(15, 25));
      state = addRingVertex(state, new Coordinate(20, 30));
      expect(canConfirmRing(state)).toBe(true);
    });
  });
});
