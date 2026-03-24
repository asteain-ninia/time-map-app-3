/**
 * 矩形選択（範囲選択）状態管理ユーティリティ
 *
 * §2.3.3.1: マウスドラッグで矩形選択範囲を作成し、
 * 範囲内の頂点を複数選択する。Shift併用で既存選択に追加。
 *
 * ピュア関数で状態を管理し、テスタビリティを確保する。
 */

import type { Coordinate } from '@domain/value-objects/Coordinate';

/** 矩形選択の状態 */
export interface BoxSelectState {
  /** ドラッグ開始点（geo座標） */
  readonly startCoord: Coordinate;
  /** 現在のカーソル位置（geo座標） */
  readonly currentCoord: Coordinate;
  /** Shift併用か（既存選択に追加） */
  readonly isAdditive: boolean;
}

/** 選択矩形（geo座標、正規化済み） */
export interface SelectionBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 矩形選択を開始する */
export function startBoxSelect(
  coord: Coordinate,
  isAdditive: boolean
): BoxSelectState {
  return {
    startCoord: coord,
    currentCoord: coord,
    isAdditive,
  };
}

/** カーソル移動で矩形を更新する */
export function updateBoxSelect(
  state: BoxSelectState,
  coord: Coordinate
): BoxSelectState {
  return { ...state, currentCoord: coord };
}

/** 選択矩形を取得する（座標正規化済み） */
export function getSelectionBox(state: BoxSelectState): SelectionBox {
  const x1 = state.startCoord.x;
  const y1 = state.startCoord.y;
  const x2 = state.currentCoord.x;
  const y2 = state.currentCoord.y;
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

/** 矩形が十分な大きさか（クリックとの区別用） */
export function isBoxLargeEnough(state: BoxSelectState, threshold: number = 0.1): boolean {
  const box = getSelectionBox(state);
  return (box.maxX - box.minX) > threshold || (box.maxY - box.minY) > threshold;
}

/**
 * 矩形内の頂点IDを抽出する
 *
 * @param box 選択矩形
 * @param vertexIds 検索対象の頂点ID群
 * @param vertices 頂点マップ
 * @returns 矩形内の頂点IDセット
 */
export function findVerticesInBox(
  box: SelectionBox,
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, { readonly coordinate: { readonly x: number; readonly y: number } }>
): Set<string> {
  const result = new Set<string>();
  for (const vid of vertexIds) {
    const vertex = vertices.get(vid);
    if (!vertex) continue;
    const { x, y } = vertex.coordinate;
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) {
      result.add(vid);
    }
  }
  return result;
}

/**
 * 選択結果をマージする
 *
 * @param existing 既存の選択セット
 * @param newSelection 新しく選択された頂点
 * @param isAdditive Shift併用（追加モード）
 * @returns マージ後の選択セット
 */
export function mergeSelection(
  existing: ReadonlySet<string>,
  newSelection: ReadonlySet<string>,
  isAdditive: boolean
): Set<string> {
  if (!isAdditive) {
    return new Set(newSelection);
  }
  // 追加モード: 既存 + 新規
  const merged = new Set(existing);
  for (const vid of newSelection) {
    merged.add(vid);
  }
  return merged;
}
