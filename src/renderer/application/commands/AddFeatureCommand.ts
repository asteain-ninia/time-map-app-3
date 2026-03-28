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
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import {
  createTransientPolygonFeature,
  validatePolygonOrThrow,
} from '../polygonValidation';

/** 追加する地物の種類とパラメータ */
export type AddFeatureParams =
  | { type: 'point'; coord: Coordinate; layerId: string; time: TimePoint; name?: string }
  | { type: 'line'; coords: readonly Coordinate[]; layerId: string; time: TimePoint; name?: string }
  | { type: 'polygon'; coords: readonly Coordinate[]; layerId: string; time: TimePoint; name?: string };

export class AddFeatureCommand implements UndoableCommand {
  readonly description: string;
  private addedFeature: Feature | null = null;
  private addedVertexIds: string[] = [];

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: AddFeatureParams
  ) {
    const typeLabel =
      params.type === 'point' ? '点' :
      params.type === 'line' ? '線' : '面';
    this.description = `${typeLabel}情報を追加`;
  }

  execute(): void {
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
          this.params.coords, this.params.layerId, this.params.time, this.params.name
        );
        break;
    }

    this.addedFeature = feature;

    // 新しく追加された頂点IDを特定
    this.addedVertexIds = [];
    for (const id of this.featureUseCase.getVertices().keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
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
  }
}
