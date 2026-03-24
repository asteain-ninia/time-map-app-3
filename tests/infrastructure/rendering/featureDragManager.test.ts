import { describe, it, expect } from 'vitest';
import {
  startFeatureDrag,
  updateFeatureDrag,
  getFeatureDragDelta,
  hasFeatureDragMoved,
} from '@infrastructure/rendering/featureDragManager';

describe('featureDragManager', () => {
  describe('startFeatureDrag', () => {
    it('初期状態を生成する', () => {
      const state = startFeatureDrag('f1', 100, 200);
      expect(state.featureId).toBe('f1');
      expect(state.startScreenX).toBe(100);
      expect(state.startScreenY).toBe(200);
      expect(state.currentScreenX).toBe(100);
      expect(state.currentScreenY).toBe(200);
    });
  });

  describe('updateFeatureDrag', () => {
    it('現在位置を更新する', () => {
      const state = startFeatureDrag('f1', 100, 200);
      const updated = updateFeatureDrag(state, 150, 250);
      expect(updated.currentScreenX).toBe(150);
      expect(updated.currentScreenY).toBe(250);
      expect(updated.startScreenX).toBe(100);
      expect(updated.startScreenY).toBe(200);
    });

    it('元の状態は変更されない（イミュータブル）', () => {
      const state = startFeatureDrag('f1', 100, 200);
      const updated = updateFeatureDrag(state, 150, 250);
      expect(state.currentScreenX).toBe(100);
      expect(updated.currentScreenX).toBe(150);
    });
  });

  describe('getFeatureDragDelta', () => {
    it('移動量を計算する', () => {
      let state = startFeatureDrag('f1', 100, 200);
      state = updateFeatureDrag(state, 130, 240);
      const delta = getFeatureDragDelta(state);
      expect(delta.dx).toBe(30);
      expect(delta.dy).toBe(40);
    });

    it('移動なしの場合はゼロを返す', () => {
      const state = startFeatureDrag('f1', 100, 200);
      const delta = getFeatureDragDelta(state);
      expect(delta.dx).toBe(0);
      expect(delta.dy).toBe(0);
    });

    it('負方向の移動量を正しく計算する', () => {
      let state = startFeatureDrag('f1', 100, 200);
      state = updateFeatureDrag(state, 80, 150);
      const delta = getFeatureDragDelta(state);
      expect(delta.dx).toBe(-20);
      expect(delta.dy).toBe(-50);
    });
  });

  describe('hasFeatureDragMoved', () => {
    it('閾値以下の移動ではfalseを返す', () => {
      let state = startFeatureDrag('f1', 100, 200);
      state = updateFeatureDrag(state, 101, 201);
      expect(hasFeatureDragMoved(state)).toBe(false);
    });

    it('閾値を超える移動ではtrueを返す', () => {
      let state = startFeatureDrag('f1', 100, 200);
      state = updateFeatureDrag(state, 110, 210);
      expect(hasFeatureDragMoved(state)).toBe(true);
    });

    it('移動なしではfalseを返す', () => {
      const state = startFeatureDrag('f1', 100, 200);
      expect(hasFeatureDragMoved(state)).toBe(false);
    });

    it('カスタム閾値を使用できる', () => {
      let state = startFeatureDrag('f1', 100, 200);
      state = updateFeatureDrag(state, 104, 203);
      // distance = 5, default threshold = 3 → true
      expect(hasFeatureDragMoved(state, 3)).toBe(true);
      // distance = 5, threshold = 10 → false
      expect(hasFeatureDragMoved(state, 10)).toBe(false);
    });
  });
});
