/**
 * 錨編集準備ユースケース
 *
 * §5.3.1: PrepareFeatureAnchorEditUseCase
 *
 * 編集差分パッチを受け取り、候補錨列を生成、競合を検出する。
 * Prepare 成功後にのみ Resolve / Commit を実行可能。
 */

import { FeatureAnchor, createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import {
  detectConflictsForFeature,
  type SpatialConflict,
} from '@domain/services/ConflictDetectionService';
import {
  sortAnchorsByStartTime,
  validateAnchorTimeline,
} from '@domain/services/TimeService';
import type {
  EditMode,
  DraftPatch,
  PrepareResult,
  AnchorEditDraft,
} from './AnchorEditDraft';

let nextDraftNum = 1;

/**
 * 錨編集準備ユースケース
 */
export class PrepareFeatureAnchorEditUseCase {
  /** 保留中のドラフト（draftId → draft） */
  private drafts = new Map<string, AnchorEditDraft>();

  constructor(
    private readonly featureUseCase: AddFeatureUseCase
  ) {}

  /**
   * 編集案を準備する
   *
   * §5.3.1: 入力を受け取り、候補錨列と競合一覧を生成
   */
  prepare(
    featureId: string,
    editMode: EditMode,
    editTime: TimePoint,
    draftPatch: DraftPatch
  ): PrepareResult {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) {
      throw new PrepareError(`地物 "${featureId}" が見つかりません`);
    }

    const originalAnchors = [...feature.anchors];

    // 候補錨列を生成
    let candidateAnchors = this.applyCandidatePatch(
      feature, editMode, editTime, draftPatch
    );

    // 境界編集があれば適用
    if (draftPatch.boundaryEdit) {
      candidateAnchors = this.applyBoundaryEdit(
        candidateAnchors, draftPatch.boundaryEdit
      );
    }

    // §5.3.1: 正規化 — 開始時刻昇順・重複なし
    candidateAnchors = sortAnchorsByStartTime(candidateAnchors);

    // §5.3.1: 正規化後の錨列が0件 → 失敗
    if (candidateAnchors.length === 0) {
      throw new PrepareError('正規化後の錨列が0件です');
    }

    // バリデーション
    const validationErrors = validateAnchorTimeline(candidateAnchors);
    if (validationErrors.length > 0) {
      throw new PrepareError(
        `錨列のバリデーションエラー: ${validationErrors.map(e => e.message).join(', ')}`
      );
    }

    // 影響を受ける時間範囲を特定
    const affectedTimeRange = this.computeAffectedTimeRange(originalAnchors, candidateAnchors);

    // 競合検出
    const conflicts = this.detectConflicts(feature, candidateAnchors, editTime);

    const draftId = `draft-${nextDraftNum++}`;
    const status = conflicts.length > 0 ? 'requires_resolution' : 'ready_to_commit';

    const draft: AnchorEditDraft = {
      draftId,
      featureId,
      editMode,
      editTime,
      originalAnchors,
      candidateAnchors,
      affectedTimeRange,
      conflicts,
      status,
    };

    this.drafts.set(draftId, draft);

    return {
      draftId,
      status,
      candidateAnchors,
      affectedTimeRange,
      conflicts,
    };
  }

  /**
   * ドラフトを取得する
   */
  getDraft(draftId: string): AnchorEditDraft | undefined {
    return this.drafts.get(draftId);
  }

  /**
   * ドラフトを破棄する
   */
  discardDraft(draftId: string): void {
    this.drafts.delete(draftId);
  }

  // ──────────────────────────────────────────
  // 内部メソッド
  // ──────────────────────────────────────────

  /**
   * 編集パッチを適用して候補錨列を生成
   */
  private applyCandidatePatch(
    feature: Feature,
    editMode: EditMode,
    editTime: TimePoint,
    patch: DraftPatch
  ): FeatureAnchor[] {
    return feature.anchors.map(anchor => {
      if (!anchor.isActiveAt(editTime)) return anchor;

      let updated = anchor;

      // プロパティ更新
      if (patch.property) {
        updated = updated.withProperty({
          ...updated.property,
          ...patch.property,
        });
      }

      // 形状更新（shape_and_property モードのみ）
      if (editMode === 'shape_and_property' && patch.shape) {
        updated = updated.withShape(patch.shape);
      }

      // 配置更新（不変条件「同一錨内で isTopLevel === (parentId === null)」を維持するため
      // createAnchorPlacement で再構築する）
      if (patch.placement) {
        const merged = { ...updated.placement, ...patch.placement };
        updated = updated.withPlacement(
          createAnchorPlacement(merged.layerId, merged.parentId, merged.childIds)
        );
      }

      // 時間範囲更新
      if (patch.timeRange) {
        updated = updated.withTimeRange({
          ...updated.timeRange,
          ...patch.timeRange,
        });
      }

      return updated;
    });
  }

  /**
   * 境界編集を適用する
   *
   * §5.3.1: boundaryEdit が指定された場合、同一地物内の錨列を
   * 開始時刻昇順・重複なしへ正規化した候補を生成
   */
  private applyBoundaryEdit(
    anchors: FeatureAnchor[],
    boundaryEdit: { targetAnchorId: string; newStart?: TimePoint; newEnd?: TimePoint | null }
  ): FeatureAnchor[] {
    return anchors.map(anchor => {
      if (anchor.id !== boundaryEdit.targetAnchorId) return anchor;

      const newTimeRange = { ...anchor.timeRange };
      if (boundaryEdit.newStart !== undefined) {
        (newTimeRange as any).start = boundaryEdit.newStart;
      }
      if (boundaryEdit.newEnd !== undefined) {
        (newTimeRange as any).end = boundaryEdit.newEnd === null ? undefined : boundaryEdit.newEnd;
      }
      return anchor.withTimeRange(newTimeRange);
    });
  }

  /**
   * 影響を受ける時間範囲を計算する
   */
  private computeAffectedTimeRange(
    original: readonly FeatureAnchor[],
    candidate: readonly FeatureAnchor[]
  ): { start: TimePoint; end?: TimePoint } {
    const all = [...original, ...candidate];
    if (all.length === 0) {
      throw new PrepareError('錨が存在しません');
    }

    let earliest = all[0].timeRange.start;
    let latest: TimePoint | undefined = undefined;

    for (const a of all) {
      if (a.timeRange.start.isBefore(earliest)) {
        earliest = a.timeRange.start;
      }
      if (a.timeRange.end) {
        if (!latest || a.timeRange.end.isAtOrAfter(latest)) {
          latest = a.timeRange.end;
        }
      } else {
        // endがない → 無限大
        latest = undefined;
        break;
      }
    }

    return { start: earliest, end: latest };
  }

  /**
   * 競合を検出する
   */
  private detectConflicts(
    feature: Feature,
    candidateAnchors: readonly FeatureAnchor[],
    editTime: TimePoint
  ): SpatialConflict[] {
    // 候補錨を適用した仮想地物で競合検出
    const tempFeature = feature.withAnchors(candidateAnchors);
    const activeAnchor = tempFeature.getActiveAnchor(editTime);
    if (!activeAnchor || activeAnchor.shape.type !== 'Polygon') return [];

    const allFeatures = this.featureUseCase.getFeatures();
    const vertices = this.featureUseCase.getVertices();

    return detectConflictsForFeature(
      tempFeature,
      allFeatures,
      vertices,
      editTime,
      activeAnchor.placement.layerId
    );
  }
}

/** Prepare エラー */
export class PrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrepareError';
  }
}
