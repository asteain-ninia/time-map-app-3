/**
 * Undo/Redo 履歴管理
 *
 * §2.3.1: 二重スタック、最大100操作
 *
 * コマンドパターンで操作を記録し、元に戻す/やり直しを実現する。
 * 新しい操作が追加されるとRedoスタックはクリアされる。
 */

/** 元に戻せる操作のインターフェース */
export interface UndoableCommand {
  /** 操作の説明（デバッグ用） */
  readonly description: string;

  /** 操作を実行する */
  execute(): void;

  /** 操作を元に戻す */
  undo(): void;
}

/** Undo/Redo状態の変更通知 */
export interface UndoRedoState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDescription: string | null;
  readonly redoDescription: string | null;
}

/** §2.3.1: 最大100操作 */
const MAX_HISTORY = 100;

export class UndoRedoManager {
  private undoStack: UndoableCommand[] = [];
  private redoStack: UndoableCommand[] = [];
  private listeners: Set<(state: UndoRedoState) => void> = new Set();

  /**
   * コマンドを実行して履歴に記録する
   * 新しい操作追加時にRedoスタックはクリアされる
   */
  execute(command: UndoableCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    // §2.3.1: 最大100操作
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }

    this.notifyListeners();
  }

  /** 直前の操作を元に戻す */
  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;

    command.undo();
    this.redoStack.push(command);
    this.notifyListeners();
  }

  /** 元に戻した操作をやり直す */
  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;

    command.execute();
    this.undoStack.push(command);
    this.notifyListeners();
  }

  /** Undoが可能か */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Redoが可能か */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 現在の状態を取得 */
  getState(): UndoRedoState {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDescription: this.undoStack.length > 0
        ? this.undoStack[this.undoStack.length - 1].description
        : null,
      redoDescription: this.redoStack.length > 0
        ? this.redoStack[this.redoStack.length - 1].description
        : null,
    };
  }

  /** Undoスタックのサイズ */
  get undoCount(): number {
    return this.undoStack.length;
  }

  /** Redoスタックのサイズ */
  get redoCount(): number {
    return this.redoStack.length;
  }

  /** 状態変更リスナーを登録する */
  subscribe(listener: (state: UndoRedoState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 全履歴をクリアする */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
