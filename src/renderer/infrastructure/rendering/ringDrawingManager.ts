/**
 * リング描画管理（穴/飛び地追加用）
 *
 * §2.3.3.2: 穴/飛び地追加ツール
 * 編集モードでポリゴン選択中に、穴リングまたは飛び地リングを描画する状態管理。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';

/** リング描画タイプ */
export type RingDrawingType = 'hole' | 'exclave';

/** リング描画状態 */
export interface RingDrawingState {
  /** 描画中のリングタイプ */
  readonly type: RingDrawingType;
  /** 対象ポリゴン地物ID */
  readonly featureId: string;
  /** 描画中の座標列 */
  readonly coords: readonly Coordinate[];
}

/**
 * リング描画を開始する
 */
export function startRingDrawing(
  type: RingDrawingType,
  featureId: string
): RingDrawingState {
  return { type, featureId, coords: [] };
}

/**
 * 頂点を追加する
 */
export function addRingVertex(
  state: RingDrawingState,
  coord: Coordinate
): RingDrawingState {
  return { ...state, coords: [...state.coords, coord] };
}

/**
 * 最後の頂点を削除する（Undo）
 */
export function undoRingVertex(
  state: RingDrawingState
): RingDrawingState {
  if (state.coords.length === 0) return state;
  return { ...state, coords: state.coords.slice(0, -1) };
}

/**
 * 確定可能か判定（3点以上で確定可能）
 */
export function canConfirmRing(state: RingDrawingState): boolean {
  return state.coords.length >= 3;
}
