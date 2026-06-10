/**
 * 地物結合コマンド（Undo対応）
 *
 * §2.3.3.2: 結合ツール — 複数の面情報をブーリアン和で結合。
 *
 * execute で結合対象の地物を1つに統合し、残りを削除する。
 * セカンダリ地物の削除は「全時間軸からの消滅」であり、残存地物への参照掃除
 * （親の childIds 除去 / 子の parentId クリア / 空コンテナ錨の剪定）と
 * 頂点クリーンアップを伴うため、`DeleteFeatureUseCase` の共有削除経路を通す
 * （§6.4.17。素朴な `features.delete()` は親の childIds に dangling 参照を残し、
 * 保存→再ロードでロード時検証が拒否する「保存できるが開けないファイル」を作る）。
 *
 * 結合は「primary の形状更新 + セカンダリ削除 + 参照掃除」の複合変異のため、
 * 個別差分ではなく before/after の全マップスナップショットで undo / redo を復元する
 * （§6.3.5: 依存データも含めて過不足なく保存する。`DeleteFeatureCommand` /
 * `ReassignFeatureParentCommand` と同型）。redo は afterState 復元で
 * 結合形状の生成 ID（頂点・リング）を固定する（§6.4.12）。
 *
 * undo / redo の Map 直接復元でも、touch した全地物（primary・削除セカンダリ・
 * 参照掃除で変更された親）へ `feature:added` / `feature:removed` を対称に発火する（§6.4.16）。
 */

import type { UndoableCommand } from '../UndoRedoManager';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { DeleteFeatureUseCase } from '../DeleteFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
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

  private beforeState: MergeFeatureSnapshot | null = null;
  private afterState: MergeFeatureSnapshot | null = null;
  /** execute で touch した全地物ID（primary + 削除セカンダリ + 参照掃除で変更された地物） */
  private changedFeatureIds = new Set<string>();
  private initialized = false;

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly deleteUseCase: DeleteFeatureUseCase,
    private readonly params: MergeFeatureParams
  ) {
    this.description = `${params.featureIds.length}個の地物を結合`;
  }

  execute(): void {
    if (this.initialized) {
      // redo: afterState 復元（再実行ではなくスナップショットで生成 ID を固定。§6.4.12）
      this.restoreState(this.afterState);
      return;
    }

    const { featureIds, currentTime, mergedName } = this.params;
    const uniqueFeatureIds = [...new Set(featureIds)];
    if (uniqueFeatureIds.length < 2) {
      throw new Error('結合には2つ以上の面情報が必要です');
    }

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices();

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

    // 結合事前条件の検証（件数・上位下位関係・末端地物のみ・同一上位領域）。
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

    // ここまでは無変異（検証 throw で状態が変わらない）。変異開始前に before を確定する。
    this.beforeState = this.captureSnapshot();
    this.changedFeatureIds.clear();

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
    this.changedFeatureIds.add(primaryId);
    eventBus.emit('feature:added', { featureId: primaryId });

    // 残りの地物を共有削除経路で削除する（§6.4.17: 全錨からの参照掃除 + 空コンテナ剪定 +
    // 頂点クリーンアップ + touch した全地物への対称イベント発火を DeleteFeatureUseCase が担う）。
    // NOTE: 頂点クリーンアップの候補は削除地物（セカンダリ）の頂点のみ。結合形状は全頂点を
    // 新規生成するため、primary の旧形状頂点は未参照のまま残留する（ロード時検証の拒否対象外で
    // 実害はファイル肥大のみ。Phase 4-6 の結合再設計＝結果地物新規生成 + 元リーフ存在終了で
    // 経路ごと刷新される領域のため個別対応しない。現状.md の孤立頂点掃除 残作業と同種）。
    for (let i = 1; i < uniqueFeatureIds.length; i++) {
      const removal = this.deleteUseCase.deleteFeature(uniqueFeatureIds[i]);
      if (removal) {
        for (const id of removal.deletedFeatureIds) this.changedFeatureIds.add(id);
        for (const id of removal.modifiedFeatureIds) this.changedFeatureIds.add(id);
      }
    }

    this.afterState = this.captureSnapshot();
    this.initialized = true;
  }

  undo(): void {
    this.restoreState(this.beforeState);
  }

  private captureSnapshot(): MergeFeatureSnapshot {
    return {
      features: new Map(this.featureUseCase.getFeaturesMap()),
      vertices: new Map(this.featureUseCase.getVertices()),
      sharedGroups: new Map(this.featureUseCase.getSharedVertexGroups()),
    };
  }

  private restoreState(snapshot: MergeFeatureSnapshot | null): void {
    if (!snapshot) return;

    const currentFeatures = this.featureUseCase.getFeaturesMap();
    this.featureUseCase.restore(snapshot.features, snapshot.vertices, snapshot.sharedGroups);

    for (const featureId of this.changedFeatureIds) {
      const feature = snapshot.features.get(featureId);
      if (feature) {
        eventBus.emit('feature:added', { featureId });
      } else if (currentFeatures.has(featureId)) {
        eventBus.emit('feature:removed', { featureId });
      }
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

interface MergeFeatureSnapshot {
  readonly features: ReadonlyMap<string, Feature>;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
}
