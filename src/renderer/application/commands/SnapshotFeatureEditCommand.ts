/**
 * 地物編集スナップショットコマンド（Undo対応・汎用）
 *
 * features / vertices / sharedGroups Map を直接変異する単発の確定経路を Undo 履歴に乗せるための
 * 汎用コマンド。実行前後の全マップスナップショットを保持し、undo / redo で復元する。
 * §6.4.16 の基準実装（ReassignFeatureParentCommand.restoreState）と同型のイベント対称発火を行う。
 *
 * 用途: 専用 UseCase が features Map を直接 set する単発編集
 *   - 穴/飛び地リング追加の確定（App.svelte onConfirmRing, B35）
 *   - プロパティ編集の確定（App.svelte onPropertyChange → UpdateFeatureAnchorUseCase.updateProperty, B36）
 *
 * mutate は変異を実行し touch した地物 ID を返す。生成 ID（頂点 ID・リング ID 等）を含む変異でも、
 * redo は afterState スナップショット復元のみで mutate を再実行しないため、生成 ID は固定される（§6.4.12）。
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import { eventBus } from '../EventBus';

export interface SnapshotFeatureEditParams {
  readonly description: string;
  /**
   * 変異を実行し、touch した地物 ID 集合を返す。
   * この関数内で features / vertices / sharedGroups の各 Map を直接変異してよい。
   * 初回 execute 時の UI 反映イベント（feature:added / feature:removed）は mutate 内（または委譲先 UseCase）が
   * 発火する。本コマンドは undo / redo のスナップショット復元時のみ §6.4.16 のイベント対称発火を担う
   * （初回 execute の mutate 内 emit と undo/redo の restoreState emit で各経路の発火イベント集合が一致する）。
   *
   * 制約: emit は mutate の最終ステップ（throw しうる処理の後）に置くこと。emit 後に throw すると、
   * 購読側が変異後状態で refresh された後にロールバック復元が無通知で走り、UI が存在しない状態を
   * 表示し続ける（execute の catch 復元は changedFeatureIds 未確定のため再 emit しない）。
   */
  readonly mutate: () => Iterable<string>;
}

export class SnapshotFeatureEditCommand implements UndoableCommand {
  readonly description: string;
  private beforeState: FeatureEditSnapshot | null = null;
  private afterState: FeatureEditSnapshot | null = null;
  private changedFeatureIds = new Set<string>();
  private initialized = false;

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: SnapshotFeatureEditParams
  ) {
    this.description = params.description;
  }

  execute(): void {
    if (this.initialized) {
      // redo: mutate を再実行せず afterState を復元する（生成 ID 固定。§6.4.12）
      this.restoreState(this.afterState);
      return;
    }

    this.beforeState = this.captureSnapshot();
    try {
      this.changedFeatureIds = new Set(this.params.mutate());
    } catch (error) {
      // mutate が部分変異（頂点を Map へ追加した後にリング構築で throw 等）の途中で失敗しても、
      // beforeState へ復元して孤児頂点・中途半端な地物を残さない（§6.4.2 ロールバック）。
      // initialized=false のまま rethrow するため UndoRedoManager はコマンドを stack へ積まず、
      // changedFeatureIds は空のままなので復元時のイベント発火も無い（net 状態は execute 前と同一）。
      this.restoreState(this.beforeState);
      throw error;
    }
    this.afterState = this.captureSnapshot();
    this.initialized = true;
  }

  undo(): void {
    this.restoreState(this.beforeState);
  }

  private captureSnapshot(): FeatureEditSnapshot {
    return {
      features: new Map(this.featureUseCase.getFeaturesMap()),
      vertices: new Map(this.featureUseCase.getVertices()),
      sharedGroups: new Map(this.featureUseCase.getSharedVertexGroups()),
    };
  }

  private restoreState(snapshot: FeatureEditSnapshot | null): void {
    if (!snapshot) return;

    // restore は this.features を新しい Map で置換するため、currentFeatures（復元前の参照）は
    // 復元後も復元前の状態を保持する。これにより「復元前に存在 → 復元後に消滅」を検出できる。
    const currentFeatures = this.featureUseCase.getFeaturesMap();
    this.featureUseCase.restore(snapshot.features, snapshot.vertices, snapshot.sharedGroups);

    for (const featureId of this.changedFeatureIds) {
      if (snapshot.features.get(featureId)) {
        eventBus.emit('feature:added', { featureId });
      } else if (currentFeatures.has(featureId)) {
        eventBus.emit('feature:removed', { featureId });
      }
    }
  }
}

interface FeatureEditSnapshot {
  readonly features: ReadonlyMap<string, Feature>;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
}
