import { describe, it, expect } from 'vitest';
import {
  validateMerge,
  validateMergeFeatures,
  mergePolygons,
  validateTransfer,
  buildAnnexation,
  buildCession,
} from '@domain/services/MergeService';
import type { RingCoords } from '@domain/services/GeometryService';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor, createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import type { AnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';

const noAncestors = () => [] as string[];

/** 正方形ポリゴン */
function makeSquare(x: number, y: number, size: number): RingCoords[] {
  return [[
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]];
}

const mergeTime = new TimePoint(2000);

/** 末端地物（shape あり / 下位領域なし） */
function makeLeaf(id: string, parentId: string | null = null): Feature {
  const placement: AnchorPlacement = createAnchorPlacement(parentId, []);
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: mergeTime },
      { name: id, description: '' },
      { type: 'Polygon', rings: [new Ring(`${id}-ring`, ['v1', 'v2', 'v3'], 'territory', null)] },
      placement
    ),
  ]);
}

/** 集約地物（shape なし / 下位領域あり） */
function makeContainer(id: string, childIds: readonly string[], parentId: string | null = null): Feature {
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-a1`,
      { start: mergeTime },
      { name: id, description: '' },
      undefined,
      createAnchorPlacement(parentId, childIds)
    ),
  ]);
}

describe('MergeService', () => {
  describe('validateMerge', () => {
    it('2つ以上の地物で有効', () => {
      const result = validateMerge([
        { id: 'f1', hasChildren: false },
        { id: 'f2', hasChildren: false },
      ], noAncestors);
      expect(result.valid).toBe(true);
    });

    it('1つの地物は無効', () => {
      const result = validateMerge([
        { id: 'f1', hasChildren: false },
      ], noAncestors);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2つ以上');
    });

    it('下位領域を持つ地物は無効', () => {
      const result = validateMerge([
        { id: 'f1', hasChildren: false },
        { id: 'f2', hasChildren: true },
      ], noAncestors);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('下位領域');
    });

    it('3つ以上の地物でも有効', () => {
      const result = validateMerge([
        { id: 'f1', hasChildren: false },
        { id: 'f2', hasChildren: false },
        { id: 'f3', hasChildren: false },
      ], noAncestors);
      expect(result.valid).toBe(true);
    });

    it('同一地物の重複指定は無効（§6.6.3 line 584「対象が同一地物ではないこと」）', () => {
      const result = validateMerge([
        { id: 'a', hasChildren: false },
        { id: 'a', hasChildren: false },
      ], noAncestors);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('重複');
    });

    it('上位・下位関係にある地物の同時選択は無効（要件定義書 §2.1 line 351-354）', () => {
      // child の祖先連鎖に parent が含まれる → 同時選択を拒否
      const getAncestors = (id: string) => (id === 'child' ? ['parent', 'root'] : []);
      const result = validateMerge([
        { id: 'parent', hasChildren: true },
        { id: 'child', hasChildren: false },
      ], getAncestors);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('同時に結合対象にできません');
    });

    it('間接的な上位・下位関係（祖父-孫）でも無効', () => {
      const getAncestors = (id: string) => (id === 'grandchild' ? ['parent', 'grandparent'] : []);
      const result = validateMerge([
        { id: 'grandparent', hasChildren: true },
        { id: 'grandchild', hasChildren: false },
      ], getAncestors);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('同時に結合対象にできません');
    });

    it('上位・下位関係にない兄弟同士は有効', () => {
      // 双方に共通の親 root がいるが、root は選択集合に含まれない
      const getAncestors = () => ['root'];
      const result = validateMerge([
        { id: 'siblingA', hasChildren: false },
        { id: 'siblingB', hasChildren: false },
      ], getAncestors);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateMergeFeatures（Feature ベースの共有検証）', () => {
    it('独立した2つの末端地物は有効', () => {
      const a = makeLeaf('a');
      const b = makeLeaf('b');
      const result = validateMergeFeatures(['a', 'b'], [a, b], mergeTime);
      expect(result.valid).toBe(true);
    });

    it('集約地物とその下位領域の同時選択は無効（上位・下位関係）', () => {
      const child = makeLeaf('child', 'container');
      const container = makeContainer('container', ['child']);
      const result = validateMergeFeatures(['container', 'child'], [container, child], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('同時に結合対象にできません');
    });

    it('無関係な集約地物の選択は下位領域チェックで無効', () => {
      const leaf = makeLeaf('leaf');
      const grandchild = makeLeaf('grandchild', 'container');
      const container = makeContainer('container', ['grandchild']);
      // leaf と container（grandchild の親）は上位・下位関係にない → 下位領域チェックで拒否
      const result = validateMergeFeatures(['leaf', 'container'], [leaf, container, grandchild], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('下位領域');
    });

    it('1つだけの選択は件数チェックで無効', () => {
      const a = makeLeaf('a');
      const result = validateMergeFeatures(['a'], [a], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2つ以上');
    });

    it('存在しない地物IDは無効（§6.6.3 line 584 共通事前条件）', () => {
      const a = makeLeaf('a');
      const result = validateMergeFeatures(['a', 'ghost'], [a], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('見つかりません');
    });

    it('指定時刻に有効錨がない地物は無効（時間上有効であること / 時刻変更で古い選択が残るケース）', () => {
      const a = makeLeaf('a');
      // b は mergeTime(2000) より後にしか存在しない → 2000 では非有効
      const b = new Feature('b', 'Polygon', [
        new FeatureAnchor(
          'b-a1',
          { start: new TimePoint(5000) },
          { name: 'b', description: '' },
          { type: 'Polygon', rings: [new Ring('b-ring', ['v1', 'v2', 'v3'], 'territory', null)] },
          createAnchorPlacement(null, [])
        ),
      ]);
      const result = validateMergeFeatures(['a', 'b'], [a, b], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('指定時刻');
    });

    it('面情報以外（点情報）は無効（面地物であること）', () => {
      const a = makeLeaf('a');
      const point = new Feature('p', 'Point', [
        new FeatureAnchor(
          'p-a1',
          { start: mergeTime },
          { name: 'p', description: '' },
          { type: 'Point', vertexId: 'v1' },
          createAnchorPlacement(null, [])
        ),
      ]);
      const result = validateMergeFeatures(['a', 'p'], [a, point], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('面情報');
    });

    it('同一地物の重複指定は無効（対象が同一地物ではないこと）', () => {
      const a = makeLeaf('a');
      const result = validateMergeFeatures(['a', 'a'], [a], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('重複');
    });

    it('「shape なし・childIds 空」の不正不変条件 Polygon は無効（§6.6.8 line 611 防御的 shape 確認 / Command と対称）', () => {
      const a = makeLeaf('a');
      // 不正不変条件: featureType は Polygon だが shape なし・childIds 空（コンテナでも末端でもない）
      const malformed = new Feature('m', 'Polygon', [
        new FeatureAnchor(
          'm-a1',
          { start: mergeTime },
          { name: 'm', description: '' },
          undefined,
          createAnchorPlacement(null, [])
        ),
      ]);
      const result = validateMergeFeatures(['a', 'm'], [a, malformed], mergeTime);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('形状');
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
