import type { Feature } from '@domain/entities/Feature';
import { buildDirectlyGovernedDefaultName } from '@domain/services/HierarchyService';
import { featureCoversRange } from '@domain/services/TimeService';
import { isLeafPolygonAnchor, type FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
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
 * 再帰積み上げで最内コンテナのさらに上位へ挿入する 1 段分のコンテナ入力（名称・種別ラベル）。
 * Application 層 `NewParentContainerSpec` と同形（§6.0.1 検出観点2: 両型をセットで見直す）。
 */
export interface NewParentContainerInput {
  readonly name: string;
  readonly kind?: string;
}

/**
 * 新規上位領域作成サブフロー（連邦化・自治化）の入力（要件定義書 §2.1 line 290-293）。
 * UI で入力された名称・種別ラベル・新規コンテナ自身の所属先を
 * `ReassignFeatureParentUseCase.createNewParent` へ橋渡しする。
 * Application 層の `CreateNewParentSpec` と同形だが、層をまたぐ型依存を避けるため
 * presentation 層で独立に宣言し、App.svelte が UseCase 型へマッピングする
 * （§6.0.1 検出観点2: フィールド追加時は両型をセットで見直す）。
 *
 * `name` / `kind` は最内コンテナ（対象地物の直接の新親）の名称・種別。
 * `ancestors` は最内コンテナのさらに上位へ積み上げる新規コンテナ列（外側ほど後ろ。
 * 要件定義書 §2.1 line 293 の再帰積み上げ）。空または未指定なら単一コンテナ。
 *
 * `parentId` でチェーン最外コンテナ自身の所属を指定する（要件定義書 §2.1 line 292 / line 305）:
 * - `null` または未指定: 新規最上位コンテナ（最上位フラグ真）— 連邦化。
 * - 非 null: 既存の上位領域に所属する新中間コンテナ — 自治化。
 */
export interface CreateNewParentInput {
  readonly name: string;
  readonly kind?: string;
  readonly parentId?: string | null;
  readonly ancestors?: readonly NewParentContainerInput[];
}

/**
 * 末端地物 → 集約地物の遷移で自動生成される直轄領（要件定義書 §2.1 line 226-229）の
 * 名称・種別ラベルの上書き入力（§2.1 line 228）。
 * Application 層 `DirectlyGovernedOverrideSpec`（`ReassignFeatureParentUseCase.ts`）と同形の
 * 独立宣言（§6.0.1 検出観点2: フィールド追加時は両型をセットで見直す）。
 * 値はダイアログ入力の生文字列で、前後空白除去・空判定は UseCase 側で行う。
 */
export interface DirectlyGovernedOverrideInput {
  readonly name?: string;
  readonly kind?: string;
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
  /**
   * 既存末端地物が下位領域を獲得して集約地物へ遷移する場合の、自動生成される直轄領の
   * 名称・種別の上書き（§2.1 line 228）。遷移が起きない選択（独立・連邦化・既存集約地物への帰属）
   * では未設定。
   */
  readonly directlyGovernedOverride?: DirectlyGovernedOverrideInput;
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

/**
 * 集約地物（コンテナ）の「下位領域すべて」一括所属変更（解体・連邦編入等）が可能か。
 *
 * 対象が指定時刻に有効な面情報で、直接の下位領域を 1 つ以上持つとき真。
 *
 * Phase 4-4（現状.md §6.10「直接の下位領域を一括展開」）: 直接の下位領域には集約地物（多層コンテナ）が
 * 含まれてもよい。移動対象の集約地物は自身の下位領域（subtree）を保持したまま位相のみ変わるため、
 * 旧実装の「子がすべて末端でなければ無効」という制約は課さない。リーフ制約を課すと、子に集約地物を含む
 * 多層コンテナが「選択地物のみ」（コンテナ不可）・「下位領域すべて」（子に非末端あり不可）の双方で
 * 操作不能（dead-end）になるため。直接の所属変更が末端地物に限られる制約（要件定義書 §2.1 line 313）は
 * `canTransferSelectedFeature`（scope='selected'）側で維持する（対概念の同期。開発ガイド §6.0.1 検出観点2）。
 */
export function canTransferChildren(
  feature: Feature | null,
  time: TimePoint | undefined
): boolean {
  const anchor = getActivePolygonAnchor(feature, time);
  return anchor !== null && anchor.placement.childIds.length > 0;
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
 * 新規上位領域作成サブフローで UI が保持する 1 段分の生入力（名称・種別とも未トリム文字列）。
 * 再帰積み上げ（要件定義書 §2.1 line 293）の各階層 1 段に対応する。
 */
export interface NewParentLevelInput {
  readonly name: string;
  readonly kind: string;
}

/**
 * 所属変更ダイアログの「新しい親」3 択（既存 / 親なし / 新規作成）から、
 * 確定意図を解決する（要件定義書 §2.1 line 286-293）。
 *
 * - `'root'`（独立）: 親なし（最上位領域へ）。`{ type: 'reassign', newParentId: null }`。
 * - `'existing'`（割譲・帰属・直轄化）: 選択中の既存候補。候補一覧に含まれる有効な
 *   選択のときのみ解決し、未選択・候補外なら `null`（確定不可）を返す。
 * - `'new'`（連邦化・自治化）: 新規上位領域コンテナを作成。最内コンテナの名称（`newParentName`）が
 *   非空のときのみ解決し、空名なら `null`（確定不可）を返す。種別ラベルは任意（空なら未設定）。
 *   再帰積み上げ（要件定義書 §2.1 line 293）: `newParentAncestors` に最内のさらに上位へ積み上げる
 *   中間階層（外側ほど後ろ）を渡す。各段の名称が非空のときのみ解決し、いずれか空名なら `null`。
 *   チェーン最外コンテナ自身の所属は `newParentPlacementMode` で分岐する:
 *   - `'root'`: 新規最上位コンテナ（`parentId` 未設定）。
 *   - `'existing'`（自治化）: `selectedNewParentParentId` が `newParentParentCandidates`
 *     一覧に含まれる有効な選択のときのみ解決し、未選択・候補外なら `null`（確定不可）を返す。
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
  readonly newParentAncestors?: readonly NewParentLevelInput[];
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
    newParentAncestors,
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
  // 再帰積み上げ（要件定義書 §2.1 line 293）: 最内のさらに上位へ積み上げる中間階層。
  // 各段の名称（前後空白除去後）が非空のときのみ確定し、いずれか空名なら確定不可（null）。
  const ancestors = (newParentAncestors ?? []).map((level) => ({
    name: level.name.trim(),
    kind: level.kind.trim(),
  }));
  if (ancestors.some((level) => level.name === '')) return null;
  // 自治化: 新規コンテナチェーン最外の所属先は所属先候補一覧に含まれる有効な選択のときのみ確定する
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
      ...(ancestors.length > 0
        ? {
            ancestors: ancestors.map((level) => ({
              name: level.name,
              ...(level.kind !== '' ? { kind: level.kind } : {}),
            })),
          }
        : {}),
      ...(containerParentId !== null ? { parentId: containerParentId } : {}),
    },
  };
}

/**
 * 末端→集約遷移で直轄領が生成される「遷移する既存末端地物」の解決結果。
 * `defaultName` / `defaultKind` は入力欄の初期値（プレフィル）に使う。
 */
export interface DirectlyGovernedDefault {
  /** 遷移する既存末端地物（直轄領の親になる集約地物）の ID */
  readonly featureId: string;
  /** 遷移する地物の表示名（説明文用） */
  readonly parentName: string;
  /** 直轄領のデフォルト名称「`<元名> 直轄領`」 */
  readonly defaultName: string;
  /** 直轄領のデフォルト種別（元末端地物の種別。なければ空文字） */
  readonly defaultKind: string;
}

/**
 * 確定意図（`transferTarget`）から、末端→集約遷移で直轄領が生成される「遷移する既存末端地物」を
 * 特定し、直轄領のデフォルト名称・種別を返す（要件定義書 §2.1 line 225-229）。遷移が起きなければ `null`。
 *
 * 子を獲得して末端→集約遷移し得る既存地物は次の 2 経路（開発ガイド §6.1.8 / §6.0.1 検出観点2:
 * 征服と自治化の所属先を一様に扱う）:
 * - `reassign`（割譲・帰属・直轄化）: 新親 `newParentId`。
 * - `createNewParent` の自治化: 新規コンテナの所属先 `spec.parentId`（連邦化は `parentId` 不在 = 遷移なし）。
 *
 * 独立（`newParentId === null`）・連邦化（`parentId` 不在）は既存地物が子を獲得しないため遷移しない。
 * 既存集約地物（コンテナ）への帰属も、形状は下位領域の和として派生再計算されるだけで直轄領は生じない
 * （§2.1 line 231）。よって対象を既存末端地物（`isLeafPolygonAnchor`）に限定する（リーフ判定はドメインの
 * `isLeafPolygonAnchor` を共有し独自判定でドリフトさせない。開発ガイド §6.6.8）。
 *
 * デフォルト名称はドメインの `buildDirectlyGovernedDefaultName` を UseCase 側
 * （`resolveLeafToContainerTransition`）と共有して構築する（命名規則の二重ハードコードを避け
 * ドリフトを防ぐ。開発ガイド §6.0.1 検出観点2 / §6.6.9）。
 */
export function resolveDirectlyGovernedDefault(params: {
  readonly features: readonly Feature[];
  readonly time: TimePoint | undefined;
  readonly transferTarget: ParentTransferResolution | null;
}): DirectlyGovernedDefault | null {
  const { features, time, transferTarget } = params;
  if (!time || !transferTarget) return null;

  const targetParentId =
    transferTarget.type === 'reassign'
      ? transferTarget.newParentId
      : transferTarget.spec.parentId ?? null;
  if (targetParentId === null) return null;

  const parent = features.find((feature) => feature.id === targetParentId);
  if (!parent) return null;
  const anchor = getActivePolygonAnchor(parent, time);
  if (!anchor || !isLeafPolygonAnchor(anchor)) return null;

  return {
    featureId: parent.id,
    parentName: anchor.property.name || parent.id,
    defaultName: buildDirectlyGovernedDefaultName(anchor.property.name),
    defaultKind: anchor.property.kind ?? '',
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
