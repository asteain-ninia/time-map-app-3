import { describe, it, expect } from 'vitest';
import {
  validateMerge,
  mergePolygons,
  validateTransfer,
  buildAnnexation,
  buildCession,
} from '@domain/services/MergeService';
import type { RingCoords } from '@domain/services/GeometryService';

/** 正方形ポリゴン */
function makeSquare(x: number, y: number, size: number): RingCoords[] {
  return [[
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]];
}

describe('MergeService', () => {
  describe('validateMerge', () => {
    it('2つ以上の地物で有効', () => {
      const result = validateMerge([
        { id: 'f1', layerId: 'l1', hasChildren: false },
        { id: 'f2', layerId: 'l1', hasChildren: false },
      ]);
      expect(result.valid).toBe(true);
    });

    it('1つの地物は無効', () => {
      const result = validateMerge([
        { id: 'f1', layerId: 'l1', hasChildren: false },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2つ以上');
    });

    it('異なるレイヤーの地物は無効', () => {
      const result = validateMerge([
        { id: 'f1', layerId: 'l1', hasChildren: false },
        { id: 'f2', layerId: 'l2', hasChildren: false },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('同じレイヤー');
    });

    it('下位領域を持つ地物は無効', () => {
      const result = validateMerge([
        { id: 'f1', layerId: 'l1', hasChildren: false },
        { id: 'f2', layerId: 'l1', hasChildren: true },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('下位領域');
    });

    it('3つ以上の地物でも有効', () => {
      const result = validateMerge([
        { id: 'f1', layerId: 'l1', hasChildren: false },
        { id: 'f2', layerId: 'l1', hasChildren: false },
        { id: 'f3', layerId: 'l1', hasChildren: false },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('mergePolygons', () => {
    it('隣接する2つの正方形を結合する', () => {
      const sq1 = makeSquare(0, 0, 10);
      const sq2 = makeSquare(10, 0, 10);
      const result = mergePolygons([sq1, sq2]);
      expect(result.success).toBe(true);
      expect(result.mergedRings.length).toBeGreaterThanOrEqual(1);
      expect(result.mergedPolygons).toHaveLength(1);
      // 結合結果の外周リングは少なくとも4頂点
      expect(result.mergedRings[0].length).toBeGreaterThanOrEqual(4);
    });

    it('離れた2つの正方形を結合する（飛び地として統合）', () => {
      const sq1 = makeSquare(0, 0, 5);
      const sq2 = makeSquare(20, 20, 5);
      const result = mergePolygons([sq1, sq2]);
      expect(result.success).toBe(true);
      expect(result.mergedPolygons).toHaveLength(2);
      expect(result.mergedPolygons[0][0]).toHaveLength(4);
      expect(result.mergedPolygons[1][0]).toHaveLength(4);
    });

    it('重なる正方形を結合する', () => {
      const sq1 = makeSquare(0, 0, 10);
      const sq2 = makeSquare(5, 0, 10);
      const result = mergePolygons([sq1, sq2]);
      expect(result.success).toBe(true);
    });

    it('3つのポリゴンを結合する', () => {
      const sq1 = makeSquare(0, 0, 10);
      const sq2 = makeSquare(10, 0, 10);
      const sq3 = makeSquare(20, 0, 10);
      const result = mergePolygons([sq1, sq2, sq3]);
      expect(result.success).toBe(true);
    });

    it('空の入力は失敗する', () => {
      const result = mergePolygons([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('結合対象がありません');
    });

    it('1つのポリゴンはそのまま返す', () => {
      const sq = makeSquare(0, 0, 10);
      const result = mergePolygons([sq]);
      expect(result.success).toBe(true);
      expect(result.mergedRings).toEqual(sq);
      expect(result.mergedPolygons).toEqual([sq]);
    });
  });

  describe('validateTransfer（所属変更バリデーション）', () => {
    const noAncestors = () => [] as string[];

    it('最上位への移動は常に有効', () => {
      const result = validateTransfer(
        { featureIds: ['f1'], newParentId: null, type: 'cede' },
        noAncestors
      );
      expect(result.valid).toBe(true);
    });

    it('空の地物リストは無効', () => {
      const result = validateTransfer(
        { featureIds: [], newParentId: 'p1', type: 'cede' },
        noAncestors
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('指定されていません');
    });

    it('自分自身を親にはできない', () => {
      const result = validateTransfer(
        { featureIds: ['f1'], newParentId: 'f1', type: 'cede' },
        noAncestors
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('自分自身');
    });

    it('循環参照は検出される', () => {
      // f1の子孫にp1がいる場合、p1を親にはできない
      const getAncestors = (id: string) => {
        if (id === 'p1') return ['f1', 'root'];
        return [];
      };
      const result = validateTransfer(
        { featureIds: ['f1'], newParentId: 'p1', type: 'cede' },
        getAncestors
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('循環参照');
    });

    it('正常な親への移動は有効', () => {
      const getAncestors = (id: string) => {
        if (id === 'p1') return ['root'];
        return [];
      };
      const result = validateTransfer(
        { featureIds: ['f1'], newParentId: 'p1', type: 'cede' },
        getAncestors
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('buildAnnexation（合邦構築）', () => {
    it('合邦転送を構築する', () => {
      const transfer = buildAnnexation('parentA', 'parentB', ['c1', 'c2']);
      expect(transfer.featureIds).toEqual(['c1', 'c2']);
      expect(transfer.newParentId).toBe('parentB');
      expect(transfer.type).toBe('annex');
    });
  });

  describe('buildCession（割譲構築）', () => {
    it('割譲転送を構築する', () => {
      const transfer = buildCession(['c1'], 'newParent');
      expect(transfer.featureIds).toEqual(['c1']);
      expect(transfer.newParentId).toBe('newParent');
      expect(transfer.type).toBe('cede');
    });

    it('最上位への割譲', () => {
      const transfer = buildCession(['c1'], null);
      expect(transfer.newParentId).toBeNull();
    });
  });
});
