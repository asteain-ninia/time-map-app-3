/**
 * 地物削除コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 地物の削除
 *
 * execute で地物を削除し、undo で削除した地物と頂点を復元する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { DeleteFeatureUseCase, DeleteFeatureResult } from '../DeleteFeatureUseCase';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { eventBus } from '../EventBus';

export class DeleteFeatureCommand implements UndoableCommand {
  readonly description: string;

  /** 削除前のスナップショット（undo用） */
  private deletedFeatures: Feature[] = [];
  private deletedVertices: Vertex[] = [];
  private deletedSharedGroups: SharedVertexGroup[] = [];
  /** 変更された共有頂点グループの削除前状態 */
  private modifiedSharedGroups: SharedVertexGroup[] = [];
  private deleteResult: DeleteFeatureResult | null = null;

  constructor(
    private readonly deleteUseCase: DeleteFeatureUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly featureId: string,
    private readonly currentTime?: TimePoint
  ) {
    this.description = '地物を削除';
  }

  execute(): void {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    // 削除前にスナップショットを保存
    const targetFeature = features.get(this.featureId);
    if (!targetFeature) return;

    // 削除対象の地物（親の自動削除も含めて全て保存）
    this.deletedFeatures = [];
    this.deletedVertices = [];
    this.deletedSharedGroups = [];
    this.modifiedSharedGroups = [];

    // 削除前の全地物・頂点・共有グループの状態をキャプチャ
    const featuresBefore = new Map(features);
    const verticesBefore = new Map(vertices);
    const sharedGroupsBefore = new Map(sharedGroups);

    // UseCase経由で削除実行
    this.deleteResult = this.deleteUseCase.deleteFeature(this.featureId, this.currentTime);
    if (!this.deleteResult) return;

    // 削除された地物を復元データとして保存
    for (const fid of this.deleteResult.deletedFeatureIds) {
      const f = featuresBefore.get(fid);
      if (f) this.deletedFeatures.push(f);
    }

    // 削除された頂点を復元データとして保存
    for (const vid of this.deleteResult.deletedVertexIds) {
      const v = verticesBefore.get(vid);
      if (v) this.deletedVertices.push(v);
    }

    // 共有頂点グループの変更を検出して復元データとして保存
    for (const [gid, groupBefore] of sharedGroupsBefore) {
      const groupAfter = sharedGroups.get(gid);
      if (!groupAfter) {
        // グループが削除された
        this.deletedSharedGroups.push(groupBefore);
      } else if (groupBefore.vertexIds.length !== groupAfter.vertexIds.length) {
        // グループが変更された
        this.modifiedSharedGroups.push(groupBefore);
      }
    }
  }

  undo(): void {
    if (!this.deleteResult) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    // 頂点を復元
    for (const v of this.deletedVertices) {
      vertices.set(v.id, v);
    }

    // 共有頂点グループを復元
    for (const g of this.deletedSharedGroups) {
      sharedGroups.set(g.id, g);
    }
    for (const g of this.modifiedSharedGroups) {
      sharedGroups.set(g.id, g);
    }

    // 地物を復元
    for (const f of this.deletedFeatures) {
      features.set(f.id, f);
      eventBus.emit('feature:added', { featureId: f.id });
    }
  }
}
