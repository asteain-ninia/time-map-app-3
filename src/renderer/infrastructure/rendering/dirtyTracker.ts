/**
 * ダーティ状態トラッカー（純粋ユーティリティ）
 *
 * §2.5: 未保存変更の警告。変更の有無を追跡し、
 * ウィンドウクローズ・新規プロジェクト・ファイル開く時に警告を表示する。
 */

export interface DirtyState {
  /** 未保存の変更があるか */
  readonly isDirty: boolean;
  /** 最後に保存/読み込みしたときのバージョン番号 */
  readonly savedVersion: number;
  /** 現在のバージョン番号（変更のたびにインクリメント） */
  readonly currentVersion: number;
}

/** 初期状態を作成する */
export function createDirtyState(): DirtyState {
  return { isDirty: false, savedVersion: 0, currentVersion: 0 };
}

/** 変更を記録する */
export function markDirty(state: DirtyState): DirtyState {
  const newVersion = state.currentVersion + 1;
  return {
    isDirty: true,
    savedVersion: state.savedVersion,
    currentVersion: newVersion,
  };
}

/** 保存完了を記録する */
export function markSaved(state: DirtyState): DirtyState {
  return {
    isDirty: false,
    savedVersion: state.currentVersion,
    currentVersion: state.currentVersion,
  };
}

/** 新規プロジェクト/読み込み時にリセット */
export function resetDirty(): DirtyState {
  return createDirtyState();
}
