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
  | { type: 'point'; coord: Coordinate; layerId: string; time: TimePoint; name?: string }
  | { type: 'line'; coords: readonly Coordinate[]; layerId: string; time: TimePoint; name?: string }
  | {
      type: 'polygon';
      coords: readonly Coordinate[];
      layerId: string;
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
        this.params.layerId,
        this.params.time,
        'pending-add',
        'pending-add-ring',
        'pending-add-v'
      );
      const validationVertices = new Map(this.featureUseCase.getVertices());
      for (const [vertexId, vertex] of transient.vertices) {
        validationVertices.set(vertexId, vertex);
      }
      validatePolygonOrThrow(
        transient.feature,
        this.featureUseCase.getFeatures(),
        validationVertices,
        this.params.time,
        this.params.layerId
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
          this.params.coord, this.params.layerId, this.params.time, this.params.name
        );
        break;
      case 'line':
        feature = this.featureUseCase.addLine(
          this.params.coords, this.params.layerId, this.params.time, this.params.name
        );
        break;
      case 'polygon':
        feature = this.featureUseCase.addPolygon(
          this.params.coords, this.params.layerId, this.params.time, this.params.name, this.params.style
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
    for (const vid of this.addedVertexIds) {
      vertices.delete(vid);
    }
    for (const [featureId, feature] of this.modifiedFeaturesBeforeParentAssignment) {
      features.set(featureId, feature);
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
    for (const [featureId, feature] of this.modifiedFeaturesAfterParentAssignment) {
      features.set(featureId, feature);
    }
    eventBus.emit('feature:added', { featureId: this.addedFeature.id });
  }

  private assignParent(featureId: string, parentId: string): void {
    const featuresBefore = new Map(this.featureUseCase.getFeaturesMap());
    this.parentTransferUseCase.reassignFeatureParent({
      featureIds: [featureId],
      newParentId: parentId,
      effectiveTime: this.params.time,
      transferType: 'cede',
    });
    const featuresAfter = this.featureUseCase.getFeaturesMap();

    this.modifiedFeaturesBeforeParentAssignment.clear();
    this.modifiedFeaturesAfterParentAssignment.clear();
    for (const [changedFeatureId, before] of featuresBefore) {
      const after = featuresAfter.get(changedFeatureId);
      if (!after || after === before) continue;

      if (changedFeatureId === featureId) {
        this.addedFeature = after;
      } else {
        this.modifiedFeaturesBeforeParentAssignment.set(changedFeatureId, before);
        this.modifiedFeaturesAfterParentAssignment.set(changedFeatureId, after);
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
