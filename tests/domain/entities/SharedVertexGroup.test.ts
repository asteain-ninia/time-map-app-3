import { describe, it, expect } from 'vitest';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';

describe('SharedVertexGroup', () => {
  const coord = new Coordinate(10, 20);
  const group = new SharedVertexGroup('g1', ['v1', 'v2', 'v3'], coord);

  describe('constructor', () => {
    it('プロパティを保持する', () => {
      expect(group.id).toBe('g1');
      expect(group.vertexIds).toEqual(['v1', 'v2', 'v3']);
      expect(group.representativeCoordinate.x).toBe(10);
    });
  });

  describe('withVertexIds', () => {
    it('新しい vertexIds で新インスタンスを返す', () => {
      const updated = group.withVertexIds(['v4', 'v5']);
      expect(updated.vertexIds).toEqual(['v4', 'v5']);
      expect(updated.id).toBe('g1');
    });

    it('元のインスタンスは変更しない', () => {
      group.withVertexIds([]);
      expect(group.vertexIds).toEqual(['v1', 'v2', 'v3']);
    });
  });

  describe('withRepresentativeCoordinate', () => {
    it('新しい座標で新インスタンスを返す', () => {
      const updated = group.withRepresentativeCoordinate(new Coordinate(99, 88));
      expect(updated.representativeCoordinate.x).toBe(99);
      expect(updated.id).toBe('g1');
    });
  });

  describe('shouldBeRemoved', () => {
    it('メンバーが2以上なら false', () => {
      expect(group.shouldBeRemoved()).toBe(false);
    });

    it('メンバーが1なら true', () => {
      const single = group.withVertexIds(['v1']);
      expect(single.shouldBeRemoved()).toBe(true);
    });

    it('メンバーが0なら true', () => {
      const empty = group.withVertexIds([]);
      expect(empty.shouldBeRemoved()).toBe(true);
    });
  });
});
