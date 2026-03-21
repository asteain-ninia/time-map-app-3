import { describe, it, expect } from 'vitest';
import { Ring } from '@domain/value-objects/Ring';

describe('Ring', () => {
  const ring = new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null);

  describe('constructor', () => {
    it('プロパティを正しく保持する', () => {
      expect(ring.id).toBe('r1');
      expect(ring.vertexIds).toEqual(['v1', 'v2', 'v3']);
      expect(ring.ringType).toBe('territory');
      expect(ring.parentId).toBeNull();
    });

    it('hole タイプと parentId を指定できる', () => {
      const hole = new Ring('r2', ['v4', 'v5'], 'hole', 'r1');
      expect(hole.ringType).toBe('hole');
      expect(hole.parentId).toBe('r1');
    });
  });

  describe('withVertexIds', () => {
    it('新しい vertexIds で新インスタンスを返す', () => {
      const updated = ring.withVertexIds(['v4', 'v5']);
      expect(updated.vertexIds).toEqual(['v4', 'v5']);
      expect(updated.id).toBe('r1');
      expect(updated.ringType).toBe('territory');
    });

    it('元のインスタンスは変更しない', () => {
      ring.withVertexIds(['v4', 'v5']);
      expect(ring.vertexIds).toEqual(['v1', 'v2', 'v3']);
    });
  });

  describe('withParentId', () => {
    it('新しい parentId で新インスタンスを返す', () => {
      const updated = ring.withParentId('r0');
      expect(updated.parentId).toBe('r0');
      expect(updated.id).toBe('r1');
    });
  });

  describe('equals', () => {
    it('同じ id なら true', () => {
      const other = new Ring('r1', ['v9'], 'hole', 'r0');
      expect(ring.equals(other)).toBe(true);
    });

    it('異なる id なら false', () => {
      const other = new Ring('r2', ['v1', 'v2', 'v3'], 'territory', null);
      expect(ring.equals(other)).toBe(false);
    });
  });
});
