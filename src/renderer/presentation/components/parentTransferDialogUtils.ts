import type { Feature } from '@domain/entities/Feature';
import { featureCoversRange } from '@domain/services/TimeService';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export type ParentTransferScope = 'selected' | 'children';

/**
 * 所属変更ダイアログ「新しい親」の 3 択（要件定義書 §2.1 line 286-289）。
 * - `'existing'`: 既存の面情報から選ぶ（割譲・帰属・直轄化）。
 * - `'root'`: 親なし（最上位領域へ）（独立）。
 * - `'new'`: 新規上位領域を作成する（連邦化・自治化）。
 */
export type ParentTransferMode = 'existing' | 'root' | 'new';

export interface ParentCandidateItem {
  readonly id: string;
  readonly name: string;
}

/**
 * 新規上位領域作成サブフロー（連邦化・自治化）の入力（要件定義書 §2.1 line 290-293）。
 * UI で入力された名称・種別ラベル・新規コンテナ自身の所属先を
 * `ReassignFeatureParentUseCase.createNewParent` へ橋渡しする。
 * Application 層の `CreateNewParentSpec` と同形だが、層をまたぐ型依存を避けるため
 * presentation 層で独立に宣言し、App.svelte が UseCase 型へマッピングする
 * （§6.0.1 検出観点2: フィールド追加時は両型をセットで見直す）。
 *
 * `parentId` で新規コンテナ自身の所属を指定する（要件定義書 §2.1 line 292 / line 305）:
 * - `null` または未指定: 新規最上位コンテナ（最上位フラグ真）— 連邦化。
 * - 非 null: 既存の上位領域に所属する新中間コンテナ — 自治化。
 */
export interface CreateNewParentInput {
  readonly name: string;
  readonly kind?: string;
  readonly parentId?: string | null;
}

export interface ParentTransferConfirmDetail {
  readonly scope: ParentTransferScope;
  readonly featureIds: readonly string[];
  readonly newParentId: string | null;
  /**
   * 指定時、新規上位領域コンテナを作成して対象を帰属させる。`newParentId` は無視される。
   * `createNewParent.parentId` 未設定なら新規最上位コンテナ（連邦化）、非 null なら
   * 既存の上位領域に所属する新中間コンテナ（自治化）。
   */
  readonly createNewParent?: CreateNewParentInput;
}

/**
 * 所属変更ダイアログ「新しい親」の確定意図（要件定義書 §2.1 line 286-293）。
 * - `'reassign'`: 既存の面情報 / 親なし（最上位）へ移す（割譲・帰属・直轄化・独立）。
 * - `'createNewParent'`: 新規上位領域コンテナを作成して帰属させる。`spec.parentId` 未設定なら
 *   新規最上位コンテナ（連邦化）、非 null なら既存の上位領域に所属する新中間コンテナ（自治化）。
 */
export type ParentTransferResolution =
  | { readonly type: 'reassign'; readonly newParentId: string | null }
  | { readonly type: 'createNewParent'; readonly spec: CreateNewParentInput };

interface TimeSlice {
  readonly start: TimePoint;
  readonly end?: TimePoint;
}

/**
 * 面情報（末端ポリゴン・集約地物コンテナの双方）の指定時刻における有効錨を返す。
 *
 * ParentTransferDialog は sceneEntries を介さず `Feature` を直接受け取るため、
 * 現状.md §6.10 Phase 2.5-E / 開発ガイド §6.6.9「判定をデータ側に寄せる」に従い、
 * polygon-like の判定基準を `feature.featureType === 'Polygon'` に統一する
 * （PropertyPanel の `isPolygonLikeFeature` と同一基準。Feature ベース経路間でドリフトさせない）。
 * これにより shape を持たない集約地物（コンテナ）も親候補・所属変更対象として扱える。
 *
 * Polygon 地物の有効錨は末端（`shape.type === 'Polygon'`）か集約地物（`shape === undefined`）の
 * いずれかであり、型整合は `jsonSerializerValidation.validateShapePresence`（Phase 2-C-4）が
 * 保証する。よって shape の有無で弾かず、Polygon 地物の有効錨をそのまま返す。
 */
export function getActivePolygonAnchor(
  feature: Feature | null,
  time: TimePoint | undefined
): FeatureAnchor | null {
  if (!feature || !time || feature.featureType !== 'Polygon') return null;
  return feature.getActiveAnchor(time) ?? null;
}

export function getFeatureDisplayName(
  feature: Feature,
  time: TimePoint | undefined
): string {
  if (!time) return feature.id;
  return feature.getActiveAnchor(time)?.property.name ?? feature.id;
}

export function getTransferFeatureIds(
  feature: Feature | null,
  time: TimePoint | undefined,
  scope: ParentTransferScope
): readonly string[] {
  const anchor = getActivePolygonAnchor(feature, time);
  if (!feature || !anchor) return [];
  return scope === 'selected' ? [feature.id] : anchor.placement.childIds;
}

export function isLeafFromTime(
  feature: Feature | null,
  time: TimePoint | undefined
): boolean {
  const anchor = getActivePolygonAnchor(feature, time);
  if (!feature || !time || !anchor) return false;

  return feature.anchors.every((candidate) => {
    if (candidate.timeRange.end && !candidate.timeRange.end.isAtOrAfter(time)) {
      return true;
    }
    if (candidate.timeRange.end && candidate.timeRange.end.equals(time)) {
      return true;
    }
    return candidate.placement.childIds.length === 0;
  });
}

export function canTransferSelectedFeature(
  feature: Feature | null,
  time: TimePoint | undefined
): boolean {
  return isLeafFromTime(feature, time);
}

export function canTransferChildren(
  feature: Feature | null,
  time: TimePoint | undefined,
  features: readonly Feature[]
): boolean {
  const anchor = getActivePolygonAnchor(feature, time);
  if (!anchor || anchor.placement.childIds.length === 0) return false;

  const featureMap = new Map(features.map((candidate) => [candidate.id, candidate]));
  return anchor.placement.childIds.every((childId) =>
    isLeafFromTime(featureMap.get(childId) ?? null, time)
  );
}

export function collectDescendantIds(
  featureId: string,
  features: readonly Feature[],
  time: TimePoint | undefined
): Set<string> {
  const descendants = new Set<string>();
  if (!time) return descendants;

  const featureMap = new Map(features.map((feature) => [feature.id, feature]));
  const visit = (id: string): void => {
    const feature = featureMap.get(id);
    const anchor = feature?.getActiveAnchor(time);
    if (!anchor) return;
    for (const childId of anchor.placement.childIds) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      visit(childId);
    }
  };

  visit(featureId);
  return descendants;
}

export function buildParentCandidateItems(params: {
  readonly features: readonly Feature[];
  readonly time: TimePoint | undefined;
  readonly movingFeatureIds: readonly string[];
  readonly excludedFeatureIds?: readonly string[];
}): ParentCandidateItem[] {
  const { features, time, movingFeatureIds, excludedFeatureIds = [] } = params;
  if (!time) return [];
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));
  const movingFeatures = movingFeatureIds
    .map((featureId) => featureMap.get(featureId))
    .filter((feature): feature is Feature => feature !== undefined);

  const excluded = new Set([...movingFeatureIds, ...excludedFeatureIds]);
  for (const featureId of movingFeatureIds) {
    for (const descendantId of collectDescendantIds(featureId, features, time)) {
      excluded.add(descendantId);
    }
  }

  return features
    .filter((feature) =>
      !excluded.has(feature.id) &&
      canParentCoverFeatureRanges(feature, movingFeatures, time)
    )
    .map((feature) => {
      const anchor = getActivePolygonAnchor(feature, time);
      if (!anchor) return null;
      return {
        id: feature.id,
        name: anchor.property.name || feature.id,
      };
    })
    .filter((item): item is ParentCandidateItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function buildNewFeatureParentCandidateItems(params: {
  readonly features: readonly Feature[];
  readonly time: TimePoint | undefined;
}): ParentCandidateItem[] {
  const { features, time } = params;
  if (!time) return [];

  return features
    .map((feature) => {
      const anchor = getActivePolygonAnchor(feature, time);
      // 要件定義書 §2.3.2: 現行の新規面は終了時刻なし。終端指定を追加したら第3引数を置き換える。
      if (!anchor || !featureCoversRange(feature, time, undefined)) return null;
      return {
        id: feature.id,
        name: anchor.property.name || feature.id,
      };
    })
    .filter((item): item is ParentCandidateItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export function canParentCoverFeatureRanges(
  parent: Feature | null,
  movingFeatures: readonly Feature[],
  time: TimePoint | undefined
): boolean {
  if (!parent || !time) return false;

  return movingFeatures.every((feature) =>
    collectFeatureTimeSlicesFrom(feature, time).every((slice) =>
      featureCoversRange(parent, slice.start, slice.end)
    )
  );
}

/**
 * 新規上位領域作成サブフローにおける、新規コンテナ自身の所属（要件定義書 §2.1 line 292）。
 * - `'root'`: 新規最上位領域として作成する（最上位フラグ真）— 連邦化。
 * - `'existing'`: 既存の上位領域に所属させる（自治化: 既存子と既存親の間に挿入）。
 */
export type NewParentPlacementMode = 'root' | 'existing';

/**
 * 所属変更ダイアログの「新しい親」3 択（既存 / 親なし / 新規作成）から、
 * 確定意図を解決する（要件定義書 §2.1 line 286-293）。
 *
 * - `'root'`（独立）: 親なし（最上位領域へ）。`{ type: 'reassign', newParentId: null }`。
 * - `'existing'`（割譲・帰属・直轄化）: 選択中の既存候補。候補一覧に含まれる有効な
 *   選択のときのみ解決し、未選択・候補外なら `null`（確定不可）を返す。
 * - `'new'`（連邦化・自治化）: 新規上位領域コンテナを作成。名称が非空のときのみ解決し、
 *   空名なら `null`（確定不可）を返す。種別ラベルは任意（空なら未設定）。
 *   新規コンテナ自身の所属は `newParentPlacementMode` で分岐する:
 *   - `'root'`: 新規最上位コンテナ（`parentId` 未設定）。
 *   - `'existing'`（自治化）: `selectedNewParentParentId` が `newParentParentCandidates`
 *     一覧に含まれる有効な選択のときのみ解決し、未選択・候補外なら `null`（確定不可）を返す。
 *   再帰積み上げ（多段中間階層挿入）は後続サブフェーズ。
 *
 * 既存再割当の候補（`parentCandidates`）と自治化の所属先候補（`newParentParentCandidates`）は
 * 除外規則が異なるため別引数で受け取る（後者は scope='children' でも現在の親を除外しない。
 * 自治化は既存子と既存親の間への挿入だから。呼び出し側の ParentTransferDialog で別導出する）。
 */
export function resolveParentTransferTarget(params: {
  readonly mode: ParentTransferMode;
  readonly selectedExistingParentId: string;
  readonly parentCandidates: readonly ParentCandidateItem[];
  readonly newParentName: string;
  readonly newParentKind: string;
  readonly newParentPlacementMode: NewParentPlacementMode;
  readonly selectedNewParentParentId: string;
  readonly newParentParentCandidates: readonly ParentCandidateItem[];
}): ParentTransferResolution | null {
  const {
    mode,
    selectedExistingParentId,
    parentCandidates,
    newParentName,
    newParentKind,
    newParentPlacementMode,
    selectedNewParentParentId,
    newParentParentCandidates,
  } = params;
  if (mode === 'root') return { type: 'reassign', newParentId: null };
  if (mode === 'existing') {
    return parentCandidates.some((candidate) => candidate.id === selectedExistingParentId)
      ? { type: 'reassign', newParentId: selectedExistingParentId }
      : null;
  }
  const name = newParentName.trim();
  if (name === '') return null;
  const kind = newParentKind.trim();
  // 自治化: 新規コンテナの所属先は所属先候補一覧に含まれる有効な選択のときのみ確定する
  // （新規コンテナ自身の循環参照防止・期間カバレッジは候補一覧の絞り込みで担保。
  //  UseCase 入口の assertContainerParentValid / validateTransfer と二重防御）。
  let containerParentId: string | null = null;
  if (newParentPlacementMode === 'existing') {
    if (!newParentParentCandidates.some((candidate) => candidate.id === selectedNewParentParentId)) {
      return null;
    }
    containerParentId = selectedNewParentParentId;
  }
  return {
    type: 'createNewParent',
    spec: {
      name,
      ...(kind !== '' ? { kind } : {}),
      ...(containerParentId !== null ? { parentId: containerParentId } : {}),
    },
  };
}

export function resolveParentTransferSelection(params: {
  readonly features: readonly Feature[];
  readonly time: TimePoint | undefined;
  readonly currentSelectedFeatureId: string | null;
  readonly movedFeatureIds: readonly string[];
  readonly newParentId: string | null;
}): string | null {
  const { features, time, currentSelectedFeatureId, movedFeatureIds, newParentId } = params;
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));

  const exists = (featureId: string | null): featureId is string => {
    if (!featureId) return false;
    const feature = featureMap.get(featureId);
    if (!feature) return false;
    return !time || feature.existsAt(time);
  };

  if (exists(currentSelectedFeatureId)) return currentSelectedFeatureId;
  if (exists(newParentId)) return newParentId;
  return movedFeatureIds.find((featureId) => exists(featureId)) ?? null;
}

function collectFeatureTimeSlicesFrom(
  feature: Feature,
  time: TimePoint
): TimeSlice[] {
  const slices: TimeSlice[] = [];
  for (const anchor of feature.anchors) {
    if (anchor.timeRange.end && !time.isBefore(anchor.timeRange.end)) {
      continue;
    }
    slices.push({
      start: anchor.timeRange.start.isBefore(time) ? time : anchor.timeRange.start,
      end: anchor.timeRange.end,
    });
  }
  return slices;
}
