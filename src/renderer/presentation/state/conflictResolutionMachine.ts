/**
 * 競合解決ダイアログ状態マシン定義
 *
 * 要件定義書 §5.5: 競合解決ダイアログの表示→選択→確定→適用の状態遷移
 * 要件定義書 §2.2.3: 編集時の時間的・空間的整合性維持プロセス
 *
 * 状態フロー:
 *   idle → reviewing → (allResolved | idle)
 *   reviewing: ユーザーが各競合の優先地物を選択
 *   allResolved → committing → done / idle
 *
 * Prepare → Resolve → Commit の3段階パイプラインのUI側状態管理を担う。
 */

import { setup, assign } from 'xstate';
import type { SpatialConflict } from '@domain/services/ConflictDetectionService';
import type { ConflictResolution } from '@application/AnchorEditDraft';

// --- 型定義 ---

export interface ConflictResolutionContext {
  /** ドラフトID */
  draftId: string;
  /** 検出された競合リスト */
  conflicts: readonly SpatialConflict[];
  /** 現在レビュー中の競合インデックス */
  currentIndex: number;
  /** ユーザーの解決方針リスト */
  resolutions: readonly ConflictResolution[];
  /** エラーメッセージ（あれば） */
  errorMessage: string;
}

// --- イベント型定義 ---

export type ConflictResolutionEvent =
  | { type: 'OPEN'; draftId: string; conflicts: readonly SpatialConflict[] }
  | { type: 'SELECT_PREFERRED'; featureId: string }
  | { type: 'NEXT_CONFLICT' }
  | { type: 'PREV_CONFLICT' }
  | { type: 'JUMP_TO_CONFLICT'; index: number }
  | { type: 'COMMIT' }
  | { type: 'CANCEL' }
  | { type: 'COMMIT_SUCCESS' }
  | { type: 'COMMIT_FAILURE'; error: string }
  | { type: 'RESET' };

// --- マシン定義 ---

export const conflictResolutionMachine = setup({
  types: {
    context: {} as ConflictResolutionContext,
    events: {} as ConflictResolutionEvent,
  },
  guards: {
    /** 全競合に方針が設定されたか */
    allResolved: ({ context }) =>
      context.conflicts.length > 0
      && context.resolutions.length >= context.conflicts.length,
    /** 次の競合がある */
    hasNextConflict: ({ context }) =>
      context.currentIndex < context.conflicts.length - 1,
    /** 前の競合がある */
    hasPrevConflict: ({ context }) =>
      context.currentIndex > 0,
    /** ジャンプ先が有効か */
    isValidIndex: ({ context, event }) => {
      if (event.type !== 'JUMP_TO_CONFLICT') return false;
      return event.index >= 0 && event.index < context.conflicts.length;
    },
    /** 現在の競合が未解決か */
    currentUnresolved: ({ context }) =>
      !context.resolutions.some(r => r.conflictIndex === context.currentIndex),
  },
  actions: {
    /** ダイアログを開く: 競合リストを読み込み */
    openDialog: assign({
      draftId: ({ event }) =>
        event.type === 'OPEN' ? event.draftId : '',
      conflicts: ({ event }) =>
        event.type === 'OPEN' ? event.conflicts : [],
      currentIndex: 0,
      resolutions: [] as ConflictResolution[],
      errorMessage: '',
    }),
    /** 優先地物を選択 */
    selectPreferred: assign({
      resolutions: ({ context, event }) => {
        if (event.type !== 'SELECT_PREFERRED') return context.resolutions;
        const featureId = event.featureId;
        const idx = context.currentIndex;
        // 既存の方針を更新または新規追加
        const filtered = context.resolutions.filter(r => r.conflictIndex !== idx);
        return [...filtered, { conflictIndex: idx, preferFeatureId: featureId }];
      },
    }),
    /** 次の競合へ移動 */
    nextConflict: assign({
      currentIndex: ({ context }) =>
        Math.min(context.currentIndex + 1, context.conflicts.length - 1),
    }),
    /** 前の競合へ移動 */
    prevConflict: assign({
      currentIndex: ({ context }) =>
        Math.max(context.currentIndex - 1, 0),
    }),
    /** 指定インデックスの競合へジャンプ */
    jumpToConflict: assign({
      currentIndex: ({ event }) =>
        event.type === 'JUMP_TO_CONFLICT' ? event.index : 0,
    }),
    /** エラーを設定 */
    setError: assign({
      errorMessage: ({ event }) =>
        event.type === 'COMMIT_FAILURE' ? event.error : '',
    }),
    /** エラーをクリア */
    clearError: assign({
      errorMessage: '',
    }),
    /** ダイアログをリセット */
    resetDialog: assign({
      draftId: '',
      conflicts: [] as SpatialConflict[],
      currentIndex: 0,
      resolutions: [] as ConflictResolution[],
      errorMessage: '',
    }),
  },
}).createMachine({
  id: 'conflictResolution',
  initial: 'idle',
  context: {
    draftId: '',
    conflicts: [],
    currentIndex: 0,
    resolutions: [],
    errorMessage: '',
  },
  states: {
    // --- 待機状態（ダイアログ非表示） ---
    idle: {
      on: {
        OPEN: {
          target: 'reviewing',
          actions: 'openDialog',
        },
      },
    },

    // --- 競合レビュー中 ---
    reviewing: {
      on: {
        SELECT_PREFERRED: {
          actions: 'selectPreferred',
        },
        NEXT_CONFLICT: {
          guard: 'hasNextConflict',
          actions: 'nextConflict',
        },
        PREV_CONFLICT: {
          guard: 'hasPrevConflict',
          actions: 'prevConflict',
        },
        JUMP_TO_CONFLICT: {
          guard: 'isValidIndex',
          actions: 'jumpToConflict',
        },
        COMMIT: {
          target: 'committing',
          guard: 'allResolved',
        },
        CANCEL: {
          target: 'idle',
          actions: 'resetDialog',
        },
      },
    },

    // --- コミット処理中 ---
    committing: {
      on: {
        COMMIT_SUCCESS: {
          target: 'done',
        },
        COMMIT_FAILURE: {
          target: 'reviewing',
          actions: 'setError',
        },
      },
    },

    // --- 完了（ダイアログ閉じる準備） ---
    done: {
      on: {
        RESET: {
          target: 'idle',
          actions: 'resetDialog',
        },
      },
    },
  },
});
