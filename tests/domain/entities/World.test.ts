import { describe, it, expect } from 'vitest';
import { World, DEFAULT_SETTINGS, DEFAULT_METADATA } from '@domain/entities/World';

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
});
