/**
 * キーボードショートカット管理（純粋ユーティリティ）
 *
 * §2.7.3: ショートカット定義の一元管理。
 * UIへのツールチップ表示にも使用する。
 */

export interface ShortcutDefinition {
  /** ショートカットキー表示文字列 */
  readonly label: string;
  /** 操作説明 */
  readonly description: string;
  /** カテゴリ */
  readonly category: ShortcutCategory;
  /** 修飾キー */
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /** キー（KeyboardEvent.key） */
  readonly key: string;
}

export type ShortcutCategory = 'file' | 'edit' | 'view' | 'tool' | 'drawing';

/** 全ショートカット定義 */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
  // ファイル操作
  { label: 'Ctrl+S', description: '保存', category: 'file', ctrl: true, key: 's' },
  { label: 'Ctrl+O', description: '開く', category: 'file', ctrl: true, key: 'o' },
  { label: 'Ctrl+Shift+S', description: '名前を付けて保存', category: 'file', ctrl: true, shift: true, key: 's' },

  // 編集操作
  { label: 'Ctrl+Z', description: '元に戻す', category: 'edit', ctrl: true, key: 'z' },
  { label: 'Ctrl+Y', description: 'やり直し', category: 'edit', ctrl: true, key: 'y' },
  { label: 'Ctrl+A', description: '全頂点選択', category: 'edit', ctrl: true, key: 'a' },
  { label: 'Delete', description: '削除', category: 'edit', key: 'Delete' },

  // ツール切り替え
  { label: 'V', description: '表示モード', category: 'tool', key: 'v' },
  { label: 'A', description: '追加モード', category: 'tool', key: 'a' },
  { label: 'E', description: '編集モード', category: 'tool', key: 'e' },
  { label: 'M', description: '測量モード', category: 'tool', key: 'm' },

  // 描画操作
  { label: 'Escape', description: 'キャンセル / 選択解除', category: 'drawing', key: 'Escape' },
  { label: 'Enter', description: '描画確定', category: 'drawing', key: 'Enter' },
];

/**
 * キーイベントがショートカットに一致するか判定
 */
export function matchesShortcut(
  e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  shortcut: ShortcutDefinition
): boolean {
  return (
    e.key.toLowerCase() === shortcut.key.toLowerCase() &&
    e.ctrlKey === (shortcut.ctrl ?? false) &&
    e.shiftKey === (shortcut.shift ?? false) &&
    e.altKey === (shortcut.alt ?? false)
  );
}

/**
 * カテゴリ別にショートカットを取得
 */
export function getShortcutsByCategory(
  category: ShortcutCategory
): readonly ShortcutDefinition[] {
  return SHORTCUTS.filter((s) => s.category === category);
}

/**
 * 操作説明からショートカットラベルを取得（ツールチップ用）
 */
export function getShortcutLabel(description: string): string | null {
  const shortcut = SHORTCUTS.find((s) => s.description === description);
  return shortcut?.label ?? null;
}
