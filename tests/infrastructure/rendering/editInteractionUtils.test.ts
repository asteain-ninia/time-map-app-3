import { describe, expect, it } from 'vitest';
import {
  resolveVertexMouseDownState,
  shouldStartFeatureDrag,
} from '@infrastructure/rendering/editInteractionUtils';

describe('editInteractionUtils', () => {
  describe('resolveVertexMouseDownState', () => {
    it('Shift押下時は選択をトグルしてドラッグを開始しない', () => {
      const result = resolveVertexMouseDownState(new Set(['v1']), 'v2', true);

      expect(result.nextSelection).toEqual(new Set(['v1', 'v2']));
      expect(result.shouldStartDrag).toBe(false);
    });

    it('既に選択済みの頂点をドラッグ開始しても複数選択を維持する', () => {
      const result = resolveVertexMouseDownState(new Set(['v1', 'v2']), 'v1', false);

      expect(result.nextSelection).toEqual(new Set(['v1', 'v2']));
      expect(result.shouldStartDrag).toBe(true);
    });

    it('未選択の頂点をドラッグ開始した場合はその頂点だけを選択する', () => {
      const result = resolveVertexMouseDownState(new Set(['v1', 'v2']), 'v3', false);

      expect(result.nextSelection).toEqual(new Set(['v3']));
      expect(result.shouldStartDrag).toBe(true);
    });
  });

  describe('shouldStartFeatureDrag', () => {
    const baseParams = {
      toolMode: 'edit' as const,
      editInteractionMode: 'featureMove' as const,
      selectedFeatureId: 'f1',
      clickedFeatureId: 'f1',
      hitFeatureId: null,
      hasCurrentTime: true,
      isRingDrawing: false,
      isKnifeDrawing: false,
    };

    it('編集モードかつ地物移動ツール有効時のみ地物ドラッグを開始する', () => {
      expect(shouldStartFeatureDrag(baseParams)).toBe(true);
    });

    it('ヒットテスト結果が選択中地物ならクリック元が空でも開始できる', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        clickedFeatureId: null,
        hitFeatureId: 'f1',
      })).toBe(true);
    });

    it('編集モード以外では地物ドラッグを開始しない', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        toolMode: 'view',
      })).toBe(false);
    });

    it('地物移動ツールが無効なら開始しない', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        editInteractionMode: 'vertex',
      })).toBe(false);
    });

    it('穴追加中または分割中は開始しない', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        isRingDrawing: true,
      })).toBe(false);

      expect(shouldStartFeatureDrag({
        ...baseParams,
        isKnifeDrawing: true,
      })).toBe(false);
    });
  });
});
