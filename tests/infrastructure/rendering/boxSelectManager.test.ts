import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  startBoxSelect,
  updateBoxSelect,
  getSelectionBox,
  isBoxLargeEnough,
  findVerticesInBox,
  mergeSelection,
} from '@infrastructure/rendering/boxSelectManager';

describe('boxSelectManager', () => {
  describe('startBoxSelect', () => {
    it('初期状態を作成する', () => {
      const coord = new Coordinate(10, 20);
      const state = startBoxSelect(coord, false);
      expect(state.startCoord).toBe(coord);
      expect(state.currentCoord).toBe(coord);
      expect(state.isAdditive).toBe(false);
    });

    it('Shift併用フラグを設定できる', () => {
      const state = startBoxSelect(new Coordinate(0, 0), true);
      expect(state.isAdditive).toBe(true);
    });
  });

  describe('updateBoxSelect', () => {
    it('カーソル位置を更新する', () => {
      const start = new Coordinate(0, 0);
      const state = startBoxSelect(start, false);
      const newCoord = new Coordinate(10, 5);
      const updated = updateBoxSelect(state, newCoord);
      expect(updated.currentCoord).toBe(newCoord);
      expect(updated.startCoord).toBe(start);
    });

    it('イミュータブル: 元の状態は変化しない', () => {
      const state = startBoxSelect(new Coordinate(0, 0), false);
      const updated = updateBoxSelect(state, new Coordinate(5, 5));
      expect(state.currentCoord.x).toBe(0);
      expect(updated.currentCoord.x).toBe(5);
    });
  });

  describe('getSelectionBox', () => {
    it('正方向ドラッグ', () => {
      let state = startBoxSelect(new Coordinate(10, 20), false);
      state = updateBoxSelect(state, new Coordinate(30, 40));
      const box = getSelectionBox(state);
      expect(box.minX).toBe(10);
      expect(box.minY).toBe(20);
      expect(box.maxX).toBe(30);
      expect(box.maxY).toBe(40);
    });

    it('逆方向ドラッグ（正規化される）', () => {
      let state = startBoxSelect(new Coordinate(30, 40), false);
      state = updateBoxSelect(state, new Coordinate(10, 20));
      const box = getSelectionBox(state);
      expect(box.minX).toBe(10);
      expect(box.minY).toBe(20);
      expect(box.maxX).toBe(30);
      expect(box.maxY).toBe(40);
    });
  });

  describe('isBoxLargeEnough', () => {
    it('小さい矩形はfalse', () => {
      const state = startBoxSelect(new Coordinate(10, 10), false);
      expect(isBoxLargeEnough(state)).toBe(false);
    });

    it('大きい矩形はtrue', () => {
      let state = startBoxSelect(new Coordinate(10, 10), false);
      state = updateBoxSelect(state, new Coordinate(11, 10));
      expect(isBoxLargeEnough(state)).toBe(true);
    });

    it('カスタム閾値を使える', () => {
      let state = startBoxSelect(new Coordinate(0, 0), false);
      state = updateBoxSelect(state, new Coordinate(0.05, 0));
      expect(isBoxLargeEnough(state, 0.1)).toBe(false);
      expect(isBoxLargeEnough(state, 0.01)).toBe(true);
    });
  });

  describe('findVerticesInBox', () => {
    const vertices = new Map([
      ['v1', { coordinate: { x: 5, y: 5 } }],
      ['v2', { coordinate: { x: 15, y: 15 } }],
      ['v3', { coordinate: { x: 25, y: 25 } }],
      ['v4', { coordinate: { x: 10, y: 10 } }],
    ]);

    it('矩形内の頂点を抽出する', () => {
      const box = { minX: 0, minY: 0, maxX: 20, maxY: 20 };
      const result = findVerticesInBox(box, ['v1', 'v2', 'v3', 'v4'], vertices);
      expect(result).toEqual(new Set(['v1', 'v2', 'v4']));
    });

    it('境界上の頂点も含む', () => {
      const box = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
      const result = findVerticesInBox(box, ['v1', 'v2'], vertices);
      expect(result).toEqual(new Set(['v1', 'v2']));
    });

    it('存在しない頂点IDはスキップする', () => {
      const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      const result = findVerticesInBox(box, ['v1', 'nonexistent'], vertices);
      expect(result).toEqual(new Set(['v1']));
    });

    it('矩形外なら空セット', () => {
      const box = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
      const result = findVerticesInBox(box, ['v1', 'v2', 'v3'], vertices);
      expect(result.size).toBe(0);
    });
  });

  describe('mergeSelection', () => {
    it('非追加モード: 新しい選択で置き換える', () => {
      const existing = new Set(['v1', 'v2']);
      const newSel = new Set(['v3']);
      const result = mergeSelection(existing, newSel, false);
      expect(result).toEqual(new Set(['v3']));
    });

    it('追加モード: 既存+新規', () => {
      const existing = new Set(['v1', 'v2']);
      const newSel = new Set(['v3']);
      const result = mergeSelection(existing, newSel, true);
      expect(result).toEqual(new Set(['v1', 'v2', 'v3']));
    });

    it('追加モードで重複があっても問題ない', () => {
      const existing = new Set(['v1', 'v2']);
      const newSel = new Set(['v2', 'v3']);
      const result = mergeSelection(existing, newSel, true);
      expect(result).toEqual(new Set(['v1', 'v2', 'v3']));
    });
  });
});
