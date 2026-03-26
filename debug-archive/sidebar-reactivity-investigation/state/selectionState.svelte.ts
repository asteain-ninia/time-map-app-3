/**
 * 選択状態の共有リアクティブストア
 *
 * モジュールレベルの $state を使い、App と Sidebar 間で
 * import 経由で同一のリアクティブ状態を共有する。
 * Context API 経由ではシグナル追跡が機能しないため、直接 import 方式を使用。
 */
let _id = $state<string | null>(null);

export const selectionState = {
  get id(): string | null { return _id; },
  set id(v: string | null) { _id = v; },
};
