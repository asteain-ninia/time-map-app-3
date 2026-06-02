import type { Feature } from '@domain/entities/Feature';
import { featureCoversRange } from '@domain/services/TimeService';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export type ParentTransferScope = 'selected' | 'children';

export interface ParentCandidateItem {
  readonly id: string;
  readonly name: string;
}

export interface ParentTransferConfirmDetail {
  readonly scope: ParentTransferScope;
  readonly featureIds: readonly string[];
  readonly newParentId: string | null;
}

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
