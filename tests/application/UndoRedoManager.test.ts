import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UndoRedoManager, type UndoableCommand } from '@application/UndoRedoManager';

/** テスト用の簡易コマンド */
function createTestCommand(
  description: string,
  executeFn?: () => void,
  undoFn?: () => void
): UndoableCommand {
  return {
    description,
    execute: executeFn ?? vi.fn(),
    undo: undoFn ?? vi.fn(),
  };
}

describe('UndoRedoManager', () => {
  let manager: UndoRedoManager;

  beforeEach(() => {
    manager = new UndoRedoManager();
  });

  describe('execute', () => {
    it('コマンドを実行する', () => {
      const execute = vi.fn();
      const cmd = createTestCommand('テスト', execute);

      manager.execute(cmd);

      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('実行後にUndoが可能になる', () => {
      expect(manager.canUndo()).toBe(false);

      manager.execute(createTestCommand('テスト'));

      expect(manager.canUndo()).toBe(true);
    });

    it('新しいコマンド実行でRedoスタックがクリアされる', () => {
      manager.execute(createTestCommand('cmd1'));
      manager.execute(createTestCommand('cmd2'));
      manager.undo();
      expect(manager.canRedo()).toBe(true);

      manager.execute(createTestCommand('cmd3'));

      expect(manager.canRedo()).toBe(false);
    });

    it('最大100操作を超えると古い操作が削除される', () => {
      for (let i = 0; i < 110; i++) {
        manager.execute(createTestCommand(`cmd-${i}`));
      }

      expect(manager.undoCount).toBe(100);
    });
  });

  describe('undo', () => {
    it('直前の操作を元に戻す', () => {
      const undo = vi.fn();
      const cmd = createTestCommand('テスト', undefined, undo);
      manager.execute(cmd);

      manager.undo();

      expect(undo).toHaveBeenCalledTimes(1);
    });

    it('Undo後にRedoが可能になる', () => {
      manager.execute(createTestCommand('テスト'));
      expect(manager.canRedo()).toBe(false);

      manager.undo();

      expect(manager.canRedo()).toBe(true);
    });

    it('Undoスタックが空の場合は何もしない', () => {
      expect(() => manager.undo()).not.toThrow();
    });

    it('複数回Undoできる', () => {
      const undos = [vi.fn(), vi.fn(), vi.fn()];
      undos.forEach((undo, i) => {
        manager.execute(createTestCommand(`cmd-${i}`, undefined, undo));
      });

      manager.undo();
      manager.undo();
      manager.undo();

      expect(undos[2]).toHaveBeenCalledTimes(1);
      expect(undos[1]).toHaveBeenCalledTimes(1);
      expect(undos[0]).toHaveBeenCalledTimes(1);
      expect(manager.canUndo()).toBe(false);
    });
  });

  describe('redo', () => {
    it('元に戻した操作をやり直す', () => {
      const execute = vi.fn();
      manager.execute(createTestCommand('テスト', execute));
      manager.undo();
      execute.mockClear();

      manager.redo();

      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('Redo後にまたUndoできる', () => {
      manager.execute(createTestCommand('テスト'));
      manager.undo();

      manager.redo();

      expect(manager.canUndo()).toBe(true);
    });

    it('Redoスタックが空の場合は何もしない', () => {
      expect(() => manager.redo()).not.toThrow();
    });

    it('複数回Undo→複数回Redoできる', () => {
      const executes = [vi.fn(), vi.fn()];
      executes.forEach((exec, i) => {
        manager.execute(createTestCommand(`cmd-${i}`, exec));
      });

      manager.undo();
      manager.undo();

      executes[0].mockClear();
      executes[1].mockClear();

      manager.redo();
      manager.redo();

      expect(executes[0]).toHaveBeenCalledTimes(1);
      expect(executes[1]).toHaveBeenCalledTimes(1);
    });
  });

  describe('getState', () => {
    it('初期状態', () => {
      const state = manager.getState();
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
      expect(state.undoDescription).toBeNull();
      expect(state.redoDescription).toBeNull();
    });

    it('操作後の状態', () => {
      manager.execute(createTestCommand('点を追加'));

      const state = manager.getState();
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
      expect(state.undoDescription).toBe('点を追加');
    });

    it('Undo後の状態', () => {
      manager.execute(createTestCommand('点を追加'));
      manager.undo();

      const state = manager.getState();
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);
      expect(state.redoDescription).toBe('点を追加');
    });
  });

  describe('subscribe', () => {
    it('状態変更時にリスナーが呼ばれる', () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      manager.execute(createTestCommand('テスト'));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].canUndo).toBe(true);
    });

    it('解除後はリスナーが呼ばれない', () => {
      const listener = vi.fn();
      const unsub = manager.subscribe(listener);
      unsub();

      manager.execute(createTestCommand('テスト'));

      expect(listener).not.toHaveBeenCalled();
    });

    it('Undo/Redo時にもリスナーが呼ばれる', () => {
      const listener = vi.fn();
      manager.execute(createTestCommand('テスト'));

      manager.subscribe(listener);
      manager.undo();
      manager.redo();

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('clear', () => {
    it('全履歴をクリアする', () => {
      manager.execute(createTestCommand('cmd1'));
      manager.execute(createTestCommand('cmd2'));
      manager.undo();

      manager.clear();

      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);
      expect(manager.undoCount).toBe(0);
      expect(manager.redoCount).toBe(0);
    });

    it('クリア時にリスナーが呼ばれる', () => {
      const listener = vi.fn();
      manager.execute(createTestCommand('テスト'));
      manager.subscribe(listener);

      manager.clear();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].canUndo).toBe(false);
    });
  });

  describe('実際のデータ操作シナリオ', () => {
    it('値の変更→Undo→Redoで正しく状態が遷移する', () => {
      let value = 0;

      const addCmd = (delta: number): UndoableCommand => ({
        description: `${delta}を加算`,
        execute: () => { value += delta; },
        undo: () => { value -= delta; },
      });

      manager.execute(addCmd(10));
      expect(value).toBe(10);

      manager.execute(addCmd(20));
      expect(value).toBe(30);

      manager.undo();
      expect(value).toBe(10);

      manager.undo();
      expect(value).toBe(0);

      manager.redo();
      expect(value).toBe(10);

      manager.redo();
      expect(value).toBe(30);
    });

    it('Undo後に新操作を追加するとRedoは不可になる', () => {
      let value = 0;

      const addCmd = (delta: number): UndoableCommand => ({
        description: `${delta}を加算`,
        execute: () => { value += delta; },
        undo: () => { value -= delta; },
      });

      manager.execute(addCmd(10));
      manager.execute(addCmd(20));
      manager.undo(); // value = 10
      expect(value).toBe(10);

      manager.execute(addCmd(5)); // value = 15, redoスタッククリア
      expect(value).toBe(15);
      expect(manager.canRedo()).toBe(false);

      manager.undo(); // value = 10
      expect(value).toBe(10);

      manager.undo(); // value = 0
      expect(value).toBe(0);
    });
  });
});
