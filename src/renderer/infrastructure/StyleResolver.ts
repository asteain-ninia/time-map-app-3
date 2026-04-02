/**
 * スタイル解決サービス
 *
 * §5.4: StyleResolver — スタイル計算
 * §2.4.4: 自動配色
 *
 * FeatureAnchorのスタイルプロパティとプロジェクト設定から、
 * 実際のレンダリングスタイルを解決する。
 */

import type { PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import type { WorldSettings } from '@domain/entities/World';
import { generateSelectedColor } from '@domain/services/AutoColorService';

/** 解決済みスタイル */
export interface ResolvedStyle {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly selectedFillColor: string;
}

export const DEFAULT_PALETTE_NAME = 'クラシック';

/** 組み込みパレット */
const PALETTE_PRESETS = {
  クラシック: [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
    '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
  ],
  パステル: [
    '#f4a7b9', '#a8d8b9', '#f7d794', '#a9c8ff',
    '#f8b88b', '#d3b5ff', '#a7e3ef', '#f7b7e3',
  ],
  ハイコントラスト: [
    '#d00000', '#0056d6', '#f0a202', '#008148',
    '#6a00f4', '#111111',
  ],
} as const satisfies Record<string, readonly string[]>;

export type PaletteName = keyof typeof PALETTE_PRESETS;

const LEGACY_PALETTE_ALIASES: Record<string, PaletteName> = {
  classic: 'クラシック',
};

export function getAvailablePaletteNames(): readonly PaletteName[] {
  return Object.keys(PALETTE_PRESETS) as PaletteName[];
}

/** デフォルトスタイル */
const DEFAULT_STYLE: ResolvedStyle = {
  fillColor: '#4363d8',
  strokeColor: '#333333',
  strokeWidth: 1,
  opacity: 0.6,
  selectedFillColor: '#00cccc',
};

/**
 * パレット名からカラー配列を取得する
 */
export function getPalette(paletteName: string): readonly string[] {
  const normalizedName = LEGACY_PALETTE_ALIASES[paletteName] ?? paletteName;
  return PALETTE_PRESETS[normalizedName as PaletteName] ?? PALETTE_PRESETS[DEFAULT_PALETTE_NAME];
}

/**
 * 自動配色で色を取得する
 *
 * §2.4.4: パレットからインデックスで色を決定
 *
 * @param index パレット内のインデックス（地物のレイヤー内順序など）
 * @param paletteName パレット名
 */
export function getAutoColor(
  index: number,
  paletteName: string = DEFAULT_PALETTE_NAME
): string {
  const palette = getPalette(paletteName);
  return palette[index % palette.length];
}

export function createDefaultPolygonStyle(
  featureIndex: number,
  settings?: Pick<WorldSettings, 'defaultAutoColor' | 'defaultPalette'>
): PolygonStyle {
  const palette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;
  const fillColor = getAutoColor(featureIndex, palette);
  return {
    fillColor,
    selectedFillColor: generateSelectedColor(fillColor),
    autoColor: settings?.defaultAutoColor ?? true,
    palette,
  };
}

/**
 * FeatureAnchorのスタイルを解決する
 *
 * @param style FeatureAnchorのPolygonStyle（省略可）
 * @param featureIndex パレット内のインデックス
 * @param settings プロジェクト設定
 * @param layerOpacity レイヤーの透明度
 */
export function resolveStyle(
  style: PolygonStyle | undefined,
  featureIndex: number,
  settings?: WorldSettings,
  layerOpacity: number = 1
): ResolvedStyle {
  const autoColor = settings?.defaultAutoColor ?? true;
  const palette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;

  if (!style) {
    // スタイル未定義 → デフォルト + 自動配色
    const color = autoColor ? getAutoColor(featureIndex, palette) : DEFAULT_STYLE.fillColor;
    return {
      ...DEFAULT_STYLE,
      fillColor: color,
      opacity: DEFAULT_STYLE.opacity * layerOpacity,
    };
  }

  // 明示的なスタイルがある場合
  const fillColor = style.autoColor
    ? getAutoColor(featureIndex, style.palette || palette)
    : style.fillColor;

  return {
    fillColor,
    strokeColor: DEFAULT_STYLE.strokeColor,
    strokeWidth: DEFAULT_STYLE.strokeWidth,
    opacity: DEFAULT_STYLE.opacity * layerOpacity,
    selectedFillColor: style.selectedFillColor || DEFAULT_STYLE.selectedFillColor,
  };
}

/**
 * 線のスタイルを解決する
 */
export function resolveLineStyle(
  featureIndex: number,
  settings?: WorldSettings,
  layerOpacity: number = 1
): { strokeColor: string; strokeWidth: number; opacity: number } {
  const autoColor = settings?.defaultAutoColor ?? true;
  const palette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;
  const color = autoColor
    ? getAutoColor(featureIndex, palette)
    : '#333333';

  return {
    strokeColor: color,
    strokeWidth: 2,
    opacity: layerOpacity,
  };
}

/**
 * 点のスタイルを解決する
 */
export function resolvePointStyle(
  featureIndex: number,
  settings?: WorldSettings,
  layerOpacity: number = 1
): { fillColor: string; radius: number; opacity: number } {
  const autoColor = settings?.defaultAutoColor ?? true;
  const palette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;
  const color = autoColor
    ? getAutoColor(featureIndex, palette)
    : '#333333';

  return {
    fillColor: color,
    radius: 4,
    opacity: layerOpacity,
  };
}
