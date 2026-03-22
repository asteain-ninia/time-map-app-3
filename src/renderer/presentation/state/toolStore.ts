/**
 * ツール状態のSvelte 5リアクティブストア
 *
 * XState v5 アクターを作成し、Svelte 5 の $state で状態を公開する。
 * @xstate/svelte は Svelte 3/4 向けのため手動統合を行う。
 */

import { createActor } from 'xstate';
import { toolMachine } from './toolMachine';
import type { ToolMode, AddToolType, ToolEvent } from './toolMachine';
import type { Coordinate } from '@domain/value-objects/Coordinate';

export interface ToolSnapshot {
  /** 現在のトップレベルモード */
  mode: ToolMode;
  /** 描画中かどうか */
  isDrawing: boolean;
  /** パン中かどうか */
  isPanning: boolean;
  /** 追加ツール種別 */
  addToolType: AddToolType;
  /** 描画中の頂点座標リスト */
  drawingCoords: readonly Coordinate[];
}

/** 確定時のコールバック型 */
export type OnShapeConfirmed = (
  addToolType: AddToolType,
  coords: readonly Coordinate[]
) => void;

/**
 * ツールストアを作成する
 * Svelte 5 の $state を使うコンポーネント内で呼び出すこと
 */
export function createToolStore(onShapeConfirmed?: OnShapeConfirmed) {
  const actor = createActor(toolMachine);

  /** 前回のスナップショット（確定検出用） */
  let prevSnapshot = actor.getSnapshot();

  /** リアクティブなスナップショットを初期化 */
  function deriveSnapshot(): ToolSnapshot {
    const snap = actor.getSnapshot();
    const value = snap.value;
    // トップレベルモードを取得
    let mode: ToolMode = 'view';
    if (typeof value === 'object' && value !== null) {
      const key = Object.keys(value)[0] as ToolMode;
      mode = key;
    }
    return {
      mode,
      isDrawing: snap.matches({ add: 'drawing' }),
      isPanning:
        snap.matches({ view: 'panning' }) ||
        snap.matches({ add: 'panning' }) ||
        snap.matches({ edit: 'panning' }) ||
        snap.matches({ measure: 'panning' }),
      addToolType: snap.context.addToolType,
      drawingCoords: snap.context.drawingCoords,
    };
  }

  /** 確定を検出する */
  function detectConfirmation(): void {
    const snap = actor.getSnapshot();
    // add.drawing → add.idle への遷移で、前回のdrawingCoordsが非空なら確定
    if (
      snap.matches({ add: 'idle' }) &&
      !prevSnapshot.matches({ add: 'idle' }) &&
      prevSnapshot.context.drawingCoords.length > 0 &&
      // ESCキャンセル時は除外（clearDrawingが実行される）
      snap.context.drawingCoords.length > 0
    ) {
      onShapeConfirmed?.(
        prevSnapshot.context.addToolType,
        prevSnapshot.context.drawingCoords
      );
    }
  }

  // アクター開始
  actor.start();

  // サブスクリプション
  actor.subscribe(() => {
    detectConfirmation();
    prevSnapshot = actor.getSnapshot();
  });

  return {
    /** イベントを送信する */
    send(event: ToolEvent): void {
      actor.send(event);
    },

    /** 現在のスナップショットを取得する */
    getSnapshot: deriveSnapshot,

    /** アクターを停止する */
    stop(): void {
      actor.stop();
    },
  };
}
