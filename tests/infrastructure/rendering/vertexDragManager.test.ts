import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  startDrag,
  startInsertDrag,
  updateDragPreview,
  hasMoved,
} from '@infrastructure/rendering/vertexDragManager';

describe('vertexDragManager', () => {
  const origin = new Coordinate(10, 20);

  describe('startDrag', () => {
    it('ドラッグ状態を初期化する', () => {
      const state = startDrag('v1', origin);
      expect(state.vertexId).toBe('v1');
      expect(state.startCoord).toBe(origin);
      expect(state.previewCoord).toBe(origin);
      expect(state.isInserted).toBe(false);
    });
  });

  describe('startInsertDrag', () => {
    it('挿入フラグ付きでドラッグ状態を初期化する', () => {
      const state = startInsertDrag('v-new', origin);
      expect(state.vertexId).toBe('v-new');
      expect(state.startCoord).toBe(origin);
      expect(state.isInserted).toBe(true);
    });
  });

  describe('updateDragPreview', () => {
    it('プレビュー座標を更新する', () => {
      const state = startDrag('v1', origin);
      const newCoord = new Coordinate(15, 25);
      const updated = updateDragPreview(state, newCoord);
      expect(updated.previewCoord).toBe(newCoord);
      expect(updated.startCoord).toBe(origin);
      expect(updated.vertexId).toBe('v1');
    });

    it('元の状態は変更されない（イミュータブル）', () => {
      const state = startDrag('v1', origin);
      const updated = updateDragPreview(state, new Coordinate(15, 25));
      expect(state.previewCoord).toBe(origin);
      expect(updated.previewCoord.x).toBe(15);
    });
  });

  describe('hasMoved', () => {
    it('移動していない場合はfalse', () => {
      const state = startDrag('v1', origin);
      expect(hasMoved(state)).toBe(false);
    });

    it('閾値以下の移動はfalse', () => {
      const state = startDrag('v1', origin);
      const updated = updateDragPreview(state, new Coordinate(10.0005, 20.0005));
      expect(hasMoved(updated)).toBe(false);
    });

    it('閾値を超える移動はtrue', () => {
      const state = startDrag('v1', origin);
      const updated = updateDragPreview(state, new Coordinate(11, 21));
      expect(hasMoved(updated)).toBe(true);
    });

    it('カスタム閾値を指定できる', () => {
      const state = startDrag('v1', origin);
      const updated = updateDragPreview(state, new Coordinate(10.5, 20));
      expect(hasMoved(updated, 1)).toBe(false);
      expect(hasMoved(updated, 0.1)).toBe(true);
    });
  });
});
