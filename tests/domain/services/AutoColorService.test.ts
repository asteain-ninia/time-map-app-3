import { describe, it, expect } from 'vitest';
import {
  buildAdjacencyGraph,
  buildAdjacencyGraphWithAll,
  greedyColoring,
  getColorFromPalette,
  deriveColor,
  generateSelectedColor,
  autoColor,
  rgbToHsl,
  hslToRgb,
} from '@domain/services/AutoColorService';

const PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];

describe('AutoColorService', () => {
  describe('buildAdjacencyGraph', () => {
    it('空の隣接リストから空グラフ', () => {
      const g = buildAdjacencyGraph([]);
      expect(g.size).toBe(0);
    });

    it('隣接ペアから双方向グラフを構築', () => {
      const g = buildAdjacencyGraph([['a', 'b'], ['b', 'c']]);
      expect(g.get('a')!.has('b')).toBe(true);
      expect(g.get('b')!.has('a')).toBe(true);
      expect(g.get('b')!.has('c')).toBe(true);
      expect(g.get('c')!.has('b')).toBe(true);
    });
  });

  describe('buildAdjacencyGraphWithAll', () => {
    it('孤立ノードも含む', () => {
      const g = buildAdjacencyGraphWithAll(
        ['a', 'b', 'c'],
        [['a', 'b']]
      );
      expect(g.has('c')).toBe(true);
      expect(g.get('c')!.size).toBe(0);
    });

    it('存在しないノードの隣接は無視', () => {
      const g = buildAdjacencyGraphWithAll(
        ['a', 'b'],
        [['a', 'x']] // xは存在しない
      );
      expect(g.get('a')!.size).toBe(0);
    });
  });

  describe('greedyColoring', () => {
    it('空グラフは0色', () => {
      const result = greedyColoring(new Map());
      expect(result.colorCount).toBe(0);
      expect(result.colorMap.size).toBe(0);
    });

    it('孤立ノードはすべて色0', () => {
      const g = buildAdjacencyGraphWithAll(['a', 'b', 'c'], []);
      const result = greedyColoring(g);
      expect(result.colorCount).toBe(1);
      for (const c of result.colorMap.values()) {
        expect(c).toBe(0);
      }
    });

    it('2ノード1辺は2色', () => {
      const g = buildAdjacencyGraph([['a', 'b']]);
      const result = greedyColoring(g);
      expect(result.colorCount).toBe(2);
      expect(result.colorMap.get('a')).not.toBe(result.colorMap.get('b'));
    });

    it('三角形は3色', () => {
      const g = buildAdjacencyGraph([['a', 'b'], ['b', 'c'], ['a', 'c']]);
      const result = greedyColoring(g);
      expect(result.colorCount).toBe(3);
      const colors = new Set(result.colorMap.values());
      expect(colors.size).toBe(3);
    });

    it('4ノード完全グラフは4色', () => {
      const g = buildAdjacencyGraph([
        ['a', 'b'], ['a', 'c'], ['a', 'd'],
        ['b', 'c'], ['b', 'd'],
        ['c', 'd'],
      ]);
      const result = greedyColoring(g);
      expect(result.colorCount).toBe(4);
    });

    it('隣接ノードは異なる色', () => {
      const adjacencies: [string, string][] = [
        ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['a', 'c'],
      ];
      const g = buildAdjacencyGraph(adjacencies);
      const result = greedyColoring(g);

      for (const [n1, n2] of adjacencies) {
        expect(result.colorMap.get(n1)).not.toBe(result.colorMap.get(n2));
      }
    });

    it('線形グラフは2色で済む', () => {
      const g = buildAdjacencyGraph([
        ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'],
      ]);
      const result = greedyColoring(g);
      expect(result.colorCount).toBeLessThanOrEqual(2);
    });
  });

  describe('getColorFromPalette', () => {
    it('パレット内のインデックスはそのまま返す', () => {
      expect(getColorFromPalette(0, PALETTE)).toBe('#ff0000');
      expect(getColorFromPalette(3, PALETTE)).toBe('#ffff00');
    });

    it('パレット超過時は派生色を返す', () => {
      const c = getColorFromPalette(4, PALETTE);
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(c).not.toBe(PALETTE[0]); // 派生色は元と異なる
    });

    it('空パレットはグレーを返す', () => {
      expect(getColorFromPalette(0, [])).toBe('#808080');
    });
  });

  describe('deriveColor', () => {
    it('派生色は基準色と異なる', () => {
      const derived = deriveColor('#ff0000', 1);
      expect(derived).not.toBe('#ff0000');
    });

    it('異なるvariationで異なる色を生成', () => {
      const c1 = deriveColor('#3cb44b', 1);
      const c2 = deriveColor('#3cb44b', 2);
      expect(c1).not.toBe(c2);
    });

    it('有効なCSS色を返す', () => {
      const c = deriveColor('#e6194b', 3);
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('generateSelectedColor', () => {
    it('選択色は通常色より明るい', () => {
      const fill = '#3cb44b';
      const selected = generateSelectedColor(fill);
      // HSLで明度が高いことを確認
      expect(selected).not.toBe(fill);
      expect(selected).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('無効な色にはフォールバック', () => {
      const selected = generateSelectedColor('invalid');
      expect(selected).toBe('#66ccff');
    });
  });

  describe('autoColor', () => {
    it('隣接のない地物群は全て同色', () => {
      const result = autoColor(['f1', 'f2', 'f3'], [], PALETTE);
      expect(result.fillColors.size).toBe(3);
      const colors = new Set(result.fillColors.values());
      expect(colors.size).toBe(1); // 全て色0
    });

    it('隣接地物は異なる色', () => {
      const result = autoColor(
        ['f1', 'f2', 'f3'],
        [['f1', 'f2'], ['f2', 'f3']],
        PALETTE
      );
      expect(result.fillColors.get('f1')).not.toBe(result.fillColors.get('f2'));
      expect(result.fillColors.get('f2')).not.toBe(result.fillColors.get('f3'));
    });

    it('選択色も生成される', () => {
      const result = autoColor(['f1', 'f2'], [['f1', 'f2']], PALETTE);
      expect(result.selectedColors.size).toBe(2);
      for (const [id, fill] of result.fillColors) {
        const selected = result.selectedColors.get(id);
        expect(selected).toBeDefined();
        expect(selected).not.toBe(fill);
      }
    });

    it('パレット色が使われる', () => {
      const result = autoColor(['f1'], [], PALETTE);
      expect(result.fillColors.get('f1')).toBe(PALETTE[0]);
    });
  });

  describe('色変換', () => {
    it('rgbToHsl → hslToRgb の往復変換', () => {
      const cases = [
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
        { r: 128, g: 128, b: 128 },
        { r: 255, g: 255, b: 0 },
      ];
      for (const { r, g, b } of cases) {
        const hsl = rgbToHsl(r, g, b);
        const rgb2 = hslToRgb(hsl.h, hsl.s, hsl.l);
        expect(rgb2.r).toBeCloseTo(r, 0);
        expect(rgb2.g).toBeCloseTo(g, 0);
        expect(rgb2.b).toBeCloseTo(b, 0);
      }
    });

    it('白はHSL(0, 0, 1)', () => {
      const hsl = rgbToHsl(255, 255, 255);
      expect(hsl.l).toBeCloseTo(1, 2);
      expect(hsl.s).toBe(0);
    });

    it('黒はHSL(0, 0, 0)', () => {
      const hsl = rgbToHsl(0, 0, 0);
      expect(hsl.l).toBe(0);
    });
  });
});
