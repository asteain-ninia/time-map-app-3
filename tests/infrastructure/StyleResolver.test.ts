import { describe, it, expect } from 'vitest';
import {
  buildSharedBoundaryAdjacencies,
  createDefaultPolygonStyle,
  getAvailablePaletteNames,
  getPalette,
  getAutoColor,
  resolvePolygonAutoColors,
  resolveStyle,
  resolveLineStyle,
  resolvePointStyle,
} from '@infrastructure/StyleResolver';
import type { PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import type { WorldSettings } from '@domain/entities/World';
import { DEFAULT_SETTINGS } from '@domain/entities/World';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';

function makeVertices(
  ...defs: Array<[string, number, number]>
): ReadonlyMap<string, Vertex> {
  const vertices = new Map<string, Vertex>();
  for (const [id, lon, lat] of defs) {
    vertices.set(id, new Vertex(id, new Coordinate(lon, lat)));
  }
  return vertices;
}

function makePolygonEntry(
  featureId: string,
  vertexIds: readonly string[],
  style?: PolygonStyle
) {
  return {
    featureId,
    shape: {
      type: 'Polygon' as const,
      rings: [new Ring(`${featureId}-ring`, vertexIds, 'territory', null)],
    },
    style,
  };
}

describe('StyleResolver', () => {
  describe('getPalette', () => {
    it('クラシックパレットを返す', () => {
      const palette = getPalette('クラシック');
      expect(palette.length).toBeGreaterThan(0);
      expect(palette[0]).toMatch(/^#/);
    });

    it('追加された組み込みパレットを返す', () => {
      expect(getPalette('パステル').length).toBeGreaterThan(0);
      expect(getPalette('ハイコントラスト').length).toBeGreaterThan(0);
    });

    it('未知のパレットはクラシックを返す', () => {
      expect(getPalette('unknown')).toEqual(getPalette('クラシック'));
    });
  });

  describe('getAvailablePaletteNames', () => {
    it('選択可能なパレット名を返す', () => {
      expect(getAvailablePaletteNames()).toEqual(
        expect.arrayContaining(['クラシック', 'パステル', 'ハイコントラスト'])
      );
    });
  });

  describe('getAutoColor', () => {
    it('インデックスに対応した色を返す', () => {
      const c0 = getAutoColor(0);
      const c1 = getAutoColor(1);
      expect(c0).not.toBe(c1);
    });

    it('パレットサイズを超えるとラップする', () => {
      const palette = getPalette('クラシック');
      expect(getAutoColor(palette.length)).toBe(getAutoColor(0));
    });
  });

  describe('resolveStyle', () => {
    it('スタイル未定義で自動配色', () => {
      const style = resolveStyle(undefined, 0);
      expect(style.fillColor).toBeTruthy();
      expect(style.opacity).toBeGreaterThan(0);
    });

    it('スタイル未定義で異なるインデックスは異なる色', () => {
      const s0 = resolveStyle(undefined, 0);
      const s1 = resolveStyle(undefined, 1);
      expect(s0.fillColor).not.toBe(s1.fillColor);
    });

    it('明示的なスタイル（autoColor=false）', () => {
      const polygonStyle: PolygonStyle = {
        fillColor: '#ff0000',
        selectedFillColor: '#00ff00',
        autoColor: false,
        palette: 'クラシック',
      };
      const style = resolveStyle(polygonStyle, 0);
      expect(style.fillColor).toBe('#ff0000');
      expect(style.selectedFillColor).toBe('#00ff00');
    });

    it('明示的なスタイル（autoColor=true）', () => {
      const polygonStyle: PolygonStyle = {
        fillColor: '#ff0000',
        selectedFillColor: '#00ff00',
        autoColor: true,
        palette: 'クラシック',
      };
      const style = resolveStyle(polygonStyle, 0);
      // autoColor=true なのでパレットから取得
      expect(style.fillColor).not.toBe('#ff0000');
    });

    it('自動配色時の選択色は解決後の塗り色から再計算する', () => {
      const polygonStyle: PolygonStyle = {
        fillColor: '#ff0000',
        selectedFillColor: '#00ff00',
        autoColor: true,
        palette: 'クラシック',
      };
      const style = resolveStyle(polygonStyle, 0, undefined, 1, {
        fillColor: '#123456',
        selectedFillColor: '#abcdef',
      });
      expect(style.fillColor).toBe('#123456');
      expect(style.selectedFillColor).toBe('#abcdef');
    });

    it('レイヤー透明度が反映される', () => {
      const full = resolveStyle(undefined, 0, undefined, 1);
      const half = resolveStyle(undefined, 0, undefined, 0.5);
      expect(half.opacity).toBeLessThan(full.opacity);
    });

    it('設定の defaultAutoColor=false', () => {
      const settings: WorldSettings = {
        ...DEFAULT_SETTINGS,
        defaultAutoColor: false,
      };
      const style = resolveStyle(undefined, 0, settings);
      // autoColor=false のデフォルト色
      expect(style.fillColor).toBe('#4363d8');
    });
  });

  describe('resolveLineStyle', () => {
    it('線のスタイルを解決する', () => {
      const style = resolveLineStyle(0);
      expect(style.strokeColor).toBeTruthy();
      expect(style.strokeWidth).toBeGreaterThan(0);
    });

    it('レイヤー透明度が反映される', () => {
      const style = resolveLineStyle(0, undefined, 0.5);
      expect(style.opacity).toBe(0.5);
    });
  });

  describe('createDefaultPolygonStyle', () => {
    it('既定パレットと自動配色設定から新規面の初期スタイルを作る', () => {
      const style = createDefaultPolygonStyle(2, {
        defaultAutoColor: true,
        defaultPalette: 'パステル',
      });
      expect(style.autoColor).toBe(true);
      expect(style.palette).toBe('パステル');
      expect(style.fillColor).toBe(getAutoColor(2, 'パステル'));
      expect(style.selectedFillColor).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('buildSharedBoundaryAdjacencies', () => {
    it('共有辺を持つ面同士だけを隣接として抽出する', () => {
      const vertices = makeVertices(
        ['a1', 0, 0],
        ['a2', 1, 0],
        ['a3', 1, 1],
        ['a4', 0, 1],
        ['b1', 1, 0],
        ['b2', 2, 0],
        ['b3', 2, 1],
        ['b4', 1, 1],
        ['c1', 3, 0],
        ['c2', 4, 0],
        ['c3', 4, 1],
        ['c4', 3, 1]
      );

      const adjacencies = buildSharedBoundaryAdjacencies([
        makePolygonEntry('A', ['a1', 'a2', 'a3', 'a4']),
        makePolygonEntry('B', ['b1', 'b2', 'b3', 'b4']),
        makePolygonEntry('C', ['c1', 'c2', 'c3', 'c4']),
      ], vertices);

      expect(adjacencies).toEqual([['A', 'B']]);
    });
  });

  describe('resolvePolygonAutoColors', () => {
    it('共有辺を持つ面には異なる色を割り当てる', () => {
      const vertices = makeVertices(
        ['a1', 0, 0],
        ['a2', 1, 0],
        ['a3', 1, 1],
        ['a4', 0, 1],
        ['b1', 1, 0],
        ['b2', 2, 0],
        ['b3', 2, 1],
        ['b4', 1, 1]
      );

      const colors = resolvePolygonAutoColors([
        makePolygonEntry('A', ['a1', 'a2', 'a3', 'a4'], {
          fillColor: '#000000',
          selectedFillColor: '#111111',
          autoColor: true,
          palette: 'クラシック',
        }),
        makePolygonEntry('B', ['b1', 'b2', 'b3', 'b4'], {
          fillColor: '#000000',
          selectedFillColor: '#111111',
          autoColor: true,
          palette: 'クラシック',
        }),
      ], vertices);

      expect(colors.get('A')?.fillColor).toBeDefined();
      expect(colors.get('B')?.fillColor).toBeDefined();
      expect(colors.get('A')?.fillColor).not.toBe(colors.get('B')?.fillColor);
      expect(colors.get('A')?.selectedFillColor).not.toBe(colors.get('A')?.fillColor);
    });

    it('180度超の生値経度を含む共有辺も隣接として扱う', () => {
      const vertices = makeVertices(
        ['a1', 170, -5],
        ['a2', 180, -5],
        ['a3', 180, 5],
        ['a4', 170, 5],
        ['b1', 180, -5],
        ['b2', 190, -5],
        ['b3', 190, 5],
        ['b4', 180, 5]
      );

      const colors = resolvePolygonAutoColors([
        makePolygonEntry('A', ['a1', 'a2', 'a3', 'a4']),
        makePolygonEntry('B', ['b1', 'b2', 'b3', 'b4']),
      ], vertices, DEFAULT_SETTINGS);

      expect(colors.get('A')?.fillColor).not.toBe(colors.get('B')?.fillColor);
    });
  });

  describe('resolvePointStyle', () => {
    it('点のスタイルを解決する', () => {
      const style = resolvePointStyle(0);
      expect(style.fillColor).toBeTruthy();
      expect(style.radius).toBeGreaterThan(0);
    });

    it('レイヤー透明度が反映される', () => {
      const style = resolvePointStyle(0, undefined, 0.3);
      expect(style.opacity).toBeCloseTo(0.3);
    });
  });
});
