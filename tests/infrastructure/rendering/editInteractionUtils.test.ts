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
      hitFeatureId: 'f1',
      hasCurrentTime: true,
      isRingDrawing: false,
      isKnifeDrawing: false,
    };

    it('編集モードかつ地物移動ツール有効時のみ地物ドラッグを開始する', () => {
      expect(shouldStartFeatureDrag(baseParams)).toBe(true);
    });

    it('hitFeatureId が選択中地物と一致すれば開始する', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        hitFeatureId: 'f1',
      })).toBe(true);
    });

    it('hitFeatureId が null なら開始しない', () => {
      expect(shouldStartFeatureDrag({
        ...baseParams,
        hitFeatureId: null,
      })).toBe(false);
    });

    it('hitFeatureId が選択中地物と異なれば開始しない', () => {
      // 親集約地物が選択中で、重なり位置の hitTest は子（深い側）を返したケース。
      // §6.2.25 採用ポリシー（hitTest 優先 + tie-break で深い子を選ぶ）と一貫させ、
      // 「子をクリックしたつもりが親ドラッグになる」回帰を防ぐ。
      expect(shouldStartFeatureDrag({
        ...baseParams,
        selectedFeatureId: 'parent',
        hitFeatureId: 'child',
      })).toBe(false);
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
