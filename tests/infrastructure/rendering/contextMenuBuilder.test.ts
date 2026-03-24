import { describe, it, expect, vi } from 'vitest';
import {
  buildContextMenuItems,
  type ContextMenuContext,
  type ContextMenuActions,
} from '@infrastructure/rendering/contextMenuBuilder';

function createActions(): ContextMenuActions {
  return {
    onDelete: vi.fn(),
    onDeleteVertex: vi.fn(),
    onUnmergeVertex: vi.fn(),
    onAddHole: vi.fn(),
    onAddExclave: vi.fn(),
    onStartKnife: vi.fn(),
    onAddMergeTarget: vi.fn(),
  };
}

describe('contextMenuBuilder', () => {
  describe('buildContextMenuItems', () => {
    it('地物未選択なら空', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: null,
        featureType: null,
        selectedVertexCount: 0,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      expect(items.length).toBe(0);
    });

    it('地物選択のみ → 削除メニューが出る', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Point',
        selectedVertexCount: 0,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).toContain('削除');
    });

    it('Polygon地物 → 面固有メニューが出る', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 0,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).toContain('穴追加');
      expect(labels).toContain('飛び地追加');
      expect(labels).toContain('分割');
      expect(labels).toContain('結合対象に追加');
    });

    it('LineString地物 → 面固有メニューは出ない', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'LineString',
        selectedVertexCount: 0,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).not.toContain('穴追加');
      expect(labels).not.toContain('分割');
    });

    it('頂点選択あり → 頂点削除メニューが出る', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 3,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).toContain('頂点削除 (3個)');
    });

    it('共有頂点あり → 共有解除メニューが出る', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 1,
        hasSharedVertex: true,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).toContain('共有解除');
    });

    it('共有頂点なし → 共有解除メニューは出ない', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 1,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const labels = items.filter(i => !('separator' in i && i.separator)).map(i => (i as any).label);
      expect(labels).not.toContain('共有解除');
    });

    it('アクションが正しく紐付けられる', () => {
      const actions = createActions();
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 1,
        hasSharedVertex: true,
      };
      const items = buildContextMenuItems(ctx, actions);
      const deleteItem = items.find(i => !('separator' in i && i.separator) && (i as any).label === '削除');
      expect(deleteItem).toBeDefined();
      (deleteItem as any).action();
      expect(actions.onDelete).toHaveBeenCalled();
    });

    it('セパレーターが適切に挿入される', () => {
      const ctx: ContextMenuContext = {
        selectedFeatureId: 'f1',
        featureType: 'Polygon',
        selectedVertexCount: 2,
        hasSharedVertex: false,
      };
      const items = buildContextMenuItems(ctx, createActions());
      const separators = items.filter(i => 'separator' in i && i.separator);
      expect(separators.length).toBeGreaterThanOrEqual(1);
    });
  });
});
