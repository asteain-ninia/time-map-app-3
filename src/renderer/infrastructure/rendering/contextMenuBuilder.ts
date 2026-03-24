/**
 * コンテキストメニュー項目構築ユーティリティ
 *
 * §2.3.3.3: 右クリックメニュー。地物種別・選択状態に応じてメニュー項目を動的構築。
 *
 * ピュア関数で構築し、テスタビリティを確保する。
 */

import type { ContextMenuEntry } from '@presentation/components/ContextMenu.svelte';

/** コンテキストメニュー構築のためのコンテキスト情報 */
export interface ContextMenuContext {
  /** 選択中の地物ID */
  readonly selectedFeatureId: string | null;
  /** 選択中の地物の形状タイプ */
  readonly featureType: string | null;
  /** 選択中の頂点数 */
  readonly selectedVertexCount: number;
  /** 選択頂点が共有頂点か */
  readonly hasSharedVertex: boolean;
}

/** コンテキストメニューのアクション一覧 */
export interface ContextMenuActions {
  readonly onDelete: () => void;
  readonly onDeleteVertex: () => void;
  readonly onUnmergeVertex: () => void;
  readonly onAddHole: () => void;
  readonly onAddExclave: () => void;
  readonly onStartKnife: () => void;
  readonly onAddMergeTarget: () => void;
}

/**
 * コンテキスト情報からメニュー項目を構築する
 */
export function buildContextMenuItems(
  ctx: ContextMenuContext,
  actions: ContextMenuActions
): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  // 頂点選択がある場合
  if (ctx.selectedVertexCount > 0) {
    items.push({
      label: `頂点削除 (${ctx.selectedVertexCount}個)`,
      action: actions.onDeleteVertex,
    });

    if (ctx.hasSharedVertex) {
      items.push({
        label: '共有解除',
        action: actions.onUnmergeVertex,
      });
    }

    items.push({ separator: true });
  }

  // 地物が選択されている場合
  if (ctx.selectedFeatureId) {
    items.push({
      label: '削除',
      action: actions.onDelete,
    });

    // 面情報固有機能
    if (ctx.featureType === 'Polygon') {
      items.push({ separator: true });
      items.push({
        label: '穴追加',
        action: actions.onAddHole,
      });
      items.push({
        label: '飛び地追加',
        action: actions.onAddExclave,
      });
      items.push({
        label: '分割',
        action: actions.onStartKnife,
      });
      items.push({
        label: '結合対象に追加',
        action: actions.onAddMergeTarget,
      });
    }
  }

  return items;
}
