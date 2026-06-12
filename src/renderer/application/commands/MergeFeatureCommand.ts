/**
 * 地物結合コマンド（Undo対応）
 *
 * §2.3.3.2: 結合ツール / 要件定義書 §2.1「合体（結合）機能」（末端地物のみのパターン）。
 *
 * 結合の変異本体は `ReassignFeatureParentUseCase.mergeLeafFeatures` が担う:
 * 元リーフの存在終了（effectiveTime での錨打ち切り）+ 結果末端地物の新規生成 +
 * 親 childIds の時刻同期・空区間剪定。所属変更と同じ staged エンジンを共有する
 * （§6.6.9 / §6.4.17: 同じ結果状態を生む経路は同じ実装を共有する）。
 *
 * 本コマンドは before/after の全マップスナップショットで undo / redo を復元する薄いシェル
 * （`ReassignFeatureParentCommand` と同型）。redo は afterState 復元で結合結果の生成 ID
 * （地物・錨・頂点・リング）を固定する（§6.4.12）。undo / redo の Map 直接復元でも
 * touch した全地物へ `feature:added` / `feature:removed` を対称に発火する
 * （§6.4.16。初回 execute のイベントは UseCase 側が発火する）。
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { ReassignFeatureParentUseCase } from '../ReassignFeatureParentUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import { eventBus } from '../EventBus';

export interface MergeFeatureParams {
  /** 結合対象の地物ID群（属性・所属の継承元は最初のID） */
  readonly featureIds: readonly string[];
  /** 現在時間（元リーフはこの時刻で存在終了し、結果地物が新規開始する） */
  readonly currentTime: TimePoint;
  /** 結合後の地物名（省略・空なら最初の地物の名前を継承） */
  readonly mergedName?: string;
}

export class MergeFeatureCommand implements UndoableCommand {
  readonly description: string;

  private beforeState: MergeFeatureSnapshot | null = null;
  private afterState: MergeFeatureSnapshot | null = null;
  private changedFeatureIds = new Set<string>();
  private initialized = false;
  private resultFeatureId: string | null = null;

  constructor(
    private readonly mergeUseCase: ReassignFeatureParentUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: MergeFeatureParams
  ) {
    this.description = `${params.featureIds.length}個の地物を結合`;
  }

  /**
   * 結合で新規生成された結果地物の ID（execute 前は null）。
   * 元リーフは存在終了して currentTime に非有効のため、UI の選択再構築は
   * 本 ID を使う（§6.6.3: 結合後は残る地物 ID を結果として返し、UI 選択を再構築する）。
   */
  get mergedFeatureId(): string | null {
    return this.resultFeatureId;
  }

  execute(): void {
    if (this.initialized) {
      // redo: afterState 復元（再実行ではなくスナップショットで生成 ID を固定。§6.4.12）
      this.restoreState(this.afterState);
      return;
    }

    // UseCase は staged 変異で atomic（検証 throw 時は無変異）のため、
    // throw が伝播してもこのコマンドは undo スタックに積まれず状態も変わらない。
    this.beforeState = this.captureSnapshot();

    const result = this.mergeUseCase.mergeLeafFeatures({
      featureIds: this.params.featureIds,
      effectiveTime: this.params.currentTime,
      mergedName: this.params.mergedName,
    });

    this.resultFeatureId = result.mergedFeatureId;
    this.changedFeatureIds = new Set(result.changedFeatureIds);
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
}

interface MergeFeatureSnapshot {
  readonly features: ReadonlyMap<string, Feature>;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
}
