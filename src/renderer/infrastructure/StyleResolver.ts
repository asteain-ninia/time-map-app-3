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

/** 解決済みスタイル */
export interface ResolvedStyle {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly selectedFillColor: string;
}

/** デフォルトパレット */
const CLASSIC_PALETTE: readonly string[] = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9A6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
];

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
  // 現在はクラシックのみ。将来カスタムパレットを追加可能
  switch (paletteName) {
    case 'クラシック':
    case 'classic':
      return CLASSIC_PALETTE;
    default:
      return CLASSIC_PALETTE;
  }
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
  paletteName: string = 'クラシック'
): string {
  const palette = getPalette(paletteName);
  return palette[index % palette.length];
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
  const palette = settings?.defaultPalette ?? 'クラシック';

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
  const palette = settings?.defaultPalette ?? 'クラシック';
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
  const palette = settings?.defaultPalette ?? 'クラシック';
  const color = autoColor
    ? getAutoColor(featureIndex, palette)
    : '#333333';

  return {
    fillColor: color,
    radius: 4,
    opacity: layerOpacity,
  };
}
