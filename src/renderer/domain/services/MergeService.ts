/**
 * 結合・割譲/合邦ドメインサービス
 *
 * §2.3.3.2: 面情報結合ツール
 * §2.1: 合体（結合）機能、割譲と合邦機能（所属変更）
 *
 * 面情報の結合（ブーリアン和）と親子関係の変更を提供する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from './GeometryService';
import { polygonUnionAll } from './BooleanOperationService';
import { getAncestors } from './HierarchyService';

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
 * 結合バリデーション（確定前の事前条件検証）
 *
 * 要件定義書 §2.1「合体（結合）機能」の制約 / 開発ガイド §6.6.3:
 * - 結合対象は2つ以上であること。
 * - 選択集合内の地物が互いに上位・下位関係にないこと（集約地物とその下位領域を
 *   同時選択できない。重複 child 参照・不正なツリー更新を防ぐ。§2.1 line 351-354）。
 *   循環検出は所属変更の `validateTransfer` と同じ祖先連鎖（`getAncestors`）で判定する。
 * - 現行の結合は末端地物のみ対応する（集約地物の平坦化・混在結合は Phase 4-7）。
 * - 結合対象はすべて同一の上位領域に属すること（最上位同士 = 全員親なしも可）。
 *   異なる上位領域に属する対象の結合は「結果地物の所属」をユーザーが決定する
 *   上位領域決定ダイアログ（現状.md §6.10 Phase 4-6）が前提であり、UI 導入までは
 *   拒否する（暗黙に primary の親へ吸収すると上位領域の領土が黙って書き換わる）。
 *
 * 旧「同じレイヤーに属する面情報のみ結合できる」前提は新階層モデルで撤廃した
 * （グローバルレイヤー序列は廃止。現状.md §6 / 開発ガイド §6.6.3 補足）。
 *
 * @param features 結合対象の地物情報（id・下位領域保持フラグ・上位領域ID）
 * @param getAncestors 指定地物IDの祖先地物ID群を返す関数（上位・下位関係の判定用）
 */
export function validateMerge(
  features: readonly {
    id: string;
    hasChildren: boolean;
    parentId: string | null;
  }[],
  getAncestors: (featureId: string) => readonly string[]
): MergeValidation {
  if (features.length < 2) {
    return { valid: false, error: '結合には2つ以上の面情報が必要です' };
  }

  // 同一地物の重複指定チェック（開発ガイド §6.6.3 line 584「対象が同一地物ではないこと」）。
  // UI（トグル選択）と Command（dedupe）は重複を作らないが、共有バリデータ単体でも堅くする。
  const uniqueIds = new Set(features.map(f => f.id));
  if (uniqueIds.size !== features.length) {
    return { valid: false, error: '同一の地物を重複して結合対象に指定することはできません' };
  }

  // 上位・下位関係チェック（要件定義書 §2.1 line 351-354 / 開発ガイド §6.6.3 line 585）。
  // 選択集合内に互いに上位・下位関係にある地物（集約地物とその下位領域）があってはならない。
  const selectedIds = new Set(features.map(f => f.id));
  for (const feature of features) {
    for (const ancestorId of getAncestors(feature.id)) {
      if (selectedIds.has(ancestorId)) {
        // 要件定義書 §2.1 line 354: 「上位地物とその下位領域は同時に結合対象にできない」旨を
        // 通知する（ID は要求されておらず、pure な本関数は feature 名も持たないため固定文言）。
        return {
          valid: false,
          error: '上位地物とその下位領域は同時に結合対象にできません',
        };
      }
    }
  }

  // 下位領域チェック（現行の結合は末端地物のみ対応。集約地物の結合は Phase 4-7）。
  const withChildren = features.find(f => f.hasChildren);
  if (withChildren) {
    return {
      valid: false,
      error: `地物「${withChildren.id}」は下位領域を持つため結合できません`,
    };
  }

  // 同一上位領域チェック。結果地物の所属が一意に定まらない結合（異なる上位領域・
  // 最上位と下位の混在）は、上位領域決定ダイアログ（現状.md §6.10 Phase 4-6）導入まで拒否する。
  const parentIds = new Set(features.map(f => f.parentId));
  if (parentIds.size > 1) {
    return {
      valid: false,
      error: '異なる上位領域に属する面情報は結合できません（結合対象はすべて同じ上位領域に属している必要があります）',
    };
  }

  return { valid: true };
}

/**
 * Feature ベースの結合バリデーション（選択時・確定前で共有）
 *
 * 選択時のリアルタイム判定（UI の `addMergeTarget`）と確定前検証
 * （`MergeFeatureCommand`）の双方から呼び出し、判定経路を単一化してドリフトを防ぐ
 * （開発ガイド §6.6.1 / §6.6.3 line 584「操作開始前と確定前の両方で検証」）。
 * pure な `validateMerge` に対し、Feature から判定入力（下位領域フラグ・上位領域ID・
 * 祖先連鎖）を解決して与える薄いラッパ。祖先連鎖は所属変更と同じ `HierarchyService.getAncestors`。
 *
 * @param targetIds 結合対象の地物ID群
 * @param allFeatures 全地物（祖先連鎖の解決に使用）
 * @param time 判定時刻
 */
export function validateMergeFeatures(
  targetIds: readonly string[],
  allFeatures: readonly Feature[],
  time: TimePoint
): MergeValidation {
  const featureMap = new Map(allFeatures.map((feature) => [feature.id, feature]));

  // 共通の事前条件（開発ガイド §6.6.3 line 584）: 対象が存在し・面情報であり・指定時刻に
  // 有効であることを、操作開始前と確定前の両方で検証する。missing / inactive / 非 Polygon を
  // 明示的に invalid 化する（時刻変更で古い選択が無効化したケースを通さない）。
  const targets: { id: string; hasChildren: boolean; parentId: string | null }[] = [];
  for (const id of targetIds) {
    const feature = featureMap.get(id);
    if (!feature) {
      return { valid: false, error: `結合対象の地物が見つかりません: ${id}` };
    }
    if (feature.featureType !== 'Polygon') {
      return { valid: false, error: '結合できるのは面情報のみです' };
    }
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) {
      return { valid: false, error: `地物「${id}」は指定時刻に存在しません` };
    }
    // §6.6.8 line 611: childIds のみでリーフ判定する経路（下記 hasChildren）への防御的
    // shape 存在確認。「shape なし・childIds 空」の不正不変条件 Polygon（有効世界では
    // ロード時 validateShapePresence で拒否され存在しないが、シリアライズ層を通らない
    // 経路への保険）を弾き、Command 側の shape 型チェックと対称化する（§6.6.1）。
    // コンテナ（shape なし・childIds 非空）は下の hasChildren チェックで弾く。
    if (!anchor.shape && anchor.placement.childIds.length === 0) {
      return { valid: false, error: `地物「${id}」は結合可能な形状を持ちません` };
    }
    targets.push({
      id,
      hasChildren: anchor.placement.childIds.length > 0,
      parentId: anchor.placement.parentId,
    });
  }

  return validateMerge(targets, (id) => {
    const feature = featureMap.get(id);
    return feature ? getAncestors(feature, allFeatures, time).map((ancestor) => ancestor.id) : [];
  });
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
