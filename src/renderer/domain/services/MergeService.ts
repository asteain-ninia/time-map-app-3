/**
 * 結合・割譲/合邦ドメインサービス
 *
 * §2.3.3.2: 面情報結合ツール
 * §2.1: 合体（結合）機能、割譲と合邦機能（所属変更）
 *
 * 面情報の結合（ブーリアン和）と親子関係の変更を提供する。
 */

import type { RingCoords } from './GeometryService';
import { polygonUnionAll } from './BooleanOperationService';

// ── 結合（合体） ──

/** 結合結果 */
export interface MergeResult {
  /** 結合が成功したか */
  readonly success: boolean;
  /** 結合後の先頭ポリゴンのリング群（後方互換用） */
  readonly mergedRings: readonly RingCoords[];
  /** 結合後の全ポリゴン（各ポリゴンは外周 + 穴） */
  readonly mergedPolygons: readonly (readonly RingCoords[])[];
  /** エラーメッセージ（失敗時） */
  readonly error?: string;
}

/** 結合バリデーション結果 */
export interface MergeValidation {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * 結合バリデーション
 *
 * §2.1 制約:
 * - 同じレイヤーに属する面情報のみ結合可能
 * - 結合対象が操作対象の時間において下位領域を持たないこと
 *
 * @param features 結合対象の地物情報
 */
export function validateMerge(
  features: readonly {
    id: string;
    layerId: string;
    hasChildren: boolean;
  }[]
): MergeValidation {
  if (features.length < 2) {
    return { valid: false, error: '結合には2つ以上の面情報が必要です' };
  }

  // 同一レイヤーチェック
  const layerIds = new Set(features.map(f => f.layerId));
  if (layerIds.size > 1) {
    return { valid: false, error: '同じレイヤーに属する面情報のみ結合できます' };
  }

  // 下位領域チェック
  const withChildren = features.find(f => f.hasChildren);
  if (withChildren) {
    return {
      valid: false,
      error: `地物「${withChildren.id}」は下位領域を持つため結合できません`,
    };
  }

  return { valid: true };
}

/**
 * 複数ポリゴンを結合（ブーリアン和）する
 *
 * §2.1: 結合済み面情報の形状は、元の形状の論理和として計算される
 *
 * @param polygons 結合対象ポリゴン群（各ポリゴンはリング群）
 * @returns 結合結果
 */
export function mergePolygons(
  polygons: readonly (readonly RingCoords[])[]
): MergeResult {
  if (polygons.length === 0) {
    return { success: false, mergedRings: [], mergedPolygons: [], error: '結合対象がありません' };
  }

  if (polygons.length === 1) {
    return { success: true, mergedRings: polygons[0], mergedPolygons: [polygons[0]] };
  }

  const result = polygonUnionAll(polygons);
  if (result.isEmpty) {
    return { success: false, mergedRings: [], mergedPolygons: [], error: '結合結果が空です' };
  }

  return {
    success: true,
    mergedRings: result.polygons[0] ?? [],
    mergedPolygons: result.polygons,
  };
}

// ── 割譲/合邦（所属変更） ──

/** 所属変更の種別 */
export type TransferType = 'cede' | 'annex' | 'reassign';

/** 所属変更指示 */
export interface TerritoryTransfer {
  /** 移動する地物ID群 */
  readonly featureIds: readonly string[];
  /** 新しい親地物ID（nullで最上位へ） */
  readonly newParentId: string | null;
  /** 変更種別 */
  readonly type: TransferType;
}

/** 所属変更バリデーション結果 */
export interface TransferValidation {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * 所属変更のバリデーション
 *
 * §2.1 制約:
 * - 自分自身を親にできない
 * - レイヤー間の移動は自由
 *
 * @param transfer 所属変更指示
 * @param getAncestors 祖先地物IDを取得する関数（循環検出用）
 */
export function validateTransfer(
  transfer: TerritoryTransfer,
  getAncestors: (featureId: string) => readonly string[]
): TransferValidation {
  if (transfer.featureIds.length === 0) {
    return { valid: false, error: '移動対象の地物が指定されていません' };
  }

  if (transfer.newParentId === null) {
    return { valid: true }; // 最上位への移動は常に有効
  }

  // 自分自身を親にするチェック
  if (transfer.featureIds.includes(transfer.newParentId)) {
    return { valid: false, error: '自分自身を親にすることはできません' };
  }

  // 循環参照チェック: 新親が移動対象の子孫であってはならない
  for (const featureId of transfer.featureIds) {
    const ancestors = getAncestors(transfer.newParentId);
    if (ancestors.includes(featureId)) {
      return {
        valid: false,
        error: `循環参照: 地物「${transfer.newParentId}」は「${featureId}」の子孫です`,
      };
    }
  }

  return { valid: true };
}

/**
 * 合邦の構築
 *
 * §2.1: ある面情報の全ての下位領域が別の上位領域に一括所属変更
 *
 * @param sourceParentId 元の親地物ID
 * @param targetParentId 新しい親地物ID
 * @param childIds 移動する子地物ID群
 */
export function buildAnnexation(
  sourceParentId: string,
  targetParentId: string,
  childIds: readonly string[]
): TerritoryTransfer {
  return {
    featureIds: childIds,
    newParentId: targetParentId,
    type: 'annex',
  };
}

/**
 * 割譲の構築
 *
 * §2.1: 下位領域を新しい上位領域に所属変更
 *
 * @param featureIds 移動する地物ID群
 * @param newParentId 新しい親地物ID（nullで最上位）
 */
export function buildCession(
  featureIds: readonly string[],
  newParentId: string | null
): TerritoryTransfer {
  return {
    featureIds,
    newParentId,
    type: 'cede',
  };
}
