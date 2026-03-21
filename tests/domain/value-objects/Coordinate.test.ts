import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';

describe('Coordinate', () => {
  describe('constructor', () => {
    it('x（経度）とy（緯度）を保持する', () => {
      const coord = new Coordinate(139.7, 35.6);
      expect(coord.x).toBe(139.7);
      expect(coord.y).toBe(35.6);
    });
  });

  describe('equals', () => {
    it('同じ座標なら true', () => {
      const a = new Coordinate(10, 20);
      const b = new Coordinate(10, 20);
      expect(a.equals(b)).toBe(true);
    });

    it('異なる座標なら false', () => {
      const a = new Coordinate(10, 20);
      const b = new Coordinate(10, 21);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('正規範囲内の値はそのまま返す', () => {
      const coord = new Coordinate(100, 50);
      const norm = coord.normalize();
      expect(norm.x).toBe(100);
      expect(norm.y).toBe(50);
    });

    it('経度が180を超えたら-180〜180に正規化する', () => {
      const coord = new Coordinate(200, 0);
      const norm = coord.normalize();
      expect(norm.x).toBe(-160);
    });

    it('経度が-180未満なら-180〜180に正規化する', () => {
      const coord = new Coordinate(-200, 0);
      const norm = coord.normalize();
      expect(norm.x).toBe(160);
    });

    it('経度が360を超える場合も正規化する', () => {
      const coord = new Coordinate(540, 0);
      const norm = coord.normalize();
      expect(norm.x).toBe(180);
    });

    it('緯度が90を超えたら90にクランプする', () => {
      const coord = new Coordinate(0, 100);
      const norm = coord.normalize();
      expect(norm.y).toBe(90);
    });

    it('緯度が-90未満なら-90にクランプする', () => {
      const coord = new Coordinate(0, -100);
      const norm = coord.normalize();
      expect(norm.y).toBe(-90);
    });

    it('元のインスタンスは変更しない（イミュータブル）', () => {
      const coord = new Coordinate(200, 100);
      coord.normalize();
      expect(coord.x).toBe(200);
      expect(coord.y).toBe(100);
    });
  });
});
