/**
 * 地物編集ファサード ユースケース
 *
 * §5.3.0: EditFeatureUseCase — 地物の編集処理のファサード
 *
 * 頂点編集・共有頂点操作・リング編集・衝突判定を統合し、
 * 内部で歴史の錨の追加・変更・削除を行う。
 *
 * 各操作は既存のUseCaseとドメインサービスに委譲する。
 */

import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { FeatureAnchor, AnchorProperty, AnchorPlacement, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { TimeRange } from '@domain/value-objects/FeatureAnchor';
import type { Feature } from '@domain/entities/Feature';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { VertexEditUseCase } from './VertexEditUseCase';
import type { UpdateFeatureAnchorUseCase } from './UpdateFeatureAnchorUseCase';
import {
  findSnapCandidates,
  mergeVertices,
  unmergeVertex,
  moveSharedVertices,
  type SnapCandidate,
  type MergeResult,
  type UnmergeResult,
} from '@domain/services/SharedVertexService';
import {
  addHoleRing,
  addExclaveRing,
  deleteRing,
  validateRingPlacement,
  type AddRingResult,
  type DeleteRingResult,
  type RingValidationError,
} from '@domain/services/RingEditService';
import {
  detectConflictsForFeature,
  type SpatialConflict,
} from '@domain/services/ConflictDetectionService';
import type { RingCoords } from '@domain/services/GeometryService';

/**
 * 地物編集ファサード
 *
 * 既存のUseCaseとドメインサービスを統合して、
 * 地物に対する各種編集操作の一貫したインターフェースを提供する。
 */
export class EditFeatureUseCase {
  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly vertexEdit: VertexEditUseCase,
    private readonly anchorEdit: UpdateFeatureAnchorUseCase
  ) {}

  // ──────────────────────────────────────────
  // 地物・頂点アクセス
  // ──────────────────────────────────────────

  getFeatureById(id: string): Feature | undefined {
    return this.featureUseCase.getFeatureById(id);
  }

  getFeatures(): readonly Feature[] {
    return this.featureUseCase.getFeatures();
  }

  // ──────────────────────────────────────────
  // 頂点編集（VertexEditUseCase委譲）
  // ──────────────────────────────────────────

  moveVertex(vertexId: string, newCoordinate: Coordinate): void {
    this.vertexEdit.moveVertex(vertexId, newCoordinate);
  }

  insertVertexOnLine(
    featureId: string,
    currentTime: TimePoint,
    edgeIndex: number,
    coordinate: Coordinate
  ): string {
    return this.vertexEdit.insertVertexOnLine(featureId, currentTime, edgeIndex, coordinate);
  }

  insertVertexOnPolygon(
    featureId: string,
    currentTime: TimePoint,
    ringId: string,
    edgeIndex: number,
    coordinate: Coordinate
  ): string {
    return this.vertexEdit.insertVertexOnPolygon(featureId, currentTime, ringId, edgeIndex, coordinate);
  }

  deleteVertexFromLine(
    featureId: string,
    currentTime: TimePoint,
    vertexId: string
  ): boolean {
    return this.vertexEdit.deleteVertexFromLine(featureId, currentTime, vertexId);
  }

  deleteVertexFromPolygon(
    featureId: string,
    currentTime: TimePoint,
    ringId: string,
    vertexId: string
  ): boolean {
    return this.vertexEdit.deleteVertexFromPolygon(featureId, currentTime, ringId, vertexId);
  }

  // ──────────────────────────────────────────
  // 錨編集（UpdateFeatureAnchorUseCase委譲）
  // ──────────────────────────────────────────

  addAnchor(featureId: string, splitTime: TimePoint): FeatureAnchor {
    return this.anchorEdit.addAnchor(featureId, splitTime);
  }

  updateProperty(
    featureId: string,
    anchorId: string,
    property: AnchorProperty
  ): void {
    this.anchorEdit.updateProperty(featureId, anchorId, property);
  }

  updateTimeRange(
    featureId: string,
    anchorId: string,
    timeRange: TimeRange
  ): void {
    this.anchorEdit.updateTimeRange(featureId, anchorId, timeRange);
  }

  updateShape(
    featureId: string,
    anchorId: string,
    shape: FeatureShape
  ): void {
    this.anchorEdit.updateShape(featureId, anchorId, shape);
  }

  updatePlacement(
    featureId: string,
    anchorId: string,
    placement: AnchorPlacement
  ): void {
    this.anchorEdit.updatePlacement(featureId, anchorId, placement);
  }

  deleteAnchor(featureId: string, anchorId: string): boolean {
    return this.anchorEdit.deleteAnchor(featureId, anchorId);
  }

  getAnchors(featureId: string): readonly FeatureAnchor[] {
    return this.anchorEdit.getAnchors(featureId);
  }

  // ──────────────────────────────────────────
  // 共有頂点操作（SharedVertexService委譲）
  // ──────────────────────────────────────────

  findSnapCandidates(
    targetVertexId: string,
    snapDistance: number
  ): SnapCandidate[] {
    return findSnapCandidates(
      targetVertexId,
      this.featureUseCase.getVertices(),
      this.featureUseCase.getSharedVertexGroups(),
      snapDistance
    );
  }

  mergeVertices(vertexId: string, targetVertexId: string): MergeResult {
    return mergeVertices(
      vertexId,
      targetVertexId,
      this.featureUseCase.getVertices(),
      this.featureUseCase.getSharedVertexGroups()
    );
  }

  unmergeVertex(vertexId: string): UnmergeResult {
    return unmergeVertex(
      vertexId,
      this.featureUseCase.getVertices(),
      this.featureUseCase.getSharedVertexGroups()
    );
  }

  moveSharedVertices(
    vertexId: string,
    newCoordinate: Coordinate
  ): void {
    moveSharedVertices(
      vertexId,
      newCoordinate,
      this.featureUseCase.getVertices(),
      this.featureUseCase.getSharedVertexGroups()
    );
  }

  // ──────────────────────────────────────────
  // リング編集（RingEditService委譲）
  // ──────────────────────────────────────────

  addHoleRing(
    featureId: string,
    currentTime: TimePoint,
    parentRingId: string,
    vertexIds: string[]
  ): AddRingResult | null {
    const feature = this.getFeatureById(featureId);
    if (!feature) return null;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return null;

    const result = addHoleRing(anchor.shape.rings, parentRingId, vertexIds);
    if (result) {
      this.anchorEdit.updateShape(featureId, anchor.id, {
        type: 'Polygon',
        rings: result.rings,
      });
    }
    return result;
  }

  addExclaveRing(
    featureId: string,
    currentTime: TimePoint,
    vertexIds: string[]
  ): AddRingResult | null {
    const feature = this.getFeatureById(featureId);
    if (!feature) return null;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return null;

    const result = addExclaveRing(anchor.shape.rings, vertexIds);
    if (result) {
      this.anchorEdit.updateShape(featureId, anchor.id, {
        type: 'Polygon',
        rings: result.rings,
      });
    }
    return result;
  }

  deleteRing(
    featureId: string,
    currentTime: TimePoint,
    ringId: string
  ): DeleteRingResult | null {
    const feature = this.getFeatureById(featureId);
    if (!feature) return null;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return null;

    const result = deleteRing(anchor.shape.rings, ringId);
    if (result) {
      if (result.rings.length === 0) {
        // 全リング削除 → 地物削除
        this.anchorEdit.deleteAnchor(featureId, anchor.id);
      } else {
        this.anchorEdit.updateShape(featureId, anchor.id, {
          type: 'Polygon',
          rings: result.rings,
        });
      }
    }
    return result;
  }

  validateRingPlacement(
    featureId: string,
    currentTime: TimePoint,
    ringCoords: RingCoords,
    parentRingId: string | null
  ): RingValidationError[] {
    const feature = this.getFeatureById(featureId);
    if (!feature) return [{ type: 'not_contained', ringId: '', message: '地物が見つかりません' }];

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') {
      return [{ type: 'not_contained', ringId: '', message: 'ポリゴンではありません' }];
    }

    const vertices = this.featureUseCase.getVertices();
    const existingRingCoords = anchor.shape.rings.map(ring =>
      ring.vertexIds
        .map(vid => {
          const v = vertices.get(vid);
          return v ? { x: v.coordinate.x, y: v.coordinate.y } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null)
    );

    return validateRingPlacement(existingRingCoords, ringCoords, parentRingId, anchor.shape.rings);
  }

  // ──────────────────────────────────────────
  // 衝突判定（ConflictDetectionService委譲）
  // ──────────────────────────────────────────

  detectConflictsForFeature(
    featureId: string,
    currentTime: TimePoint,
    layerId: string
  ): SpatialConflict[] {
    const feature = this.getFeatureById(featureId);
    if (!feature) return [];

    const vertices = this.featureUseCase.getVertices();
    return detectConflictsForFeature(
      feature,
      this.featureUseCase.getFeatures(),
      vertices,
      currentTime,
      layerId
    );
  }
}
