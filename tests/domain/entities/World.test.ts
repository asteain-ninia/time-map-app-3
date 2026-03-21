import { describe, it, expect } from 'vitest';
import { World, DEFAULT_SETTINGS, DEFAULT_METADATA } from '@domain/entities/World';
import { Layer } from '@domain/entities/Layer';

describe('World', () => {
  describe('createEmpty', () => {
    const world = World.createEmpty();

    it('バージョンが 1.0.0', () => {
      expect(world.version).toBe('1.0.0');
    });

    it('空の vertices マップ', () => {
      expect(world.vertices.size).toBe(0);
    });

    it('空の features マップ', () => {
      expect(world.features.size).toBe(0);
    });

    it('空の layers 配列', () => {
      expect(world.layers.length).toBe(0);
    });

    it('空の sharedVertexGroups マップ', () => {
      expect(world.sharedVertexGroups.size).toBe(0);
    });

    it('空の timelineMarkers 配列', () => {
      expect(world.timelineMarkers.length).toBe(0);
    });

    it('デフォルトメタデータを持つ', () => {
      expect(world.metadata).toEqual(DEFAULT_METADATA);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('zoomMin/zoomMax が定義されている', () => {
      expect(DEFAULT_SETTINGS.zoomMin).toBe(1);
      expect(DEFAULT_SETTINGS.zoomMax).toBe(50);
    });

    it('gridInterval のデフォルトは 10', () => {
      expect(DEFAULT_SETTINGS.gridInterval).toBe(10);
    });

    it('equatorLength のデフォルトは 40000', () => {
      expect(DEFAULT_SETTINGS.equatorLength).toBe(40000);
    });
  });

  describe('getSortedLayers', () => {
    it('order 昇順でソートする', () => {
      const layers = [
        new Layer('l3', '3番', 3),
        new Layer('l1', '1番', 1),
        new Layer('l2', '2番', 2),
      ];
      const world = new World('1.0.0', new Map(), new Map(), layers, new Map(), [], DEFAULT_METADATA);
      const sorted = world.getSortedLayers();
      expect(sorted[0].id).toBe('l1');
      expect(sorted[1].id).toBe('l2');
      expect(sorted[2].id).toBe('l3');
    });

    it('元の layers 配列は変更しない', () => {
      const layers = [
        new Layer('l2', '2番', 2),
        new Layer('l1', '1番', 1),
      ];
      const world = new World('1.0.0', new Map(), new Map(), layers, new Map(), [], DEFAULT_METADATA);
      world.getSortedLayers();
      expect(world.layers[0].id).toBe('l2');
    });
  });
});
