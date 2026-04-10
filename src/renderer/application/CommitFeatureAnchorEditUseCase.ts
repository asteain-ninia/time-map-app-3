/**
 * 錨編集確定ユースケース
 *
 * §5.3.1: CommitFeatureAnchorEditUseCase
 *
 * ドラフトを確定し、全地物を一括更新する。
 * 部分確定は禁止（全地物を一括確定）。
 */

import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { PrepareFeatureAnchorEditUseCase } from './PrepareFeatureAnchorEditUseCase';
import { eventBus } from './EventBus';
import type {
  ResolveResult,
  CommitResult,
} from './AnchorEditDraft';

let nextHistoryNum = 1;

/**
 * 錨編集確定ユースケース
 */
export class CommitFeatureAnchorEditUseCase {
  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly prepareUseCase: PrepareFeatureAnchorEditUseCase
  ) {}

  /**
   * 編集案を確定する（競合なしの場合）
   *
   * §5.3.1: status="ready_to_commit" の場合のみ実行可能
   */
  commitDirect(draftId: string): CommitResult {
    const draft = this.prepareUseCase.getDraft(draftId);
    if (!draft) {
      throw new CommitError(`ドラフト "${draftId}" が見つかりません`);
    }

    if (draft.status === 'requires_resolution') {
      throw new CommitError('このドラフトは競合解決が必要です。先にResolveを実行してください');
    }

    // 候補錨を適用
    const anchorsByFeature = new Map<string, readonly FeatureAnchor[]>();
    anchorsByFeature.set(draft.featureId, draft.candidateAnchors);

    const result = this.applyAnchors(anchorsByFeature);

    // ドラフトを破棄
    this.prepareUseCase.discardDraft(draftId);

    return result;
  }

  /**
   * 競合解決後に確定する
   *
   * §5.3.1: resolvedAnchorsByFeature を受け取り、全地物を一括確定
   */
  commitResolved(
    draftId: string,
    resolveResult: ResolveResult
  ): CommitResult {
    const draft = this.prepareUseCase.getDraft(draftId);
    if (!draft) {
      throw new CommitError(`ドラフト "${draftId}" が見つかりません`);
    }

    if (resolveResult.createdVertices && resolveResult.createdVertices.size > 0) {
      const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
      for (const [vertexId, vertex] of resolveResult.createdVertices) {
        vertices.set(vertexId, vertex);
      }
    }

    const result = this.applyAnchors(resolveResult.resolvedAnchorsByFeature);

    // ドラフトを破棄
    this.prepareUseCase.discardDraft(draftId);

    return result;
  }

  /**
   * 錨列を各地物に適用する
   */
  private applyAnchors(
    anchorsByFeature: ReadonlyMap<string, readonly FeatureAnchor[]>
  ): CommitResult {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const updatedFeatureIds: string[] = [];

    for (const [featureId, newAnchors] of anchorsByFeature) {
      const feature = features.get(featureId);
      if (!feature) continue;

      // 錨列が空 → 地物削除
      if (newAnchors.length === 0) {
        features.delete(featureId);
        eventBus.emit('feature:removed', { featureId });
      } else {
        features.set(featureId, feature.withAnchors(newAnchors));
      }
      updatedFeatureIds.push(featureId);
    }

    const historyEntryId = `history-${nextHistoryNum++}`;

    return {
      updatedFeatureIds,
      historyEntryId,
    };
  }
}

/** Commit エラー */
export class CommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitError';
  }
}
