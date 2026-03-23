/**
 * 錨編集競合解決ユースケース
 *
 * §5.3.1: ResolveFeatureAnchorConflictsUseCase
 *
 * 競合一覧に対してユーザーの解決方針を受け取り、
 * ブーリアン差分演算で非優先地物の形状を調整する。
 */

import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { PrepareFeatureAnchorEditUseCase } from './PrepareFeatureAnchorEditUseCase';
import {
  polygonDifference,
  fromClipPolygon,
  toClipPolygon,
} from '@domain/services/BooleanOperationService';
import type { RingCoords } from '@domain/services/GeometryService';
import { Ring } from '@domain/value-objects/Ring';
import type {
  ConflictResolution,
  ResolveResult,
  AnchorEditDraft,
} from './AnchorEditDraft';

/**
 * 競合解決ユースケース
 */
export class ResolveFeatureAnchorConflictsUseCase {
  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly prepareUseCase: PrepareFeatureAnchorEditUseCase
  ) {}

  /**
   * 競合を解決する
   *
   * §5.3.1:
   * - 優先地物の形状を維持
   * - 非優先地物の同時刻有効錨へ差分演算（非優先 - 優先）を適用
   * - すべての競合に方針が与えられるまで Commit を拒否
   */
  resolve(
    draftId: string,
    resolutions: readonly ConflictResolution[]
  ): ResolveResult {
    const draft = this.prepareUseCase.getDraft(draftId);
    if (!draft) {
      throw new ResolveError(`ドラフト "${draftId}" が見つかりません`);
    }

    if (draft.status !== 'requires_resolution') {
      throw new ResolveError('このドラフトは競合解決を必要としません');
    }

    // すべての競合に方針が与えられているか検証
    if (resolutions.length < draft.conflicts.length) {
      throw new ResolveError(
        `すべての競合に方針を指定してください（${resolutions.length}/${draft.conflicts.length}）`
      );
    }

    const resolvedMap = new Map<string, FeatureAnchor[]>();
    const vertices = this.featureUseCase.getVertices();

    // 編集対象地物の候補錨はそのまま
    resolvedMap.set(draft.featureId, [...draft.candidateAnchors]);

    // 各競合を解決
    for (let i = 0; i < draft.conflicts.length; i++) {
      const conflict = draft.conflicts[i];
      const resolution = resolutions.find(r => r.conflictIndex === i);
      if (!resolution) {
        throw new ResolveError(`競合 ${i} に方針が指定されていません`);
      }

      const preferredId = resolution.preferFeatureId;
      const nonPreferredId = preferredId === conflict.featureA.id
        ? conflict.featureB.id
        : conflict.featureA.id;

      // 非優先地物の錨を取得
      const nonPreferred = this.featureUseCase.getFeatureById(nonPreferredId);
      if (!nonPreferred) continue;

      const preferredFeature = this.featureUseCase.getFeatureById(preferredId)
        ?? (preferredId === draft.featureId
          ? { anchors: draft.candidateAnchors, getActiveAnchor: (t: TimePoint) => draft.candidateAnchors.find(a => a.isActiveAt(t)) }
          : undefined);
      if (!preferredFeature) continue;

      // 優先地物の形状を取得
      const preferredAnchor = preferredFeature.getActiveAnchor
        ? (preferredFeature as Feature).getActiveAnchor(draft.editTime)
        : undefined;

      if (!preferredAnchor || preferredAnchor.shape.type !== 'Polygon') continue;

      // 非優先地物の形状を差分演算
      const nonPreferredAnchors = resolvedMap.get(nonPreferredId)
        ?? [...nonPreferred.anchors];

      const updatedAnchors = nonPreferredAnchors.map(anchor => {
        if (!anchor.isActiveAt(draft.editTime)) return anchor;
        if (anchor.shape.type !== 'Polygon') return anchor;

        // 差分: 非優先 - 優先
        const nonPrefRings = this.resolveRings(anchor, vertices);
        const prefRings = this.resolveRings(preferredAnchor, vertices);

        if (nonPrefRings.length === 0 || prefRings.length === 0) return anchor;

        const diff = polygonDifference(nonPrefRings, prefRings);

        if (diff.isEmpty) {
          // 差分結果が空 → 錨を無効化（存在期間打切り）
          return anchor.withTimeRange({
            start: anchor.timeRange.start,
            end: draft.editTime,
          });
        }

        // 差分結果を新しいリングとして適用
        // 最初のポリゴンのリング群を使用
        if (diff.polygons.length > 0) {
          const newRings = diff.polygons[0].map((ringCoords, idx) => {
            const existingRing = anchor.shape.type === 'Polygon' && idx < anchor.shape.rings.length
              ? anchor.shape.rings[idx]
              : null;
            return existingRing ?? new Ring(
              `resolved-ring-${idx}`,
              existingRing?.vertexIds ?? [],
              idx === 0 ? 'territory' : 'hole',
              idx === 0 ? null : `resolved-ring-0`
            );
          });

          return anchor.withShape({
            type: 'Polygon',
            rings: newRings,
          });
        }

        return anchor;
      });

      resolvedMap.set(nonPreferredId, updatedAnchors);
    }

    return {
      resolvedAnchorsByFeature: resolvedMap,
    };
  }

  /**
   * ポリゴン錨のリングを RingCoords に解決する
   */
  private resolveRings(
    anchor: FeatureAnchor,
    vertices: ReadonlyMap<string, Vertex>
  ): RingCoords[] {
    if (anchor.shape.type !== 'Polygon') return [];
    return anchor.shape.rings.map(ring =>
      ring.vertexIds
        .map(vid => {
          const v = vertices.get(vid);
          return v ? { x: v.coordinate.x, y: v.coordinate.y } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null)
    ).filter(r => r.length >= 3);
  }
}

/** Resolve エラー */
export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveError';
  }
}
