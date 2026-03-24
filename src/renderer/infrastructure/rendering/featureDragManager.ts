/**
 * 地物ドラッグ管理
 *
 * §2.3.3.2: 地物移動ツール — 地物全体のドラッグ移動の状態管理。
 * ドラッグ開始→プレビュー更新→確定/キャンセルの流れを管理する。
 */

/** 地物ドラッグ状態 */
export interface FeatureDragState {
  /** ドラッグ中の地物ID */
  readonly featureId: string;
  /** ドラッグ開始時のスクリーン座標 */
  readonly startScreenX: number;
  readonly startScreenY: number;
  /** 現在のスクリーン座標 */
  readonly currentScreenX: number;
  readonly currentScreenY: number;
}

/**
 * 地物ドラッグを開始する
 */
export function startFeatureDrag(
  featureId: string,
  screenX: number,
  screenY: number
): FeatureDragState {
  return {
    featureId,
    startScreenX: screenX,
    startScreenY: screenY,
    currentScreenX: screenX,
    currentScreenY: screenY,
  };
}

/**
 * ドラッグ位置を更新する
 */
export function updateFeatureDrag(
  state: FeatureDragState,
  screenX: number,
  screenY: number
): FeatureDragState {
  return {
    ...state,
    currentScreenX: screenX,
    currentScreenY: screenY,
  };
}

/**
 * 地物ドラッグのスクリーン上の移動量を取得する
 */
export function getFeatureDragDelta(state: FeatureDragState): { dx: number; dy: number } {
  return {
    dx: state.currentScreenX - state.startScreenX,
    dy: state.currentScreenY - state.startScreenY,
  };
}

/**
 * ドラッグが実質的に移動したか判定
 */
export function hasFeatureDragMoved(state: FeatureDragState, threshold: number = 3): boolean {
  const { dx, dy } = getFeatureDragDelta(state);
  return Math.sqrt(dx * dx + dy * dy) > threshold;
}
