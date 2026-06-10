/**
 * 地物追加コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 地物の追加
 *
 * execute で地物を追加し、undo で追加した地物と頂点を除去する。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import { eventBus } from '../EventBus';
import type { UndoableCommand } from '../UndoRedoManager';
import { ReassignFeatureParentUseCase } from '../ReassignFeatureParentUseCase';
import {
  createTransientPolygonFeature,
  validatePolygonOrThrow,
} from '../polygonValidation';

/** 追加する地物の種類とパラメータ */
export type AddFeatureParams =
  | { type: 'point'; coord: Coordinate; time: TimePoint; name?: string }
  | { type: 'line'; coords: readonly Coordinate[]; time: TimePoint; name?: string }
  | {
      type: 'polygon';
      coords: readonly Coordinate[];
      time: TimePoint;
      name?: string;
      style?: PolygonStyle;
      parentId?: string | null;
    };

export class AddFeatureCommand implements UndoableCommand {
  readonly description: string;
  private readonly parentTransferUseCase: ReassignFeatureParentUseCase;
  private addedFeature: Feature | null = null;
  private addedVertexIds: string[] = [];
  private addedVertices = new Map<string, Vertex>();
  private modifiedFeaturesBeforeParentAssignment = new Map<string, Feature>();
  private modifiedFeaturesAfterParentAssignment = new Map<string, Feature>();
  /**
   * 親割り当て（所属変更）の過程で新規生成された地物（リーフ親が集約地物化したときの直轄領など。
   * 要件定義書 §2.1 line 226-229）。undo で削除し redo で復元する。新規頂点は addedVertices に集約する。
   */
  private createdFeaturesDuringAssign = new Map<string, Feature>();

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: AddFeatureParams,
    parentTransferUseCase: ReassignFeatureParentUseCase
  ) {
    this.parentTransferUseCase = parentTransferUseCase;
    const typeLabel =
      params.type === 'point' ? '点' :
      params.type === 'line' ? '線' : '面';
    this.description = `${typeLabel}情報を追加`;
  }

  execute(): void {
    if (this.addedFeature) {
      this.restoreAddedFeature();
      return;
    }

    // 追加前の頂点IDを記録
    const verticesBefore = new Set(this.featureUseCase.getVertices().keys());

    if (this.params.type === 'polygon') {
      const transient = createTransientPolygonFeature(
        this.params.coords,
        this.params.time,
        'pending-add',
        'pending-add-ring',
        'pending-add-v'
      );
      const validationVertices = new Map(this.featureUseCase.getVertices());
      for (const [vertexId, vertex] of transient.vertices) {
        validationVertices.set(vertexId, vertex);
      }
      // 親指定時は親自身を末端排他の障害物から除外する（要件定義書 §2.1 line 225-227 / 開発ガイド §6.6.8）。
      // 親リーフ内部に子を描く正当なケースでは、親はこの後 `assignParent`（所属変更）で集約地物へ遷移し
      // 自身の領域が下位領域へ細分化される（差分は直轄領で補填）ため、親を「他の末端地物」として
      // 重複扱いしてはならない。親以外の末端地物との重なり（親外へのはみ出し）は引き続き拒否する。
      // 設計上の緩さ（既知・許容）: 親除外により、子が親をまたいで無主地へはみ出すケースも
      // 兄弟末端と重ならなければ受理され、親の実効領域が旧形状より拡大し得る。不変条件（集約地物の
      // 領域 = 子の和 / 末端排他）は破れないため害はない。「子は親に内包されるべき」の強制は追加モードの
      // リアルタイム配置ブロック（§2.1 line 159, 現状未実装）側の責務であり、Phase 4-4b-2 / 配置ブロック
      // 実装時に内包強制の要否を判断する。
      const obstacleFeatures = this.params.parentId
        ? this.featureUseCase.getFeatures().filter((feature) => feature.id !== this.params.parentId)
        : this.featureUseCase.getFeatures();
      validatePolygonOrThrow(
        transient.feature,
        obstacleFeatures,
        validationVertices,
        this.params.time
      );
      if (this.params.parentId) {
        this.parentTransferUseCase.assertCanAssignNewFeatureToParent(
          this.params.parentId,
          this.params.time
        );
      }
    }

    let feature: Feature;
    switch (this.params.type) {
      case 'point':
        feature = this.featureUseCase.addPoint(
          this.params.coord, this.params.time, this.params.name
        );
        break;
      case 'line':
        feature = this.featureUseCase.addLine(
          this.params.coords, this.params.time, this.params.name
        );
        break;
      case 'polygon':
        feature = this.featureUseCase.addPolygon(
          this.params.coords, this.params.time, this.params.name, this.params.style
        );
        break;
    }

    this.addedFeature = feature;

    // 新しく追加された頂点IDを特定
    this.addedVertexIds = [];
    this.addedVertices.clear();
    for (const id of this.featureUseCase.getVertices().keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
        const vertex = this.featureUseCase.getVertices().get(id);
        if (vertex) {
          this.addedVertices.set(id, vertex);
        }
      }
    }

    if (this.params.type === 'polygon' && this.params.parentId) {
      try {
        this.assignParent(feature.id, this.params.parentId);
      } catch (error) {
        this.removeAddedFeature();
        this.addedFeature = null;
        this.addedVertexIds = [];
        this.addedVertices.clear();
        throw error;
      }
    }
  }

  undo(): void {
    if (!this.addedFeature) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;

    features.delete(this.addedFeature.id);
    for (const createdId of this.createdFeaturesDuringAssign.keys()) {
      features.delete(createdId);
    }
    for (const vid of this.addedVertexIds) {
      vertices.delete(vid);
    }
    for (const [featureId, feature] of this.modifiedFeaturesBeforeParentAssignment) {
      features.set(featureId, feature);
    }

    // Map 直接復元でも初回 execute と同じイベント規約（存在 = feature:added / 削除 = feature:removed）で
    // 全変更地物へ通知する（開発ガイド §6.4.16）。eventBus 購読の派生 consumer は明示 refresh を持たない。
    eventBus.emit('feature:removed', { featureId: this.addedFeature.id });
    for (const createdId of this.createdFeaturesDuringAssign.keys()) {
      eventBus.emit('feature:removed', { featureId: createdId });
    }
    for (const featureId of this.modifiedFeaturesBeforeParentAssignment.keys()) {
      eventBus.emit('feature:added', { featureId });
    }
  }

  private restoreAddedFeature(): void {
    if (!this.addedFeature) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    for (const [vertexId, vertex] of this.addedVertices) {
      vertices.set(vertexId, vertex);
    }
    features.set(this.addedFeature.id, this.addedFeature);
    for (const [createdId, feature] of this.createdFeaturesDuringAssign) {
      features.set(createdId, feature);
    }
    for (const [featureId, feature] of this.modifiedFeaturesAfterParentAssignment) {
      features.set(featureId, feature);
    }
    eventBus.emit('feature:added', { featureId: this.addedFeature.id });
    for (const createdId of this.createdFeaturesDuringAssign.keys()) {
      eventBus.emit('feature:added', { featureId: createdId });
    }
    for (const featureId of this.modifiedFeaturesAfterParentAssignment.keys()) {
      eventBus.emit('feature:added', { featureId });
    }
  }

  private assignParent(featureId: string, parentId: string): void {
    const featuresBefore = new Map(this.featureUseCase.getFeaturesMap());
    const verticesBeforeAssign = new Set(this.featureUseCase.getVertices().keys());
    this.parentTransferUseCase.reassignFeatureParent({
      featureIds: [featureId],
      newParentId: parentId,
      effectiveTime: this.params.time,
      transferType: 'cede',
    });
    const featuresAfter = this.featureUseCase.getFeaturesMap();

    this.modifiedFeaturesBeforeParentAssignment.clear();
    this.modifiedFeaturesAfterParentAssignment.clear();
    this.createdFeaturesDuringAssign.clear();
    // featuresAfter を走査して created（直轄領など）/ modified（リーフ親→集約遷移）を分類する。
    // この経路（新規地物への親割当）は旧親を持たないため地物削除は発生しない。
    for (const [changedFeatureId, after] of featuresAfter) {
      const before = featuresBefore.get(changedFeatureId);
      if (before === after) continue;

      if (changedFeatureId === featureId) {
        this.addedFeature = after;
      } else if (before === undefined) {
        this.createdFeaturesDuringAssign.set(changedFeatureId, after);
      } else {
        this.modifiedFeaturesBeforeParentAssignment.set(changedFeatureId, before);
        this.modifiedFeaturesAfterParentAssignment.set(changedFeatureId, after);
      }
    }

    // 所属変更で新規生成された頂点（直轄領の頂点）を addedVertices に集約し、
    // undo での頂点削除・redo での復元対象に含める。
    for (const vertexId of this.featureUseCase.getVertices().keys()) {
      if (verticesBeforeAssign.has(vertexId)) continue;
      if (this.addedVertices.has(vertexId)) continue;
      const vertex = this.featureUseCase.getVertices().get(vertexId);
      if (vertex) {
        this.addedVertexIds.push(vertexId);
        this.addedVertices.set(vertexId, vertex);
      }
    }
  }

  private removeAddedFeature(): void {
    if (!this.addedFeature) return;
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const removed = features.delete(this.addedFeature.id);
    for (const vertexId of this.addedVertexIds) {
      vertices.delete(vertexId);
    }
    if (removed) {
      eventBus.emit('feature:removed', { featureId: this.addedFeature.id });
    }
  }
}
