import { describe, it, expect } from 'vitest';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';

describe('Vertex', () => {
  const coord = new Coordinate(139.7, 35.6);
  const vertex = new Vertex('v1', coord);

  it('id と coordinate を保持する', () => {
    expect(vertex.id).toBe('v1');
    expect(vertex.coordinate.x).toBe(139.7);
    expect(vertex.coordinate.y).toBe(35.6);
  });

  it('x, y ゲッターで座標にアクセスできる', () => {
    expect(vertex.x).toBe(139.7);
    expect(vertex.y).toBe(35.6);
  });

  describe('withCoordinate', () => {
    it('新しい座標で新インスタンスを返す', () => {
      const updated = vertex.withCoordinate(new Coordinate(0, 0));
      expect(updated.x).toBe(0);
      expect(updated.y).toBe(0);
      expect(updated.id).toBe('v1');
    });

    it('元のインスタンスは変更しない', () => {
      vertex.withCoordinate(new Coordinate(0, 0));
      expect(vertex.x).toBe(139.7);
    });
  });

  describe('equals', () => {
    it('同じ id なら true', () => {
      const other = new Vertex('v1', new Coordinate(0, 0));
      expect(vertex.equals(other)).toBe(true);
    });

    it('異なる id なら false', () => {
      const other = new Vertex('v2', coord);
      expect(vertex.equals(other)).toBe(false);
    });
  });
});
