/**
 * 錨編集競合解決ユースケース
 *
 * §5.3.1: ResolveFeatureAnchorConflictsUseCase
 *
 * 競合一覧に対してユーザーの解決方針を受け取り、
 * ブーリアン差分演算で非優先地物の形状を調整する。
 */

import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Vertex } from '@domain/entities/Vertex';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { PrepareFeatureAnchorEditUseCase } from './PrepareFeatureAnchorEditUseCase';
import {
  findOverlappingLongitudeShift,
  polygonDifference,
  shiftRingCoords,
} from '@domain/services/BooleanOperationService';
import type { RingCoords } from '@domain/services/GeometryService';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
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
    const workingVertices = new Map(this.featureUseCase.getVertices());
    const createdVertices = new Map<string, Vertex>();

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
      const nonPreferredId = preferredId === conflict.featureIdA
        ? conflict.featureIdB
        : conflict.featureIdA;

      const preferredAnchors = this.getResolvedAnchors(preferredId, draft, resolvedMap);
      const nonPreferredAnchors = this.getResolvedAnchors(nonPreferredId, draft, resolvedMap);
      if (!preferredAnchors || !nonPreferredAnchors) {
        continue;
      }

      // 優先地物の形状を取得
      const preferredAnchor = preferredAnchors.find((anchor) => anchor.isActiveAt(draft.editTime));

      if (!preferredAnchor || preferredAnchor.shape.type !== 'Polygon') continue;

      // 非優先地物の形状を差分演算
      const updatedAnchors = nonPreferredAnchors.map(anchor => {
        if (!anchor.isActiveAt(draft.editTime)) return anchor;
        if (anchor.shape.type !== 'Polygon') return anchor;

        // 差分: 非優先 - 優先
        const nonPrefRings = this.resolveRings(anchor, workingVertices);
        const prefRings = this.resolveRings(preferredAnchor, workingVertices);

        if (nonPrefRings.length === 0 || prefRings.length === 0) return anchor;

        const preferredShift = findOverlappingLongitudeShift(nonPrefRings, prefRings);
        if (preferredShift === null) {
          return anchor;
        }

        const diff = polygonDifference(
          nonPrefRings,
          shiftRingCoords(prefRings, preferredShift)
        );

        if (diff.isEmpty) {
          // 差分結果が空 → 錨を無効化（存在期間打切り）
          return anchor.withTimeRange({
            start: anchor.timeRange.start,
            end: draft.editTime,
          });
        }

        const nextShape = this.createResolvedPolygonShape(
          diff.polygons,
          workingVertices,
          createdVertices,
          draft.draftId,
          nonPreferredId
        );
        if (nextShape.rings.length === 0) {
          return anchor.withTimeRange({
            start: anchor.timeRange.start,
            end: draft.editTime,
          });
        }

        return anchor.withShape(nextShape);
      });

      resolvedMap.set(nonPreferredId, updatedAnchors);
    }

    return {
      resolvedAnchorsByFeature: resolvedMap,
      createdVertices,
    };
  }

  private getResolvedAnchors(
    featureId: string,
    draft: AnchorEditDraft,
    resolvedMap: ReadonlyMap<string, readonly FeatureAnchor[]>
  ): FeatureAnchor[] | undefined {
    const resolvedAnchors = resolvedMap.get(featureId);
    if (resolvedAnchors) {
      return [...resolvedAnchors];
    }
    if (featureId === draft.featureId) {
      return [...draft.candidateAnchors];
    }

    const feature = this.featureUseCase.getFeatureById(featureId);
    return feature ? [...feature.anchors] : undefined;
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

  private createResolvedPolygonShape(
    polygons: readonly RingCoords[][],
    vertices: Map<string, Vertex>,
    createdVertices: Map<string, Vertex>,
    draftId: string,
    featureId: string
  ): FeatureShape & { type: 'Polygon' } {
    const rings: Ring[] = [];

    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
      const polygon = polygons[polygonIndex];
      if (polygon.length === 0 || polygon[0].length < 3) {
        continue;
      }

      const territoryRing = this.createResolvedRing(
        polygon[0],
        'territory',
        null,
        polygonIndex,
        0,
        vertices,
        createdVertices,
        draftId,
        featureId
      );
      rings.push(territoryRing);

      for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
        if (polygon[ringIndex].length < 3) {
          continue;
        }
        rings.push(
          this.createResolvedRing(
            polygon[ringIndex],
            'hole',
            territoryRing.id,
            polygonIndex,
            ringIndex,
            vertices,
            createdVertices,
            draftId,
            featureId
          )
        );
      }
    }

    return {
      type: 'Polygon',
      rings,
    };
  }

  private createResolvedRing(
    ringCoords: RingCoords,
    ringType: 'territory' | 'hole',
    parentId: string | null,
    polygonIndex: number,
    ringIndex: number,
    vertices: Map<string, Vertex>,
    createdVertices: Map<string, Vertex>,
    draftId: string,
    featureId: string
  ): Ring {
    const vertexIds = ringCoords.map((coord, vertexIndex) =>
      this.createResolvedVertex(
        coord,
        vertices,
        createdVertices,
        draftId,
        featureId,
        polygonIndex,
        ringIndex,
        vertexIndex
      )
    );
    const ringId = this.createResolvedId('ring', draftId, featureId, polygonIndex, ringIndex);
    return new Ring(ringId, vertexIds, ringType, parentId);
  }

  private createResolvedVertex(
    coord: { x: number; y: number },
    vertices: Map<string, Vertex>,
    createdVertices: Map<string, Vertex>,
    draftId: string,
    featureId: string,
    polygonIndex: number,
    ringIndex: number,
    vertexIndex: number
  ): string {
    const vertexId = this.createResolvedId(
      'v',
      draftId,
      featureId,
      polygonIndex,
      ringIndex,
      vertexIndex
    );
    const vertex = new Vertex(vertexId, new Coordinate(coord.x, coord.y).clampLatitude());
    vertices.set(vertexId, vertex);
    createdVertices.set(vertexId, vertex);
    return vertexId;
  }

  private createResolvedId(prefix: string, ...parts: readonly (string | number)[]): string {
    return [
      `${prefix}-resolve`,
      ...parts.map((part) => String(part)),
    ].join('-');
  }
}

/** Resolve エラー */
export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveError';
  }
}
