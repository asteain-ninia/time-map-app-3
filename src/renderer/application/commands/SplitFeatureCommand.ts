/**
 * 地物分割コマンド（Undo対応）
 *
 * §2.3.3.2: ナイフツール — 面情報の分割。
 *
 * execute で元の地物の形状を pieceA に更新し、pieceB を新しい地物として追加する。
 * undo で元の形状に戻し、新しい地物を削除する。
 */

import type { UndoableCommand } from '../UndoRedoManager';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from '@domain/services/GeometryService';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { splitPolygonsByLine, splitPolygonsByClosed } from '@domain/services/KnifeService';
import {
  buildPolygonRingDrafts,
  rebuildTerritoryHierarchy,
  resolvePolygonShapePolygons,
} from '@domain/services/PolygonShapeService';
import { eventBus } from '../EventBus';

export interface SplitFeatureParams {
  /** 分割対象の地物ID */
  readonly featureId: string;
  /** 分断線の座標列 */
  readonly cuttingLine: readonly { x: number; y: number }[];
  /** 閉線分割かどうか */
  readonly isClosed: boolean;
  /** 現在時間 */
  readonly currentTime: TimePoint;
  /** pieceB（新地物）の名前 */
  readonly newFeatureName?: string;
}

type SplitPiece = 'a' | 'b';

interface SplitVertexRecord {
  readonly piece: SplitPiece;
  readonly ringId: string;
  readonly vertexId: string;
  readonly coordinate: Coordinate;
}

export class SplitFeatureCommand implements UndoableCommand {
  readonly description: string;

  private originalAnchors: Feature['anchors'] | null = null;
  private originalSharedGroups = new Map<string, SharedVertexGroup>();
  private newFeatureId: string | null = null;
  private addedVertexIds: string[] = [];
  private addedVertices = new Map<string, Vertex>();
  private splitVertexRecords: SplitVertexRecord[] = [];
  private updatedFeatureAfter: Feature | null = null;
  private newFeatureAfter: Feature | null = null;
  private sharedGroupsAfter: Map<string, SharedVertexGroup> | null = null;

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: SplitFeatureParams
  ) {
    this.description = `地物 ${params.featureId} を分割`;
  }

  get createdFeatureId(): string | null {
    return this.newFeatureId;
  }

  execute(): void {
    if (this.updatedFeatureAfter && this.newFeatureAfter && this.sharedGroupsAfter) {
      this.restoreAfter();
      return;
    }

    const { featureId, cuttingLine, isClosed, currentTime, newFeatureName } = this.params;
    this.originalAnchors = null;
    this.originalSharedGroups = new Map();
    this.newFeatureId = null;
    this.addedVertexIds = [];
    this.addedVertices.clear();
    this.splitVertexRecords = [];
    this.updatedFeatureAfter = null;
    this.newFeatureAfter = null;
    this.sharedGroupsAfter = null;

    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) return;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return;

    const vertices = this.featureUseCase.getVertices();
    const polygons = resolvePolygonShapePolygons(anchor.shape, vertices);

    const result = isClosed
      ? splitPolygonsByClosed(polygons, cuttingLine)
      : splitPolygonsByLine(polygons, cuttingLine);

    if (!result.success) return;

    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    this.originalAnchors = [...feature.anchors];
    this.originalSharedGroups = new Map(sharedGroups);

    const verticesBefore = new Set(vertices.keys());

    // pieceA → 元の地物を更新
    const pieceAShape = this.createPolygonShape(result.pieceAPolygons, 'a');
    const updatedAnchor = anchor.withShape(pieceAShape);
    const newAnchors = feature.anchors.map(a => a.id === anchor.id ? updatedAnchor : a);
    const updatedFeature = feature.withAnchors(newAnchors);
    (this.featureUseCase.getFeaturesMap() as Map<string, Feature>).set(featureId, updatedFeature);
    this.updatedFeatureAfter = updatedFeature;

    // pieceB → 新しい地物として追加
    const pieceBShape = this.createPolygonShape(result.pieceBPolygons, 'b');
    const newFeature = this.featureUseCase.addPolygonFromShape(
      pieceBShape,
      anchor.placement.layerId,
      currentTime,
      newFeatureName ?? `${anchor.property.name}(分割)`
    );
    this.newFeatureId = newFeature.id;
    this.newFeatureAfter = newFeature;

    // 追加された頂点IDを記録
    this.addedVertexIds = [];
    for (const id of vertices.keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
      }
    }

    this.createSplitSharedGroups(sharedGroups);
    for (const id of this.addedVertexIds) {
      const vertex = vertices.get(id);
      if (vertex) {
        this.addedVertices.set(id, vertex);
      }
    }
    this.sharedGroupsAfter = new Map(sharedGroups);

    eventBus.emit('feature:added', { featureId: newFeature.id });
  }

  undo(): void {
    if (!this.originalAnchors) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    // 元の地物を復元
    const feature = features.get(this.params.featureId);
    if (feature) {
      const restoredFeature = feature.withAnchors(this.originalAnchors);
      features.set(this.params.featureId, restoredFeature);
    }

    // 新しい地物を削除
    if (this.newFeatureId) {
      features.delete(this.newFeatureId);
    }

    // 分割で追加された頂点を削除
    for (const vid of this.addedVertexIds) {
      vertices.delete(vid);
    }

    sharedGroups.clear();
    for (const [groupId, group] of this.originalSharedGroups) {
      sharedGroups.set(groupId, group);
    }
  }

  private restoreAfter(): void {
    if (!this.updatedFeatureAfter || !this.newFeatureAfter || !this.sharedGroupsAfter) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    for (const [vertexId, vertex] of this.addedVertices) {
      vertices.set(vertexId, vertex);
    }
    features.set(this.updatedFeatureAfter.id, this.updatedFeatureAfter);
    features.set(this.newFeatureAfter.id, this.newFeatureAfter);

    sharedGroups.clear();
    for (const [groupId, group] of this.sharedGroupsAfter) {
      sharedGroups.set(groupId, group);
    }

    eventBus.emit('feature:added', { featureId: this.newFeatureAfter.id });
  }

  private createPolygonShape(
    polygons: readonly (readonly RingCoords[])[],
    suffix: SplitPiece
  ): FeatureShape & { type: 'Polygon' } {
    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const rings: Ring[] = [];
    const drafts = buildPolygonRingDrafts(polygons, () => this.createSplitRingId(suffix));

    for (const draft of rebuildTerritoryHierarchy(drafts)) {
      const vertexIds: string[] = [];
      for (const c of draft.coords) {
        const id = this.createSplitVertexId(suffix);
        const coordinate = new Coordinate(c.x, c.y);
        const vertex = new Vertex(id, coordinate);
        mutableVertices.set(id, vertex);
        vertexIds.push(id);
        this.splitVertexRecords.push({
          piece: suffix,
          ringId: draft.id,
          vertexId: id,
          coordinate,
        });
      }
      rings.push(new Ring(draft.id, vertexIds, draft.ringType, draft.parentId));
    }

    return { type: 'Polygon', rings };
  }

  private createSplitSharedGroups(sharedGroups: Map<string, SharedVertexGroup>): void {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const recordsByCoordinate = new Map<string, SplitVertexRecord[]>();

    for (const record of this.splitVertexRecords) {
      const key = this.createCoordinateKey(record.coordinate);
      recordsByCoordinate.set(key, [...(recordsByCoordinate.get(key) ?? []), record]);
    }

    for (const records of recordsByCoordinate.values()) {
      const recordsByRing = new Map<string, SplitVertexRecord>();
      for (const record of records) {
        const componentKey = `${record.piece}:${record.ringId}`;
        if (!recordsByRing.has(componentKey)) {
          recordsByRing.set(componentKey, record);
        }
      }

      const sharedRecords = [...recordsByRing.values()];
      const sharedPieces = new Set(sharedRecords.map((record) => record.piece));
      if (!sharedPieces.has('a') || !sharedPieces.has('b')) continue;

      const representativeRecord = sharedRecords[0];
      if (!representativeRecord) continue;

      const representativeCoordinate = representativeRecord.coordinate;
      for (const record of sharedRecords) {
        const vertex = vertices.get(record.vertexId);
        if (vertex) {
          vertices.set(record.vertexId, vertex.withCoordinate(representativeCoordinate));
        }
      }

      const groupId = this.createSharedGroupId();
      sharedGroups.set(
        groupId,
        new SharedVertexGroup(groupId, sharedRecords.map((record) => record.vertexId), representativeCoordinate)
      );
    }
  }

  private createCoordinateKey(coordinate: Coordinate): string {
    return `${coordinate.x.toFixed(9)}:${coordinate.y.toFixed(9)}`;
  }

  private createSplitVertexId(suffix: SplitPiece): string {
    return `v-split-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createSplitRingId(suffix: SplitPiece): string {
    return `ring-split-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createSharedGroupId(): string {
    return `svg-split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
