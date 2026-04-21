/**
 * ツール状態マシン定義
 *
 * 要件定義書 §5.5: ツール共通の選択・待機・操作中などの状態遷移
 * 技術方針 §1.4: XState v5 による明示的な状態管理
 *
 * 状態フロー:
 *   view:  idle ⇄ panning
 *   add:   idle → drawing → (confirm/cancel) → idle
 *   edit:  idle (選択機能は後続フェーズで拡充)
 *   measure: idle (測量機能は後続フェーズで拡充)
 */

import { setup, assign } from 'xstate';
import type { Coordinate } from '@domain/value-objects/Coordinate';

// --- 型定義 ---

export type ToolMode = 'view' | 'add' | 'edit' | 'measure';
export type AddToolType = 'point' | 'line' | 'polygon';

export interface ToolContext {
  /** 追加モードでのツール種別 */
  addToolType: AddToolType;
  /** 描画中の頂点座標リスト */
  drawingCoords: Coordinate[];
}

// --- イベント型定義 ---

export type ToolEvent =
  | { type: 'MODE_CHANGE'; mode: ToolMode }
  | { type: 'SET_ADD_TOOL'; toolType: AddToolType }
  | { type: 'MAP_CLICK'; coord: Coordinate }
  | { type: 'MAP_DOUBLE_CLICK'; coord: Coordinate }
  | { type: 'PAN_START' }
  | { type: 'PAN_END' }
  | { type: 'KEY_ESCAPE' }
  | { type: 'CONFIRM' }
  | { type: 'UNDO_VERTEX' }
  | { type: 'RESET_INTERACTION' };

// --- マシン定義 ---

export const toolMachine = setup({
  types: {
    context: {} as ToolContext,
    events: {} as ToolEvent,
  },
  guards: {
    isViewMode: (_, params: { mode: ToolMode }) => params.mode === 'view',
    isAddMode: (_, params: { mode: ToolMode }) => params.mode === 'add',
    isEditMode: (_, params: { mode: ToolMode }) => params.mode === 'edit',
    isMeasureMode: (_, params: { mode: ToolMode }) => params.mode === 'measure',
    isPointTool: ({ context }) => context.addToolType === 'point',
    canConfirmLine: ({ context }) => context.drawingCoords.length >= 2,
    canConfirmPolygon: ({ context }) => context.drawingCoords.length >= 3,
    canConfirmShape: ({ context }) => {
      if (context.addToolType === 'line') return context.drawingCoords.length >= 2;
      if (context.addToolType === 'polygon') return context.drawingCoords.length >= 3;
      return false;
    },
    hasDrawingCoords: ({ context }) => context.drawingCoords.length > 0,
  },
  actions: {
    clearDrawing: assign({ drawingCoords: [] }),
    addVertex: assign({
      drawingCoords: ({ context, event }) => {
        if (event.type === 'MAP_CLICK' || event.type === 'MAP_DOUBLE_CLICK') {
          return [...context.drawingCoords, event.coord];
        }
        return context.drawingCoords;
      },
    }),
    removeLastVertex: assign({
      drawingCoords: ({ context }) => context.drawingCoords.slice(0, -1),
    }),
    setAddToolType: assign({
      addToolType: ({ event }) => {
        if (event.type === 'SET_ADD_TOOL') return event.toolType;
        return 'polygon' as AddToolType;
      },
      drawingCoords: [],
    }),
  },
}).createMachine({
  id: 'tool',
  initial: 'view',
  context: {
    addToolType: 'polygon',
    drawingCoords: [],
  },
  states: {
    // --- 表示モード ---
    view: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            PAN_START: 'panning',
            RESET_INTERACTION: {
              actions: 'clearDrawing',
            },
          },
        },
        panning: {
          on: {
            PAN_END: 'idle',
            RESET_INTERACTION: {
              target: 'idle',
              actions: 'clearDrawing',
            },
          },
        },
      },
      on: {
        MODE_CHANGE: [
          { target: 'add', guard: { type: 'isAddMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'edit', guard: { type: 'isEditMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'measure', guard: { type: 'isMeasureMode', params: ({ event }) => ({ mode: event.mode }) } },
        ],
      },
    },

    // --- 追加モード ---
    add: {
      initial: 'idle',
      entry: 'clearDrawing',
      states: {
        idle: {
          on: {
            MAP_CLICK: [
              // 点ツール: クリックで即座に追加（描画状態を経由しない）
              {
                guard: 'isPointTool',
                actions: 'addVertex',
              },
              // 線/面ツール: 描画開始
              {
                target: 'drawing',
                actions: 'addVertex',
              },
            ],
            PAN_START: 'panning',
            RESET_INTERACTION: {
              actions: 'clearDrawing',
            },
          },
        },
        drawing: {
          on: {
            MAP_CLICK: {
              actions: 'addVertex',
            },
            MAP_DOUBLE_CLICK: {
              target: 'idle',
              guard: 'canConfirmShape',
              actions: 'clearDrawing',
            },
            CONFIRM: {
              target: 'idle',
              guard: 'canConfirmShape',
              actions: 'clearDrawing',
            },
            UNDO_VERTEX: [
              // 頂点が残っていれば1つ戻す
              {
                guard: 'hasDrawingCoords',
                actions: 'removeLastVertex',
              },
            ],
            KEY_ESCAPE: {
              target: 'idle',
              actions: 'clearDrawing',
            },
            PAN_START: 'panning',
            RESET_INTERACTION: {
              target: 'idle',
              actions: 'clearDrawing',
            },
          },
        },
        panning: {
          on: {
            PAN_END: [
              {
                target: 'drawing',
                guard: 'hasDrawingCoords',
              },
              { target: 'idle' },
            ],
            RESET_INTERACTION: {
              target: 'idle',
              actions: 'clearDrawing',
            },
          },
        },
      },
      on: {
        MODE_CHANGE: [
          { target: 'view', guard: { type: 'isViewMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'edit', guard: { type: 'isEditMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'measure', guard: { type: 'isMeasureMode', params: ({ event }) => ({ mode: event.mode }) } },
        ],
        SET_ADD_TOOL: {
          actions: 'setAddToolType',
        },
      },
    },

    // --- 編集モード（後続フェーズで拡充） ---
    edit: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            PAN_START: 'panning',
            RESET_INTERACTION: {
              actions: 'clearDrawing',
            },
          },
        },
        panning: {
          on: {
            PAN_END: 'idle',
            RESET_INTERACTION: {
              target: 'idle',
              actions: 'clearDrawing',
            },
          },
        },
      },
      on: {
        MODE_CHANGE: [
          { target: 'view', guard: { type: 'isViewMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'add', guard: { type: 'isAddMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'measure', guard: { type: 'isMeasureMode', params: ({ event }) => ({ mode: event.mode }) } },
        ],
      },
    },

    // --- 測量モード（後続フェーズで拡充） ---
    measure: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            PAN_START: 'panning',
            RESET_INTERACTION: {
              actions: 'clearDrawing',
            },
          },
        },
        panning: {
          on: {
            PAN_END: 'idle',
            RESET_INTERACTION: {
              target: 'idle',
              actions: 'clearDrawing',
            },
          },
        },
      },
      on: {
        MODE_CHANGE: [
          { target: 'view', guard: { type: 'isViewMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'add', guard: { type: 'isAddMode', params: ({ event }) => ({ mode: event.mode }) } },
          { target: 'edit', guard: { type: 'isEditMode', params: ({ event }) => ({ mode: event.mode }) } },
        ],
      },
    },
  },
});
