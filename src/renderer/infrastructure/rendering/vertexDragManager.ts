/**
 * 頂点ドラッグ管理
 *
 * §2.3.3.2: 頂点ハンドルのドラッグによる頂点移動の状態管理。
 * エッジハンドルのドラッグ開始→頂点挿入→ドラッグ継続にも対応。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import { wrapLongitudeNearReference } from './featureRenderingUtils';

/** ドラッグ状態 */
export interface DragState {
  /** ドラッグ中の頂点ID */
  readonly vertexId: string;
  /** ドラッグ開始時の座標 */
  readonly startCoord: Coordinate;
  /** 現在のプレビュー座標 */
  readonly previewCoord: Coordinate;
  /** エッジハンドルから挿入されたか */
  readonly isInserted: boolean;
}

/**
 * ドラッグを開始する
 */
export function startDrag(
  vertexId: string,
  startCoord: Coordinate
): DragState {
  return {
    vertexId,
    startCoord,
    previewCoord: startCoord,
    isInserted: false,
  };
}

/**
 * エッジハンドルから頂点挿入後のドラッグを開始する
 */
export function startInsertDrag(
  vertexId: string,
  insertCoord: Coordinate
): DragState {
  return {
    vertexId,
    startCoord: insertCoord,
    previewCoord: insertCoord,
    isInserted: true,
  };
}

/**
 * プレビュー座標を更新する
 */
export function updateDragPreview(
  state: DragState,
  newCoord: Coordinate
): DragState {
  return {
    ...state,
    previewCoord: newCoord,
  };
}

/**
 * 現在の表示周回に追従するドラッグ座標を生成する
 */
export function createWrappedDragCoordinate(
  referenceLon: number,
  lon: number,
  lat: number
): Coordinate {
  return new Coordinate(wrapLongitudeNearReference(lon, referenceLon), lat);
}

/**
 * ドラッグが実質的に移動したか判定（閾値以下なら移動なし）
 */
export function hasMoved(state: DragState, threshold: number = 0.001): boolean {
  const dx = state.previewCoord.x - state.startCoord.x;
  const dy = state.previewCoord.y - state.startCoord.y;
  return Math.sqrt(dx * dx + dy * dy) > threshold;
}
