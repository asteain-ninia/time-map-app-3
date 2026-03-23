/**
 * 四色定理ベース自動配色ドメインサービス
 *
 * §2.4.4: 自動配色の考え方
 * - 同一レイヤー内で共有境界を持つ面が同色にならないように色を割り当てる
 * - 四色定理ベース: 平面グラフは4色で彩色可能
 * - 派生色の生成: 4色で足りない場合は明度・彩度をずらして差別化
 * - 選択表示色は通常表示色より明るく鮮やかに調整
 *
 * 隣接グラフの構築 → 貪欲彩色 → パレット色の割り当て
 */

/** 隣接グラフ（地物IDからその隣接地物IDの集合へ） */
export type AdjacencyGraph = ReadonlyMap<string, ReadonlySet<string>>;

/** 配色結果 */
export interface ColorAssignment {
  /** 地物IDから色インデックスへの割り当て */
  readonly colorMap: ReadonlyMap<string, number>;
  /** 使用した色の数 */
  readonly colorCount: number;
}

/** 自動配色結果（色値付き） */
export interface AutoColorResult {
  /** 地物IDから通常表示色への割り当て */
  readonly fillColors: ReadonlyMap<string, string>;
  /** 地物IDから選択表示色への割り当て */
  readonly selectedColors: ReadonlyMap<string, string>;
}

// ── 隣接グラフ構築 ──

/**
 * 隣接情報から隣接グラフを構築する
 *
 * @param adjacencies [featureIdA, featureIdB] のペア配列
 * @returns 隣接グラフ
 */
export function buildAdjacencyGraph(
  adjacencies: readonly [string, string][]
): AdjacencyGraph {
  const graph = new Map<string, Set<string>>();

  const ensureNode = (id: string) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };

  for (const [a, b] of adjacencies) {
    ensureNode(a);
    ensureNode(b);
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  }

  return graph;
}

/**
 * 地物IDリストから全ノードを含む隣接グラフを構築する
 * （隣接のない孤立ノードも含む）
 */
export function buildAdjacencyGraphWithAll(
  featureIds: readonly string[],
  adjacencies: readonly [string, string][]
): AdjacencyGraph {
  const graph = new Map<string, Set<string>>();

  for (const id of featureIds) {
    graph.set(id, new Set());
  }

  for (const [a, b] of adjacencies) {
    if (graph.has(a) && graph.has(b)) {
      graph.get(a)!.add(b);
      graph.get(b)!.add(a);
    }
  }

  return graph;
}

// ── グラフ彩色 ──

/**
 * 貪欲法によるグラフ彩色
 *
 * §2.4.4.3: 四色定理ベース
 * 平面グラフは4色で彩色可能だが、貪欲法では最適解を保証しない。
 * 次数の大きいノードから処理することで色数を抑える（Welsh-Powell法）。
 *
 * @param graph 隣接グラフ
 * @returns 配色結果
 */
export function greedyColoring(graph: AdjacencyGraph): ColorAssignment {
  const colorMap = new Map<string, number>();

  // Welsh-Powell: 次数降順にソート
  const nodes = [...graph.keys()].sort((a, b) => {
    const degA = graph.get(a)?.size ?? 0;
    const degB = graph.get(b)?.size ?? 0;
    return degB - degA;
  });

  let maxColor = 0;

  for (const node of nodes) {
    const neighbors = graph.get(node) ?? new Set();
    const usedColors = new Set<number>();

    for (const neighbor of neighbors) {
      const c = colorMap.get(neighbor);
      if (c !== undefined) usedColors.add(c);
    }

    // 最小の未使用色を見つける
    let color = 0;
    while (usedColors.has(color)) color++;

    colorMap.set(node, color);
    if (color > maxColor) maxColor = color;
  }

  return {
    colorMap,
    colorCount: colorMap.size > 0 ? maxColor + 1 : 0,
  };
}

// ── 色生成 ──

/**
 * パレットから色インデックスに対応する色を取得する
 *
 * §2.4.4.3: パレットの基準色を基に、足りない場合は派生色を生成
 *
 * @param colorIndex 色インデックス
 * @param palette パレット色配列
 * @returns CSS色文字列
 */
export function getColorFromPalette(
  colorIndex: number,
  palette: readonly string[]
): string {
  if (palette.length === 0) return '#808080';
  if (colorIndex < palette.length) return palette[colorIndex];

  // パレットを超えた場合: 基準色から派生色を生成
  const baseIndex = colorIndex % palette.length;
  const variation = Math.floor(colorIndex / palette.length);
  return deriveColor(palette[baseIndex], variation);
}

/**
 * 基準色から派生色を生成する
 *
 * §2.4.4.3: 明度・彩度をわずかにずらした派生色を決定的に生成
 */
export function deriveColor(baseColor: string, variation: number): string {
  const rgb = parseHexColor(baseColor);
  if (!rgb) return baseColor;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // 明度を少しずつずらす（10%刻み、暗すぎ/明るすぎにならないよう制限）
  const lightnessShift = ((variation % 5) + 1) * 0.08;
  // 奇数は明るく、偶数は暗く
  const newL = variation % 2 === 0
    ? Math.min(hsl.l + lightnessShift, 0.85)
    : Math.max(hsl.l - lightnessShift, 0.2);

  // 彩度を微調整
  const satShift = ((variation % 3) + 1) * 0.05;
  const newS = Math.min(Math.max(hsl.s + (variation % 2 === 0 ? satShift : -satShift), 0.1), 1.0);

  const newRgb = hslToRgb(hsl.h, newS, newL);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

/**
 * 選択表示色を生成する
 *
 * §2.4.4.3: 通常表示色より明るく鮮やかになるように調整
 */
export function generateSelectedColor(fillColor: string): string {
  const rgb = parseHexColor(fillColor);
  if (!rgb) return '#66ccff';

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // 明度を上げ、彩度を上げる
  const newL = Math.min(hsl.l + 0.15, 0.90);
  const newS = Math.min(hsl.s + 0.2, 1.0);

  const newRgb = hslToRgb(hsl.h, newS, newL);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

// ── 統合API ──

/**
 * 自動配色を実行する
 *
 * §2.4.4: 隣接関係に基づいて色を決定
 *
 * @param featureIds 対象地物IDリスト
 * @param adjacencies 隣接ペアリスト
 * @param palette パレット色配列
 * @returns 配色結果
 */
export function autoColor(
  featureIds: readonly string[],
  adjacencies: readonly [string, string][],
  palette: readonly string[]
): AutoColorResult {
  const graph = buildAdjacencyGraphWithAll(featureIds, adjacencies);
  const coloring = greedyColoring(graph);

  const fillColors = new Map<string, string>();
  const selectedColors = new Map<string, string>();

  for (const [featureId, colorIndex] of coloring.colorMap) {
    const fill = getColorFromPalette(colorIndex, palette);
    fillColors.set(featureId, fill);
    selectedColors.set(featureId, generateSelectedColor(fill));
  }

  return { fillColors, selectedColors };
}

// ── 色変換ヘルパー ──

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n)))
    .toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(
  r: number, g: number, b: number
): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h, s, l };
}

export function hslToRgb(
  h: number, s: number, l: number
): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}
