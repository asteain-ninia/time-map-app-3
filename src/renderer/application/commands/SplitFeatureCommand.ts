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

export class SplitFeatureCommand implements UndoableCommand {
  readonly description: string;

  private originalAnchors: Feature['anchors'] | null = null;
  private newFeatureId: string | null = null;
  private addedVertexIds: string[] = [];

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: SplitFeatureParams
  ) {
    this.description = `地物 ${params.featureId} を分割`;
  }

  execute(): void {
    const { featureId, cuttingLine, isClosed, currentTime, newFeatureName } = this.params;
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) return;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return;

    this.originalAnchors = [...feature.anchors];

    const vertices = this.featureUseCase.getVertices();
    const polygons = resolvePolygonShapePolygons(anchor.shape, vertices);

    const result = isClosed
      ? splitPolygonsByClosed(polygons, cuttingLine)
      : splitPolygonsByLine(polygons, cuttingLine);

    if (!result.success) return;

    const verticesBefore = new Set(vertices.keys());

    // pieceA → 元の地物を更新
    const pieceAShape = this.createPolygonShape(result.pieceAPolygons, 'a');
    const updatedAnchor = anchor.withShape(pieceAShape);
    const newAnchors = feature.anchors.map(a => a.id === anchor.id ? updatedAnchor : a);
    const updatedFeature = feature.withAnchors(newAnchors);
    (this.featureUseCase.getFeaturesMap() as Map<string, Feature>).set(featureId, updatedFeature);

    // pieceB → 新しい地物として追加
    const pieceBShape = this.createPolygonShape(result.pieceBPolygons, 'b');
    const newFeature = this.featureUseCase.addPolygonFromShape(
      pieceBShape,
      anchor.placement.layerId,
      currentTime,
      newFeatureName ?? `${anchor.property.name}(分割)`
    );
    this.newFeatureId = newFeature.id;

    // 追加された頂点IDを記録
    this.addedVertexIds = [];
    for (const id of vertices.keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
      }
    }

    eventBus.emit('feature:added', { featureId: newFeature.id });
  }

  undo(): void {
    if (!this.originalAnchors) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;

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
  }

  private createPolygonShape(
    polygons: readonly (readonly RingCoords[])[],
    suffix: string
  ): FeatureShape & { type: 'Polygon' } {
    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const rings: Ring[] = [];
    const drafts = buildPolygonRingDrafts(polygons, () => this.createSplitRingId(suffix));

    for (const draft of rebuildTerritoryHierarchy(drafts)) {
      const vertexIds: string[] = [];
      for (const c of draft.coords) {
        const id = this.createSplitVertexId(suffix);
        const vertex = new Vertex(id, new Coordinate(c.x, c.y));
        mutableVertices.set(id, vertex);
        vertexIds.push(id);
      }
      rings.push(new Ring(draft.id, vertexIds, draft.ringType, draft.parentId));
    }

    return { type: 'Polygon', rings };
  }

  private createSplitVertexId(suffix: string): string {
    return `v-split-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createSplitRingId(suffix: string): string {
    return `ring-split-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
