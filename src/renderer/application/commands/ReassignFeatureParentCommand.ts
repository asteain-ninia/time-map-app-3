/**
 * 地物所属変更コマンド（Undo対応）
 *
 * 要件定義書 §2.1: 割譲と合邦機能（所属変更）
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { TransferType } from '@domain/services/MergeService';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type {
  CreateNewParentSpec,
  DirectlyGovernedOverrideSpec,
  ReassignFeatureParentUseCase,
} from '../ReassignFeatureParentUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import { eventBus } from '../EventBus';

export interface ReassignFeatureParentCommandParams {
  readonly featureIds: readonly string[];
  readonly newParentId: string | null;
  readonly effectiveTime: TimePoint;
  readonly transferType?: TransferType;
  /**
   * 指定時、新規上位領域（集約地物）を作成して対象地物を一括帰属させる。
   * `createNewParent.parentId` 未設定なら新規最上位コンテナ（連邦化）、非 null なら
   * 既存の上位領域に所属する新中間コンテナ（自治化）。
   * `createNewParent.ancestors` 指定時は最内のさらに上位へ多段コンテナを積み上げる（再帰積み上げ）。
   * 生成したコンテナチェーン全体の除去は beforeState スナップショット復元で自動的に取り消される
   * （多段コンテナを 1 アンドゥ単位として記録。要件定義書 §2.1 line 299）。
   */
  readonly createNewParent?: CreateNewParentSpec;
  /**
   * 末端地物 → 集約地物の遷移で自動生成される直轄領の名称・種別の上書き（要件定義書 §2.1 line 228）。
   * 直轄領の生成・破棄も beforeState スナップショット復元で 1 アンドゥ単位として取り消される。
   */
  readonly directlyGovernedOverride?: DirectlyGovernedOverrideSpec;
}

export class ReassignFeatureParentCommand implements UndoableCommand {
  readonly description: string;
  private beforeState: ParentTransferSnapshot | null = null;
  private afterState: ParentTransferSnapshot | null = null;
  private changedFeatureIds = new Set<string>();
  private initialized = false;

  constructor(
    private readonly transferUseCase: ReassignFeatureParentUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: ReassignFeatureParentCommandParams
  ) {
    this.description = params.createNewParent
      ? '新規上位領域を作成して所属変更'
      : params.transferType === 'annex'
        ? '下位領域を一括所属変更'
        : '地物の所属を変更';
  }

  execute(): void {
    if (this.initialized) {
      this.restoreState(this.afterState);
      return;
    }

    this.beforeState = this.captureSnapshot();

    const result = this.transferUseCase.reassignFeatureParent({
      featureIds: this.params.featureIds,
      newParentId: this.params.newParentId,
      effectiveTime: this.params.effectiveTime,
      transferType: this.params.transferType,
      createNewParent: this.params.createNewParent,
      directlyGovernedOverride: this.params.directlyGovernedOverride,
    });

    this.changedFeatureIds = new Set(result.changedFeatureIds);
    this.afterState = this.captureSnapshot();
    this.initialized = true;
  }

  undo(): void {
    this.restoreState(this.beforeState);
  }

  private captureSnapshot(): ParentTransferSnapshot {
    return {
      features: new Map(this.featureUseCase.getFeaturesMap()),
      vertices: new Map(this.featureUseCase.getVertices()),
      sharedGroups: new Map(this.featureUseCase.getSharedVertexGroups()),
    };
  }

  private restoreState(snapshot: ParentTransferSnapshot | null): void {
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

interface ParentTransferSnapshot {
  readonly features: ReadonlyMap<string, Feature>;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
}
