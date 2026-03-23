import { describe, it, expect } from 'vitest';
import {
  getPalette,
  getAutoColor,
  resolveStyle,
  resolveLineStyle,
  resolvePointStyle,
} from '@infrastructure/StyleResolver';
import type { PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import type { WorldSettings } from '@domain/entities/World';
import { DEFAULT_SETTINGS } from '@domain/entities/World';

describe('StyleResolver', () => {
  describe('getPalette', () => {
    it('クラシックパレットを返す', () => {
      const palette = getPalette('クラシック');
      expect(palette.length).toBeGreaterThan(0);
      expect(palette[0]).toMatch(/^#/);
    });

    it('未知のパレットはクラシックを返す', () => {
      expect(getPalette('unknown')).toEqual(getPalette('クラシック'));
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
