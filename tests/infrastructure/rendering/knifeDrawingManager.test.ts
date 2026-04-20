import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  startKnifeDrawing,
  addKnifeVertex,
  undoKnifeVertex,
  setKnifeClosed,
  isNearFirstVertex,
  validateKnifeLine,
  canConfirmKnife,
  canConfirmKnifeForPolygons,
} from '@infrastructure/rendering/knifeDrawingManager';

/** テスト用ポリゴン（10x10の正方形） */
const squarePolygon = [
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
];

/** 複数 territory のテスト用ポリゴン */
const multiTerritoryPolygons = [
  squarePolygon,
  [
    [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ],
  ],
];

describe('knifeDrawingManager', () => {
  describe('startKnifeDrawing', () => {
    it('初期状態を生成する', () => {
      const state = startKnifeDrawing('f1');
      expect(state.featureId).toBe('f1');
      expect(state.coords).toEqual([]);
      expect(state.isClosed).toBe(false);
    });
  });

  describe('addKnifeVertex', () => {
    it('座標を追加する', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, 0));
      expect(state.coords).toHaveLength(1);
      expect(state.coords[0].x).toBe(5);
    });

    it('複数座標を順次追加する', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, -1));
      state = addKnifeVertex(state, new Coordinate(5, 11));
      expect(state.coords).toHaveLength(2);
    });

    it('元の状態は変更されない（イミュータブル）', () => {
      const state = startKnifeDrawing('f1');
      const updated = addKnifeVertex(state, new Coordinate(5, 0));
      expect(state.coords).toHaveLength(0);
      expect(updated.coords).toHaveLength(1);
    });
  });

  describe('undoKnifeVertex', () => {
    it('最後の頂点を削除する', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, 0));
      state = addKnifeVertex(state, new Coordinate(5, 10));
      state = undoKnifeVertex(state);
      expect(state.coords).toHaveLength(1);
    });

    it('空の場合は変更なし', () => {
      const state = startKnifeDrawing('f1');
      const updated = undoKnifeVertex(state);
      expect(updated.coords).toHaveLength(0);
    });

    it('閉線モードをリセットする', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(3, 3));
      state = addKnifeVertex(state, new Coordinate(7, 3));
      state = addKnifeVertex(state, new Coordinate(7, 7));
      state = setKnifeClosed(state, true);
      state = undoKnifeVertex(state);
      expect(state.isClosed).toBe(false);
    });
  });

  describe('setKnifeClosed', () => {
    it('閉線モードを設定する', () => {
      const state = startKnifeDrawing('f1');
      const closed = setKnifeClosed(state, true);
      expect(closed.isClosed).toBe(true);
    });

    it('閉線モードを解除する', () => {
      let state = startKnifeDrawing('f1');
      state = setKnifeClosed(state, true);
      state = setKnifeClosed(state, false);
      expect(state.isClosed).toBe(false);
    });
  });

  describe('isNearFirstVertex', () => {
    it('3点未満ではfalseを返す', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, 5));
      state = addKnifeVertex(state, new Coordinate(7, 5));
      expect(isNearFirstVertex(state, { x: 5, y: 5 }, 1)).toBe(false);
    });

    it('3点以上で最初の頂点近傍にあればtrueを返す', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, 5));
      state = addKnifeVertex(state, new Coordinate(7, 5));
      state = addKnifeVertex(state, new Coordinate(7, 7));
      expect(isNearFirstVertex(state, { x: 5.3, y: 5.3 }, 0.5)).toBe(true);
    });

    it('最初の頂点から遠ければfalseを返す', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, 5));
      state = addKnifeVertex(state, new Coordinate(7, 5));
      state = addKnifeVertex(state, new Coordinate(7, 7));
      expect(isNearFirstVertex(state, { x: 8, y: 8 }, 0.5)).toBe(false);
    });
  });

  describe('validateKnifeLine', () => {
    it('2点未満では無効', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, -1));
      const result = validateKnifeLine(state, squarePolygon);
      expect(result.valid).toBe(false);
    });

    it('ポリゴンを横断する開線は有効', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, -1));
      state = addKnifeVertex(state, new Coordinate(5, 11));
      const result = validateKnifeLine(state, squarePolygon);
      expect(result.valid).toBe(true);
    });

    it('ポリゴンを横断しない線は無効', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(15, 0));
      state = addKnifeVertex(state, new Coordinate(15, 10));
      const result = validateKnifeLine(state, squarePolygon);
      expect(result.valid).toBe(false);
    });

    it('閉線モードで内部に含まれる線は有効', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(3, 3));
      state = addKnifeVertex(state, new Coordinate(7, 3));
      state = addKnifeVertex(state, new Coordinate(7, 7));
      state = setKnifeClosed(state, true);
      const result = validateKnifeLine(state, squarePolygon);
      expect(result.valid).toBe(true);
    });
  });

  describe('canConfirmKnife', () => {
    it('開線で2点未満は確定不可', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, -1));
      expect(canConfirmKnife(state, squarePolygon)).toBe(false);
    });

    it('開線で横断する2点以上は確定可能', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(5, -1));
      state = addKnifeVertex(state, new Coordinate(5, 11));
      expect(canConfirmKnife(state, squarePolygon)).toBe(true);
    });

    it('閉線で3点未満は確定不可', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(3, 3));
      state = addKnifeVertex(state, new Coordinate(7, 3));
      state = setKnifeClosed(state, true);
      expect(canConfirmKnife(state, squarePolygon)).toBe(false);
    });

    it('閉線で内部に含まれる3点以上は確定可能', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(3, 3));
      state = addKnifeVertex(state, new Coordinate(7, 3));
      state = addKnifeVertex(state, new Coordinate(7, 7));
      state = setKnifeClosed(state, true);
      expect(canConfirmKnife(state, squarePolygon)).toBe(true);
    });

    it('複数territoryの2個目を横断する開線を確定可能にする', () => {
      let state = startKnifeDrawing('f1');
      state = addKnifeVertex(state, new Coordinate(25, -1));
      state = addKnifeVertex(state, new Coordinate(25, 11));

      expect(canConfirmKnife(state, multiTerritoryPolygons.flat())).toBe(false);
      expect(canConfirmKnifeForPolygons(state, multiTerritoryPolygons)).toBe(true);
    });
  });
});
