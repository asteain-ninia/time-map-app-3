/**
 * 地物削除コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 地物の削除
 *
 * execute で地物を削除し、undo で削除前の状態を復元する。
 *
 * 削除は「削除地物の消滅」だけでなく「残存地物の参照掃除（子の parentId クリア /
 * 親の childIds 除去 / 空コンテナ錨の剪定）+ 連鎖消滅 + 頂点クリーンアップ」を伴うため、
 * 個別差分ではなく before/after の全マップスナップショットで復元する
 * （§6.3.5: 依存データも含めて過不足なく保存する。`ReassignFeatureParentCommand` と同型）。
 * redo は afterState 復元で初回 execute と同一状態に戻す。
 *
 * undo / redo の Map 直接復元でも、touch した全地物（削除 + 参照掃除で変更）へ
 * `feature:added` / `feature:removed` を対称に発火する（§6.4.16）。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { DeleteFeatureUseCase } from '../DeleteFeatureUseCase';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import { eventBus } from '../EventBus';

export class DeleteFeatureCommand implements UndoableCommand {
  readonly description: string;

  private beforeState: DeleteFeatureSnapshot | null = null;
  private afterState: DeleteFeatureSnapshot | null = null;
  private changedFeatureIds = new Set<string>();
  private initialized = false;

  constructor(
    private readonly deleteUseCase: DeleteFeatureUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly featureId: string
  ) {
    this.description = '地物を削除';
  }

  execute(): void {
    if (this.initialized) {
      // redo: afterState 復元（UseCase 再実行ではなくスナップショットで状態を固定。§6.4.12）
      this.restoreState(this.afterState);
      return;
    }

    this.beforeState = this.captureSnapshot();

    const result = this.deleteUseCase.deleteFeature(this.featureId);
    if (result) {
      this.changedFeatureIds = new Set([
        ...result.deletedFeatureIds,
        ...result.modifiedFeatureIds,
      ]);
    }

    this.afterState = this.captureSnapshot();
    this.initialized = true;
  }

  undo(): void {
    this.restoreState(this.beforeState);
  }

  private captureSnapshot(): DeleteFeatureSnapshot {
    return {
      features: new Map(this.featureUseCase.getFeaturesMap()),
      vertices: new Map(this.featureUseCase.getVertices()),
      sharedGroups: new Map(this.featureUseCase.getSharedVertexGroups()),
    };
  }

  private restoreState(snapshot: DeleteFeatureSnapshot | null): void {
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
}

interface DeleteFeatureSnapshot {
  readonly features: ReadonlyMap<string, Feature>;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
}
