/**
 * スタイル解決サービス
 *
 * §5.4: StyleResolver — スタイル計算
 * §2.4.4: 自動配色
 *
 * FeatureAnchorのスタイルプロパティとプロジェクト設定から、
 * 実際のレンダリングスタイルを解決する。
 */

import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape, PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import type { WorldSettings } from '@domain/entities/World';
import {
  buildAdjacencyGraphWithAll,
  generateSelectedColor,
  getColorFromPalette,
  greedyColoring,
} from '@domain/services/AutoColorService';
import {
  unwrapLongitudeSequence,
  wrapLongitudeToPrimaryRange,
} from '@infrastructure/rendering/featureRenderingUtils';

/** 解決済みスタイル */
export interface ResolvedStyle {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly selectedFillColor: string;
}

export interface AutoColorFeatureEntry {
  readonly featureId: string;
  readonly shape: FeatureShape;
  readonly style?: PolygonStyle;
}

export interface AutoColorStyle {
  readonly fillColor: string;
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

function roundCoordinate(value: number): number {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return Number(normalized.toFixed(6));
}

function createEdgePointKey(lon: number, lat: number): string {
  return `${roundCoordinate(wrapLongitudeToPrimaryRange(lon))},${roundCoordinate(lat)}`;
}

function createEdgeKey(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number }
): string {
  const startKey = createEdgePointKey(start.lon, start.lat);
  const endKey = createEdgePointKey(end.lon, end.lat);
  return startKey <= endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function collectRingCoordinates(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): Array<{ lon: number; lat: number }> {
  const coords: Array<{ lon: number; lat: number }> = [];
  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      coords.push({ lon: vertex.x, lat: vertex.y });
    }
  }
  if (coords.length < 2) return [];

  const longitudes = unwrapLongitudeSequence(coords.map((coord) => coord.lon));
  return coords.map((coord, index) => ({ lon: longitudes[index], lat: coord.lat }));
}

function isPolygonAutoColorEnabled(
  entry: AutoColorFeatureEntry,
  settings?: Pick<WorldSettings, 'defaultAutoColor'>
): boolean {
  if (entry.shape.type !== 'Polygon') return false;
  return entry.style?.autoColor ?? settings?.defaultAutoColor ?? true;
}

export function buildSharedBoundaryAdjacencies(
  entries: readonly AutoColorFeatureEntry[],
  vertices: ReadonlyMap<string, Vertex>,
  settings?: Pick<WorldSettings, 'defaultAutoColor'>
): Array<[string, string]> {
  const edgeOwners = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!isPolygonAutoColorEnabled(entry, settings) || entry.shape.type !== 'Polygon') {
      continue;
    }

    for (const ring of entry.shape.rings) {
      const coords = collectRingCoordinates(ring.vertexIds, vertices);
      if (coords.length < 2) continue;

      for (let index = 0; index < coords.length; index += 1) {
        const start = coords[index];
        const end = coords[(index + 1) % coords.length];
        if (start.lon === end.lon && start.lat === end.lat) continue;

        const edgeKey = createEdgeKey(start, end);
        let owners = edgeOwners.get(edgeKey);
        if (!owners) {
          owners = new Set<string>();
          edgeOwners.set(edgeKey, owners);
        }
        owners.add(entry.featureId);
      }
    }
  }

  const adjacencyKeys = new Set<string>();
  for (const owners of edgeOwners.values()) {
    const featureIds = [...owners].sort();
    for (let i = 0; i < featureIds.length; i += 1) {
      for (let j = i + 1; j < featureIds.length; j += 1) {
        adjacencyKeys.add(`${featureIds[i]}|${featureIds[j]}`);
      }
    }
  }

  return [...adjacencyKeys].map((pair) => {
    const [a, b] = pair.split('|');
    return [a, b] as [string, string];
  });
}

export function resolvePolygonAutoColors(
  entries: readonly AutoColorFeatureEntry[],
  vertices: ReadonlyMap<string, Vertex>,
  settings?: Pick<WorldSettings, 'defaultAutoColor' | 'defaultPalette'>
): ReadonlyMap<string, AutoColorStyle> {
  const eligibleEntries = entries.filter((entry) => isPolygonAutoColorEnabled(entry, settings));
  if (eligibleEntries.length === 0) {
    return new Map();
  }

  const featureIds = eligibleEntries.map((entry) => entry.featureId);
  const graph = buildAdjacencyGraphWithAll(
    featureIds,
    buildSharedBoundaryAdjacencies(eligibleEntries, vertices, settings)
  );
  const coloring = greedyColoring(graph);
  const styles = new Map<string, AutoColorStyle>();

  for (const entry of eligibleEntries) {
    const colorIndex = coloring.colorMap.get(entry.featureId) ?? 0;
    const paletteName = entry.style?.palette ?? settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;
    const fillColor = getColorFromPalette(colorIndex, getPalette(paletteName));
    styles.set(entry.featureId, {
      fillColor,
      selectedFillColor: generateSelectedColor(fillColor),
    });
  }

  return styles;
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
  layerOpacity: number = 1,
  autoColorStyle?: AutoColorStyle
): ResolvedStyle {
  const autoColor = settings?.defaultAutoColor ?? true;
  const palette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;

  if (!style) {
    // スタイル未定義 → デフォルト + 自動配色
    const color = autoColor
      ? autoColorStyle?.fillColor ?? getAutoColor(featureIndex, palette)
      : DEFAULT_STYLE.fillColor;
    return {
      ...DEFAULT_STYLE,
      fillColor: color,
      opacity: DEFAULT_STYLE.opacity * layerOpacity,
      selectedFillColor: autoColorStyle?.selectedFillColor ?? generateSelectedColor(color),
    };
  }

  // 明示的なスタイルがある場合
  const fillColor = style.autoColor
    ? autoColorStyle?.fillColor ?? getAutoColor(featureIndex, style.palette || palette)
    : style.fillColor;

  return {
    fillColor,
    strokeColor: DEFAULT_STYLE.strokeColor,
    strokeWidth: DEFAULT_STYLE.strokeWidth,
    opacity: DEFAULT_STYLE.opacity * layerOpacity,
    selectedFillColor: style.autoColor
      ? autoColorStyle?.selectedFillColor ?? generateSelectedColor(fillColor)
      : style.selectedFillColor || DEFAULT_STYLE.selectedFillColor,
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
