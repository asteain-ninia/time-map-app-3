/**
 * ナイフツール描画状態管理
 *
 * §2.3.3.2: ナイフツール — 分断線の描画入力管理。
 * 開線（二分割）と閉線（閉線分割）の両方に対応。
 *
 * 閉線判定: 3点以上描画後、カーソルが最初の頂点の一定距離内に入ると
 * 閉線モードに切り替わる。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  validateCuttingLine,
  validateCuttingLineForPolygons,
  type KnifeValidation,
} from '@domain/services/KnifeService';
import type { RingCoords } from '@domain/services/GeometryService';

/** ナイフ描画状態 */
export interface KnifeDrawingState {
  /** 分割対象の地物ID */
  readonly featureId: string;
  /** 描画済みの座標列 */
  readonly coords: readonly Coordinate[];
  /** 閉線モードかどうか（3点以上でカーソルが最初の頂点近傍に入った場合） */
  readonly isClosed: boolean;
}

/**
 * ナイフ描画を開始する
 */
export function startKnifeDrawing(featureId: string): KnifeDrawingState {
  return {
    featureId,
    coords: [],
    isClosed: false,
  };
}

/**
 * 分断線に頂点を追加する
 */
export function addKnifeVertex(
  state: KnifeDrawingState,
  coord: Coordinate
): KnifeDrawingState {
  return {
    ...state,
    coords: [...state.coords, coord],
  };
}

/**
 * 最後の頂点を削除する（Undo）
 */
export function undoKnifeVertex(state: KnifeDrawingState): KnifeDrawingState {
  if (state.coords.length === 0) return state;
  return {
    ...state,
    coords: state.coords.slice(0, -1),
    isClosed: false,
  };
}

/**
 * 閉線モードを切り替える
 */
export function setKnifeClosed(
  state: KnifeDrawingState,
  isClosed: boolean
): KnifeDrawingState {
  return { ...state, isClosed };
}

/**
 * カーソル位置が最初の頂点の閉じ圏内にあるか判定
 *
 * @param state 現在の描画状態
 * @param cursorCoord カーソルの地理座標
 * @param closeRadius 閉じ判定の半径（度単位）
 * @returns 閉じ圏内にあればtrue
 */
export function isNearFirstVertex(
  state: KnifeDrawingState,
  cursorCoord: { x: number; y: number },
  closeRadius: number
): boolean {
  if (state.coords.length < 3) return false;
  const first = state.coords[0];
  const dx = cursorCoord.x - first.x;
  const dy = cursorCoord.y - first.y;
  return Math.sqrt(dx * dx + dy * dy) <= closeRadius;
}

/**
 * 分断線のバリデーションを実行する
 *
 * @param state 描画状態
 * @param polygonRings 対象ポリゴンのリング群（座標配列）
 * @returns バリデーション結果
 */
export function validateKnifeLine(
  state: KnifeDrawingState,
  polygonRings: readonly RingCoords[]
): KnifeValidation {
  const coords = state.coords.map(c => ({ x: c.x, y: c.y }));
  return validateCuttingLine(polygonRings, coords, state.isClosed);
}

/**
 * 複数 territory を持つ面の分断線バリデーションを実行する
 *
 * @param state 描画状態
 * @param polygons 対象ポリゴン群（各要素は外周 + 穴）
 * @returns バリデーション結果
 */
export function validateKnifeLineForPolygons(
  state: KnifeDrawingState,
  polygons: readonly (readonly RingCoords[])[]
): KnifeValidation {
  const coords = state.coords.map(c => ({ x: c.x, y: c.y }));
  return validateCuttingLineForPolygons(polygons, coords, state.isClosed);
}

/**
 * 確定可能か判定する
 *
 * 開線: 2点以上かつバリデーション通過
 * 閉線: 3点以上かつバリデーション通過
 */
export function canConfirmKnife(
  state: KnifeDrawingState,
  polygonRings: readonly RingCoords[]
): boolean {
  if (state.isClosed && state.coords.length < 3) return false;
  if (!state.isClosed && state.coords.length < 2) return false;
  const validation = validateKnifeLine(state, polygonRings);
  return validation.valid;
}

/**
 * 複数 territory を持つ面で確定可能か判定する
 */
export function canConfirmKnifeForPolygons(
  state: KnifeDrawingState,
  polygons: readonly (readonly RingCoords[])[]
): boolean {
  if (state.isClosed && state.coords.length < 3) return false;
  if (!state.isClosed && state.coords.length < 2) return false;
  const validation = validateKnifeLineForPolygons(state, polygons);
  return validation.valid;
}
