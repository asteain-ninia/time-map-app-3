import { describe, it, expect } from 'vitest';
import {
  SHORTCUTS,
  matchesShortcut,
  getShortcutsByCategory,
  getShortcutLabel,
} from '@infrastructure/rendering/keyboardShortcutManager';

describe('keyboardShortcutManager', () => {
  describe('SHORTCUTS', () => {
    it('定義が存在する', () => {
      expect(SHORTCUTS.length).toBeGreaterThan(0);
    });

    it('全カテゴリにショートカットがある', () => {
      const categories = new Set(SHORTCUTS.map((s) => s.category));
      expect(categories.has('file')).toBe(true);
      expect(categories.has('edit')).toBe(true);
      expect(categories.has('tool')).toBe(true);
      expect(categories.has('drawing')).toBe(true);
    });
  });

  describe('matchesShortcut', () => {
    it('Ctrl+Sが一致する', () => {
      const e = { key: 's', ctrlKey: true, shiftKey: false, altKey: false };
      const shortcut = SHORTCUTS.find((s) => s.label === 'Ctrl+S')!;
      expect(matchesShortcut(e, shortcut)).toBe(true);
    });

    it('修飾キーが違うと不一致', () => {
      const e = { key: 's', ctrlKey: false, shiftKey: false, altKey: false };
      const shortcut = SHORTCUTS.find((s) => s.label === 'Ctrl+S')!;
      expect(matchesShortcut(e, shortcut)).toBe(false);
    });

    it('Ctrl+Shift+Sが一致する', () => {
      const e = { key: 's', ctrlKey: true, shiftKey: true, altKey: false };
      const shortcut = SHORTCUTS.find((s) => s.label === 'Ctrl+Shift+S')!;
      expect(matchesShortcut(e, shortcut)).toBe(true);
    });

    it('単独キーが一致する', () => {
      const e = { key: 'v', ctrlKey: false, shiftKey: false, altKey: false };
      const shortcut = SHORTCUTS.find((s) => s.description === '表示モード')!;
      expect(matchesShortcut(e, shortcut)).toBe(true);
    });

    it('大文字小文字を区別しない', () => {
      const e = { key: 'V', ctrlKey: false, shiftKey: false, altKey: false };
      const shortcut = SHORTCUTS.find((s) => s.description === '表示モード')!;
      expect(matchesShortcut(e, shortcut)).toBe(true);
    });
  });

  describe('getShortcutsByCategory', () => {
    it('fileカテゴリのショートカットを取得', () => {
      const fileShortcuts = getShortcutsByCategory('file');
      expect(fileShortcuts.length).toBeGreaterThan(0);
      expect(fileShortcuts.every((s) => s.category === 'file')).toBe(true);
    });

    it('toolカテゴリのショートカットを取得', () => {
      const toolShortcuts = getShortcutsByCategory('tool');
      expect(toolShortcuts.length).toBe(4);
    });
  });

  describe('getShortcutLabel', () => {
    it('存在する操作のラベルを取得', () => {
      expect(getShortcutLabel('保存')).toBe('Ctrl+S');
    });

    it('存在する操作のラベルを取得（ツール）', () => {
      expect(getShortcutLabel('表示モード')).toBe('V');
    });

    it('存在しない操作はnull', () => {
      expect(getShortcutLabel('存在しない操作')).toBeNull();
    });
  });
});
