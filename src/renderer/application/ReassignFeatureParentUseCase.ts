/**
 * 地物所属変更ユースケース
 *
 * 要件定義書 §2.1: 割譲と合邦機能（所属変更）
 *
 * 特定時刻以降の歴史の錨に対して、子地物の parentId と
 * 旧親・新親の childIds を同一操作として更新する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import { FeatureAnchor, type AnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import {
  getAncestors,
  validateHierarchy,
} from '@domain/services/LayerService';
import { featureCoversRange } from '@domain/services/TimeService';
import {
  validateTransfer,
  type TransferType,
} from '@domain/services/MergeService';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { eventBus } from './EventBus';

export class FeatureParentTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureParentTransferError';
  }
}

export interface ReassignFeatureParentParams {
  readonly featureIds: readonly string[];
  readonly newParentId: string | null;
  readonly effectiveTime: TimePoint;
  readonly transferType?: TransferType;
}

export interface ReassignFeatureParentResult {
  readonly changedFeatureIds: readonly string[];
}

export class ReassignFeatureParentUseCase {
  constructor(private readonly featureUseCase: AddFeatureUseCase) {}

  assertCanAssignNewFeatureToParent(
    newParentId: string,
    effectiveTime: TimePoint
  ): void {
    const parent = this.featureUseCase.getFeatureById(newParentId);
    if (!parent || !parent.existsAt(effectiveTime)) {
      throw new FeatureParentTransferError(`新しい親地物 "${newParentId}" が指定時刻に存在しません`);
    }
    if (parent.featureType !== 'Polygon') {
      throw new FeatureParentTransferError('新しい親には面情報のみ指定できます');
    }
    if (!featureCoversRange(parent, effectiveTime, undefined)) {
      throw new FeatureParentTransferError(
        `新しい親地物 "${newParentId}" は対象地物の存在期間を覆っていません`
      );
    }
  }

  reassignFeatureParent(
    params: ReassignFeatureParentParams
  ): ReassignFeatureParentResult {
    const featureIds = [...new Set(params.featureIds)];
    const transferType = params.transferType ?? 'reassign';
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const staged = new Map(features);
    const allFeatures = [...staged.values()];
    const changedFeatureIds = new Set<string>();
    const usedAnchorIds = collectUsedAnchorIds(staged);
    const prunedParentQueue: CascadingParentSync[] = [];

    this.validateRequest(featureIds, params.newParentId, params.effectiveTime, allFeatures, transferType);

    const oldParentIds = new Set<string>();
    for (const featureId of featureIds) {
      const feature = staged.get(featureId)!;
      for (const parentId of collectParentIdsFromTime(feature, params.effectiveTime)) {
        oldParentIds.add(parentId);
      }
    }

    for (const featureId of featureIds) {
      const feature = staged.get(featureId)!;
      const updated = this.updatePlacementFromTime(
        feature,
        params.effectiveTime,
        usedAnchorIds,
        (placement) => ({
          ...placement,
          parentId: params.newParentId,
        })
      );
      this.stageFeature(staged, changedFeatureIds, feature, updated);
    }

    for (const oldParentId of oldParentIds) {
      if (oldParentId === params.newParentId) continue;
      const oldParent = staged.get(oldParentId);
      if (!oldParent) {
        throw new FeatureParentTransferError(`元の親地物 "${oldParentId}" が見つかりません`);
      }
      const updated = this.updatePlacementFromTime(
        oldParent,
        params.effectiveTime,
        usedAnchorIds,
        (placement) => ({
          ...placement,
          childIds: placement.childIds.filter((id) => !featureIds.includes(id)),
        })
      );
      const pruned = this.removeEmptyParentRangesFromTime(
        oldParent,
        updated,
        params.effectiveTime,
        featureIds
      );
      if (pruned) {
        this.stageFeature(staged, changedFeatureIds, oldParent, pruned);
        if (pruned !== updated) {
          prunedParentQueue.push({ original: oldParent });
        }
      } else {
        this.stageFeatureDeletion(staged, changedFeatureIds, oldParent);
        prunedParentQueue.push({ original: oldParent });
      }
    }

    if (params.newParentId !== null) {
      const newParent = staged.get(params.newParentId)!;
      const movedFeatures = featureIds.map((featureId) => staged.get(featureId)!);
      const updated = this.updateParentChildIdsFromTime(
        newParent,
        params.effectiveTime,
        usedAnchorIds,
        movedFeatures
      );
      this.stageFeature(staged, changedFeatureIds, newParent, updated);
    }

    this.cascadeParentCleanup(
      staged,
      changedFeatureIds,
      params.effectiveTime,
      usedAnchorIds,
      prunedParentQueue
    );

    this.validateStagedHierarchy(staged, params.effectiveTime, changedFeatureIds);

    const deletedFeatures = [...changedFeatureIds]
      .filter((featureId) => !staged.has(featureId))
      .map((featureId) => features.get(featureId))
      .filter((feature): feature is Feature => feature !== undefined);

    for (const featureId of changedFeatureIds) {
      const updated = staged.get(featureId);
      if (updated) {
        features.set(featureId, updated);
        eventBus.emit('feature:added', { featureId });
      } else if (features.delete(featureId)) {
        eventBus.emit('feature:removed', { featureId });
      }
    }
    this.cleanupDeletedFeatureArtifacts(deletedFeatures);

    return { changedFeatureIds: [...changedFeatureIds] };
  }

  private validateRequest(
    featureIds: readonly string[],
    newParentId: string | null,
    effectiveTime: TimePoint,
    allFeatures: readonly Feature[],
    transferType: TransferType
  ): void {
    const featureMap = new Map(allFeatures.map((feature) => [feature.id, feature]));

    if (featureIds.length === 0) {
      throw new FeatureParentTransferError('所属変更の対象地物が指定されていません');
    }

    for (const featureId of featureIds) {
      const feature = featureMap.get(featureId);
      if (!feature) {
        throw new FeatureParentTransferError(`所属変更の対象地物が見つかりません: ${featureId}`);
      }
      const activeAnchor = feature.getActiveAnchor(effectiveTime);
      if (!activeAnchor) {
        throw new FeatureParentTransferError(`地物 "${featureId}" は指定時刻に存在しません`);
      }
      if (feature.featureType !== 'Polygon') {
        throw new FeatureParentTransferError('所属変更できるのは面情報のみです');
      }
      this.assertLeafFromTime(feature, effectiveTime);
    }

    if (newParentId !== null) {
      const parent = featureMap.get(newParentId);
      if (!parent || !parent.existsAt(effectiveTime)) {
        throw new FeatureParentTransferError(`新しい親地物 "${newParentId}" が指定時刻に存在しません`);
      }
      if (parent.featureType !== 'Polygon') {
        throw new FeatureParentTransferError('新しい親には面情報のみ指定できます');
      }
      this.assertParentCoversTargetRanges(
        parent,
        featureIds.map((featureId) => featureMap.get(featureId)!),
        effectiveTime
      );
    }

    const transferValidation = validateTransfer(
      { featureIds, newParentId, type: transferType },
      (featureId) => {
        const feature = featureMap.get(featureId);
        if (!feature) return [];
        return getAncestors(feature, allFeatures, effectiveTime).map((ancestor) => ancestor.id);
      }
    );
    if (!transferValidation.valid) {
      throw new FeatureParentTransferError(transferValidation.error ?? '所属変更の指定が不正です');
    }
  }

  private assertLeafFromTime(feature: Feature, effectiveTime: TimePoint): void {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !anchor.timeRange.end.isAtOrAfter(effectiveTime)) {
        continue;
      }
      if (anchor.timeRange.end && anchor.timeRange.end.equals(effectiveTime)) {
        continue;
      }
      if (anchor.placement.childIds.length > 0) {
        throw new FeatureParentTransferError(
          `地物 "${feature.id}" は下位領域を持つため、直接の所属変更はできません`
        );
      }
    }
  }

  private assertParentCoversTargetRanges(
    parent: Feature,
    targetFeatures: readonly Feature[],
    effectiveTime: TimePoint
  ): void {
    for (const feature of targetFeatures) {
      for (const anchor of feature.anchors) {
        if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
          continue;
        }
        const rangeStart = anchor.timeRange.start.isBefore(effectiveTime)
          ? effectiveTime
          : anchor.timeRange.start;
        if (!featureCoversRange(parent, rangeStart, anchor.timeRange.end)) {
          throw new FeatureParentTransferError(
            `新しい親地物 "${parent.id}" は対象地物 "${feature.id}" の存在期間を覆っていません`
          );
        }
      }
    }
  }

  private updatePlacementFromTime(
    feature: Feature,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    updater: (placement: AnchorPlacement) => AnchorPlacement
  ): Feature {
    const updatedAnchors: FeatureAnchor[] = [];
    let changed = false;

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      const startsAtOrAfter = anchor.timeRange.start.isAtOrAfter(effectiveTime);
      if (startsAtOrAfter) {
        const updatedPlacement = updater(anchor.placement);
        if (samePlacement(anchor.placement, updatedPlacement)) {
          updatedAnchors.push(anchor);
        } else {
          updatedAnchors.push(anchor.withPlacement(updatedPlacement));
          changed = true;
        }
        continue;
      }

      const updatedPlacement = updater(anchor.placement);
      if (samePlacement(anchor.placement, updatedPlacement)) {
        updatedAnchors.push(anchor);
        continue;
      }

      updatedAnchors.push(anchor.withTimeRange({
        start: anchor.timeRange.start,
        end: effectiveTime,
      }));
      updatedAnchors.push(new FeatureAnchor(
        this.createSplitAnchorId(anchor.id, usedAnchorIds),
        { start: effectiveTime, end: anchor.timeRange.end },
        anchor.property,
        anchor.shape,
        updatedPlacement
      ));
      changed = true;
    }

    return changed ? feature.withAnchors(updatedAnchors) : feature;
  }

  private updateParentChildIdsFromTime(
    feature: Feature,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    targetFeatures: readonly Feature[],
    targetFeatureIds = new Set(targetFeatures.map((target) => target.id))
  ): Feature {
    const updatedAnchors: FeatureAnchor[] = [];
    let changed = false;

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      const segmentStart = anchor.timeRange.start.isBefore(effectiveTime)
        ? effectiveTime
        : anchor.timeRange.start;
      const segments = buildParentChildSegments(
        anchor,
        segmentStart,
        targetFeatures,
        targetFeatureIds
      );

      if (segments.length === 1 &&
        samePlacement(anchor.placement, segments[0].placement) &&
        sameOptionalTime(anchor.timeRange.end, segments[0].end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      changed = true;
      if (anchor.timeRange.start.isBefore(effectiveTime)) {
        updatedAnchors.push(anchor.withTimeRange({
          start: anchor.timeRange.start,
          end: effectiveTime,
        }));
      }

      let usesOriginalId = !anchor.timeRange.start.isBefore(effectiveTime);
      for (const segment of segments) {
        const anchorId = usesOriginalId
          ? anchor.id
          : this.createSplitAnchorId(anchor.id, usedAnchorIds);
        usesOriginalId = false;
        updatedAnchors.push(new FeatureAnchor(
          anchorId,
          segment.end ? { start: segment.start, end: segment.end } : { start: segment.start },
          anchor.property,
          anchor.shape,
          segment.placement
        ));
      }
    }

    return changed ? feature.withAnchors(updatedAnchors) : feature;
  }

  private validateStagedHierarchy(
    staged: ReadonlyMap<string, Feature>,
    effectiveTime: TimePoint,
    changedFeatureIds: ReadonlySet<string>
  ): void {
    const validationTimes = collectValidationTimes([...staged.values()], effectiveTime);
    for (const time of validationTimes) {
      const errors = validateHierarchy([...staged.values()], time)
        .concat(validateChildReferences([...staged.values()], time))
        .filter((error) => changedFeatureIds.has(error.featureId));
      if (errors.length > 0) {
        throw new FeatureParentTransferError(errors[0].message);
      }
    }
  }

  private stageFeature(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    original: Feature,
    updated: Feature
  ): void {
    if (updated === original) return;
    staged.set(updated.id, updated);
    changedFeatureIds.add(updated.id);
  }

  private stageFeatureDeletion(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    original: Feature
  ): void {
    staged.delete(original.id);
    changedFeatureIds.add(original.id);
  }

  private cascadeParentCleanup(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    queue: CascadingParentSync[]
  ): void {
    while (queue.length > 0) {
      const current = queue.shift()!;
      const updatedChild = staged.get(current.original.id) ?? null;
      const targetFeatures = updatedChild ? [updatedChild] : [];
      const targetFeatureIds = new Set([current.original.id]);

      for (const parentId of collectParentIdsFromTime(current.original, effectiveTime)) {
        const parent = staged.get(parentId);
        if (!parent) continue;

        const updatedParent = this.updateParentChildIdsFromTime(
          parent,
          effectiveTime,
          usedAnchorIds,
          targetFeatures,
          targetFeatureIds
        );
        const prunedParent = this.removeEmptyParentRangesFromTime(
          parent,
          updatedParent,
          effectiveTime,
          [current.original.id]
        );

        if (prunedParent) {
          this.stageFeature(staged, changedFeatureIds, parent, prunedParent);
          if (prunedParent !== updatedParent) {
            queue.push({ original: parent });
          }
        } else {
          this.stageFeatureDeletion(staged, changedFeatureIds, parent);
          queue.push({ original: parent });
        }
      }
    }
  }

  private removeEmptyParentRangesFromTime(
    original: Feature,
    feature: Feature,
    effectiveTime: TimePoint,
    removedChildIds: readonly string[]
  ): Feature | null {
    const anchors: FeatureAnchor[] = [];
    let changed = false;
    const removedChildIdSet = new Set(removedChildIds);

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        anchors.push(anchor);
        continue;
      }

      if (anchor.timeRange.start.isBefore(effectiveTime)) {
        anchors.push(anchor);
        continue;
      }

      if (anchor.placement.childIds.length === 0 &&
        this.didLoseRemovedChildren(original, anchor.timeRange.start, removedChildIdSet)) {
        changed = true;
        continue;
      }
      anchors.push(anchor);
    }

    if (anchors.length === 0) return null;
    return changed ? feature.withAnchors(anchors) : feature;
  }

  private didLoseRemovedChildren(
    original: Feature,
    time: TimePoint,
    removedChildIds: ReadonlySet<string>
  ): boolean {
    const originalAnchor = original.getActiveAnchor(time);
    if (!originalAnchor) return false;
    return originalAnchor.placement.childIds.some((childId) => removedChildIds.has(childId));
  }

  private cleanupDeletedFeatureArtifacts(deletedFeatures: readonly Feature[]): void {
    if (deletedFeatures.length === 0) return;

    const features = this.featureUseCase.getFeaturesMap();
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    const usedVertexIds = collectAllUsedVertexIds(features);
    const removedVertexIds = new Set<string>();

    for (const feature of deletedFeatures) {
      for (const vertexId of collectFeatureVertexIds(feature)) {
        if (usedVertexIds.has(vertexId) || removedVertexIds.has(vertexId)) continue;
        if (vertices.delete(vertexId)) {
          removedVertexIds.add(vertexId);
        }
      }
    }

    if (removedVertexIds.size === 0) return;

    for (const [groupId, group] of sharedGroups) {
      const nextVertexIds = group.vertexIds.filter((vertexId) => !removedVertexIds.has(vertexId));
      if (nextVertexIds.length === group.vertexIds.length) continue;
      if (nextVertexIds.length <= 1) {
        sharedGroups.delete(groupId);
      } else {
        sharedGroups.set(groupId, group.withVertexIds(nextVertexIds));
      }
    }
  }

  private createSplitAnchorId(anchorId: string, usedAnchorIds: Set<string>): string {
    let suffix = 1;
    let candidate = `${anchorId}-parent-${suffix}`;
    while (usedAnchorIds.has(candidate)) {
      suffix += 1;
      candidate = `${anchorId}-parent-${suffix}`;
    }
    usedAnchorIds.add(candidate);
    return candidate;
  }
}

interface ParentChildSegment {
  readonly start: TimePoint;
  readonly end?: TimePoint;
  readonly placement: AnchorPlacement;
}

interface CascadingParentSync {
  readonly original: Feature;
}

function appendUnique(baseIds: readonly string[], idsToAdd: readonly string[]): string[] {
  const result = [...baseIds];
  for (const id of idsToAdd) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

function samePlacement(a: AnchorPlacement, b: AnchorPlacement): boolean {
  return a.layerId === b.layerId &&
    a.parentId === b.parentId &&
    sameStringArray(a.childIds, b.childIds);
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sameOptionalTime(a: TimePoint | undefined, b: TimePoint | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.equals(b);
}

function collectValidationTimes(
  features: readonly Feature[],
  effectiveTime: TimePoint
): TimePoint[] {
  const times: TimePoint[] = [effectiveTime];
  for (const feature of features) {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.start.isAtOrAfter(effectiveTime) &&
        !times.some((time) => time.equals(anchor.timeRange.start))) {
        times.push(anchor.timeRange.start);
      }
      if (anchor.timeRange.end && anchor.timeRange.end.isAtOrAfter(effectiveTime) &&
        !times.some((time) => time.equals(anchor.timeRange.end))) {
        times.push(anchor.timeRange.end);
      }
    }
  }
  return times;
}

function buildParentChildSegments(
  anchor: FeatureAnchor,
  segmentStart: TimePoint,
  targetFeatures: readonly Feature[],
  targetFeatureIds: ReadonlySet<string>
): ParentChildSegment[] {
  const boundaryPoints = collectTargetBoundaryPoints(targetFeatures, segmentStart, anchor.timeRange.end);
  const rawSegments: ParentChildSegment[] = [];
  let currentStart = segmentStart;

  for (const boundaryPoint of [...boundaryPoints, anchor.timeRange.end].filter(
    (point): point is TimePoint => point !== undefined
  )) {
    rawSegments.push({
      start: currentStart,
      end: boundaryPoint,
      placement: buildParentPlacementForSegment(anchor.placement, currentStart, targetFeatures, targetFeatureIds),
    });
    currentStart = boundaryPoint;
  }

  if (!anchor.timeRange.end) {
    rawSegments.push({
      start: currentStart,
      placement: buildParentPlacementForSegment(anchor.placement, currentStart, targetFeatures, targetFeatureIds),
    });
  }

  return mergeParentChildSegments(rawSegments);
}

function buildParentPlacementForSegment(
  basePlacement: AnchorPlacement,
  time: TimePoint,
  targetFeatures: readonly Feature[],
  targetFeatureIds: ReadonlySet<string>
): AnchorPlacement {
  const baseChildIds = basePlacement.childIds.filter((childId) => !targetFeatureIds.has(childId));
  const activeTransferredChildIds = targetFeatures
    .filter((feature) => feature.getActiveAnchor(time) !== undefined)
    .map((feature) => feature.id);
  return {
    ...basePlacement,
    childIds: appendUnique(baseChildIds, activeTransferredChildIds),
  };
}

function mergeParentChildSegments(segments: readonly ParentChildSegment[]): ParentChildSegment[] {
  const merged: ParentChildSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous &&
      samePlacement(previous.placement, segment.placement) &&
      sameOptionalTime(previous.end, segment.start)) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: segment.end,
        placement: previous.placement,
      };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function collectTargetBoundaryPoints(
  targetFeatures: readonly Feature[],
  start: TimePoint,
  end: TimePoint | undefined
): TimePoint[] {
  const points: TimePoint[] = [];
  for (const feature of targetFeatures) {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.start.isAtOrAfter(start) &&
        !anchor.timeRange.start.equals(start) &&
        isBeforeOptional(anchor.timeRange.start, end) &&
        !points.some((point) => point.equals(anchor.timeRange.start))) {
        points.push(anchor.timeRange.start);
      }
      if (anchor.timeRange.end &&
        anchor.timeRange.end.isAtOrAfter(start) &&
        !anchor.timeRange.end.equals(start) &&
        isBeforeOptional(anchor.timeRange.end, end) &&
        !points.some((point) => point.equals(anchor.timeRange.end))) {
        points.push(anchor.timeRange.end);
      }
    }
  }
  return points.sort((a, b) => a.compareTo(b));
}

function isBeforeOptional(time: TimePoint, end: TimePoint | undefined): boolean {
  return !end || time.isBefore(end);
}

function collectParentIdsFromTime(feature: Feature, effectiveTime: TimePoint): Set<string> {
  const parentIds = new Set<string>();
  for (const anchor of feature.anchors) {
    if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
      continue;
    }
    if (anchor.placement.parentId !== null) {
      parentIds.add(anchor.placement.parentId);
    }
  }
  return parentIds;
}

function collectUsedAnchorIds(features: ReadonlyMap<string, Feature>): Set<string> {
  const ids = new Set<string>();
  for (const feature of features.values()) {
    for (const anchor of feature.anchors) {
      ids.add(anchor.id);
    }
  }
  return ids;
}

function collectFeatureVertexIds(feature: Feature): Set<string> {
  const ids = new Set<string>();
  for (const anchor of feature.anchors) {
    switch (anchor.shape.type) {
      case 'Point':
        ids.add(anchor.shape.vertexId);
        break;
      case 'LineString':
        for (const vertexId of anchor.shape.vertexIds) {
          ids.add(vertexId);
        }
        break;
      case 'Polygon':
        for (const ring of anchor.shape.rings) {
          for (const vertexId of ring.vertexIds) {
            ids.add(vertexId);
          }
        }
        break;
    }
  }
  return ids;
}

function collectAllUsedVertexIds(features: ReadonlyMap<string, Feature>): Set<string> {
  const ids = new Set<string>();
  for (const feature of features.values()) {
    for (const vertexId of collectFeatureVertexIds(feature)) {
      ids.add(vertexId);
    }
  }
  return ids;
}

function validateChildReferences(
  features: readonly Feature[],
  time: TimePoint
): { featureId: string; message: string }[] {
  const errors: { featureId: string; message: string }[] = [];
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) continue;

    for (const childId of anchor.placement.childIds) {
      const child = featureMap.get(childId);
      const childAnchor = child?.getActiveAnchor(time);
      if (!child || !childAnchor) {
        errors.push({
          featureId: feature.id,
          message: `地物 "${feature.id}" の子 "${childId}" が存在しません`,
        });
        continue;
      }
      if (childAnchor.placement.parentId !== feature.id) {
        errors.push({
          featureId: feature.id,
          message: `地物 "${feature.id}" の子 "${childId}" の親参照が一致しません`,
        });
      }
    }
  }

  return errors;
}
