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
import { mergePolygons, validateMergeFeatures } from '@domain/services/MergeService';
import {
  buildPolygonRingDrafts,
  rebuildTerritoryHierarchy,
  resolvePolygonShapePolygons,
} from '@domain/services/PolygonShapeService';
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
  private addedVertices = new Map<string, Vertex>();
  private mergedFeatureAfter: Feature | null = null;

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: MergeFeatureParams
  ) {
    this.description = `${params.featureIds.length}個の地物を結合`;
  }

  execute(): void {
    if (this.mergedFeatureAfter) {
      this.restoreAfter();
      return;
    }

    const { featureIds, currentTime, mergedName } = this.params;
    const uniqueFeatureIds = [...new Set(featureIds)];
    if (uniqueFeatureIds.length < 2) {
      throw new Error('結合には2つ以上の面情報が必要です');
    }

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices();

    // 元の地物状態を保存
    this.originalFeatures.clear();
    this.addedVertexIds = [];
    this.addedVertices.clear();
    this.removedFeatureIds = [];
    for (const fid of uniqueFeatureIds) {
      const f = features.get(fid);
      if (f) this.originalFeatures.set(fid, f);
    }

    // ポリゴンの座標を収集
    const polygonRingsList: RingCoords[][] = [];
    for (const fid of uniqueFeatureIds) {
      const feature = features.get(fid);
      if (!feature) {
        throw new Error(`結合対象の地物が見つかりません: ${fid}`);
      }
      const anchor = feature.getActiveAnchor(currentTime);
      if (!anchor || !anchor.shape || anchor.shape.type !== 'Polygon') {
        throw new Error('結合できるのは現在時刻で有効な面情報のみです');
      }

      polygonRingsList.push(...resolvePolygonShapePolygons(anchor.shape, vertices));
    }

    // 結合事前条件の検証（件数・上位下位関係・末端地物のみ）。
    // 選択時の addMergeTarget と同一サービスを共有して判定経路のドリフトを防ぐ（§6.6.1）。
    const validation = validateMergeFeatures(uniqueFeatureIds, [...features.values()], currentTime);
    if (!validation.valid) {
      throw new Error(validation.error ?? '結合対象が不正です');
    }

    // 結合
    const result = mergePolygons(polygonRingsList);
    if (!result.success) {
      throw new Error(result.error ?? '結合に失敗しました');
    }

    const verticesBefore = new Set(vertices.keys());

    // 結合後の形状を生成
    const mergedShape = this.createPolygonShape(result.mergedPolygons);

    // 最初の地物を結合結果に更新
    const primaryId = uniqueFeatureIds[0];
    const primaryFeature = features.get(primaryId)!;
    const anchor = primaryFeature.getActiveAnchor(currentTime)!;

    const updatedAnchor = mergedName
      ? anchor.withShape(mergedShape).withProperty({ ...anchor.property, name: mergedName })
      : anchor.withShape(mergedShape);
    const newAnchors = primaryFeature.anchors.map(a => a.id === anchor.id ? updatedAnchor : a);
    const mergedFeature = primaryFeature.withAnchors(newAnchors);
    features.set(primaryId, mergedFeature);
    this.mergedFeatureAfter = mergedFeature;

    // 残りの地物を削除
    for (let i = 1; i < uniqueFeatureIds.length; i++) {
      features.delete(uniqueFeatureIds[i]);
      this.removedFeatureIds.push(uniqueFeatureIds[i]);
    }

    // 追加された頂点IDを記録
    this.addedVertexIds = [];
    for (const id of vertices.keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
        const vertex = vertices.get(id);
        if (vertex) {
          this.addedVertices.set(id, vertex);
        }
      }
    }

    // 全変更地物へイベント規約（存在 = feature:added / 削除 = feature:removed）で通知する（開発ガイド §6.4.16）。
    eventBus.emit('feature:added', { featureId: primaryId });
    for (const featureId of this.removedFeatureIds) {
      eventBus.emit('feature:removed', { featureId });
    }
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

    // Map 直接復元でも初回 execute と同じイベント規約で全変更地物へ通知する（開発ガイド §6.4.16）。
    // セカンダリ地物の再追加・primary の形状復元はいずれも「存在」なので feature:added。
    for (const featureId of this.originalFeatures.keys()) {
      eventBus.emit('feature:added', { featureId });
    }
  }

  private restoreAfter(): void {
    if (!this.mergedFeatureAfter) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;

    for (const [vertexId, vertex] of this.addedVertices) {
      vertices.set(vertexId, vertex);
    }
    features.set(this.mergedFeatureAfter.id, this.mergedFeatureAfter);
    for (const featureId of this.removedFeatureIds) {
      features.delete(featureId);
    }

    eventBus.emit('feature:added', { featureId: this.mergedFeatureAfter.id });
    for (const featureId of this.removedFeatureIds) {
      eventBus.emit('feature:removed', { featureId });
    }
  }

  private createPolygonShape(
    polygons: readonly (readonly RingCoords[])[]
  ): FeatureShape & { type: 'Polygon' } {
    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const rings: Ring[] = [];
    const drafts = buildPolygonRingDrafts(polygons, () => this.createMergeRingId());

    for (const draft of rebuildTerritoryHierarchy(drafts)) {
      const vertexIds: string[] = [];
      for (const c of draft.coords) {
        const id = this.createMergeVertexId();
        const vertex = new Vertex(id, new Coordinate(c.x, c.y));
        mutableVertices.set(id, vertex);
        vertexIds.push(id);
      }
      rings.push(new Ring(draft.id, vertexIds, draft.ringType, draft.parentId));
    }

    return { type: 'Polygon', rings };
  }

  private createMergeVertexId(): string {
    return `v-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createMergeRingId(): string {
    return `ring-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

}
