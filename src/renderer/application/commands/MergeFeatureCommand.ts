/**
 * 地物結合コマンド（Undo対応）
 *
 * §2.3.3.2: 結合ツール — 複数の面情報をブーリアン和で結合。
 *
 * execute で結合対象の地物を1つに統合し、残りを削除する。
 * undo で元の形状に戻し、削除した地物を復元する。
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
import { mergePolygons } from '@domain/services/MergeService';
import { eventBus } from '../EventBus';

export interface MergeFeatureParams {
  /** 結合対象の地物ID群（最初のIDが結合後の地物として残る） */
  readonly featureIds: readonly string[];
  /** 現在時間 */
  readonly currentTime: TimePoint;
  /** 結合後の地物名（省略時は最初の地物の名前を使用） */
  readonly mergedName?: string;
}

export class MergeFeatureCommand implements UndoableCommand {
  readonly description: string;

  /** Undo用: 元の全地物の状態 */
  private originalFeatures: Map<string, Feature> = new Map();
  /** 結合で追加した頂点ID */
  private addedVertexIds: string[] = [];
  /** 削除した地物ID（最初の地物以外） */
  private removedFeatureIds: string[] = [];

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: MergeFeatureParams
  ) {
    this.description = `${params.featureIds.length}個の地物を結合`;
  }

  execute(): void {
    const { featureIds, currentTime, mergedName } = this.params;
    if (featureIds.length < 2) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices();

    // 元の地物状態を保存
    this.originalFeatures.clear();
    for (const fid of featureIds) {
      const f = features.get(fid);
      if (f) this.originalFeatures.set(fid, f);
    }

    // ポリゴンの座標を収集
    const polygonRingsList: RingCoords[][] = [];
    for (const fid of featureIds) {
      const feature = features.get(fid);
      if (!feature) return;
      const anchor = feature.getActiveAnchor(currentTime);
      if (!anchor || anchor.shape.type !== 'Polygon') return;

      const rings = anchor.shape.rings.map(ring =>
        ring.vertexIds.map(vid => {
          const v = vertices.get(vid);
          return v ? { x: v.x, y: v.y } : { x: 0, y: 0 };
        })
      );
      polygonRingsList.push(rings);
    }

    // 結合
    const result = mergePolygons(polygonRingsList);
    if (!result.success) return;

    const verticesBefore = new Set(vertices.keys());

    // 結合後の形状を生成
    const mergedShape = this.createPolygonShape(result.mergedRings);

    // 最初の地物を結合結果に更新
    const primaryId = featureIds[0];
    const primaryFeature = features.get(primaryId)!;
    const anchor = primaryFeature.getActiveAnchor(currentTime)!;

    const updatedAnchor = mergedName
      ? anchor.withShape(mergedShape).withProperty({ ...anchor.property, name: mergedName })
      : anchor.withShape(mergedShape);
    const newAnchors = primaryFeature.anchors.map(a => a.id === anchor.id ? updatedAnchor : a);
    features.set(primaryId, primaryFeature.withAnchors(newAnchors));

    // 残りの地物を削除
    this.removedFeatureIds = [];
    for (let i = 1; i < featureIds.length; i++) {
      features.delete(featureIds[i]);
      this.removedFeatureIds.push(featureIds[i]);
    }

    // 追加された頂点IDを記録
    this.addedVertexIds = [];
    for (const id of vertices.keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
      }
    }

    eventBus.emit('feature:added', { featureId: primaryId });
  }

  undo(): void {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;

    // 元の全地物を復元
    for (const [fid, feature] of this.originalFeatures) {
      features.set(fid, feature);
    }

    // 結合で追加された頂点を削除
    for (const vid of this.addedVertexIds) {
      vertices.delete(vid);
    }
  }

  private createPolygonShape(
    ringCoords: readonly RingCoords[]
  ): FeatureShape & { type: 'Polygon' } {
    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const rings: Ring[] = [];

    for (let i = 0; i < ringCoords.length; i++) {
      const coords = ringCoords[i];
      const vertexIds: string[] = [];

      for (const c of coords) {
        const id = `v-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const vertex = new Vertex(id, new Coordinate(c.x, c.y));
        mutableVertices.set(id, vertex);
        vertexIds.push(id);
      }

      const ringId = `ring-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ringType: 'territory' | 'hole' = i === 0 ? 'territory' : 'hole';
      rings.push(new Ring(ringId, vertexIds, ringType, i === 0 ? null : rings[0]?.id ?? null));
    }

    return { type: 'Polygon', rings };
  }
}
