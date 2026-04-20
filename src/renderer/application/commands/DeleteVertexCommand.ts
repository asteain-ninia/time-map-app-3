/**
 * 頂点削除コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 頂点の削除
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import { eventBus } from '../EventBus';
import type { UndoableCommand } from '../UndoRedoManager';
import type { VertexEditUseCase } from '../VertexEditUseCase';

export type DeleteVertexParams =
  | {
      readonly type: 'line';
      readonly featureId: string;
      readonly currentTime: TimePoint;
      readonly vertexId: string;
    }
  | {
      readonly type: 'polygon';
      readonly featureId: string;
      readonly currentTime: TimePoint;
      readonly ringId: string;
      readonly vertexId: string;
    };

export class DeleteVerticesCommand implements UndoableCommand {
  readonly description: string;
  private featuresBefore = new Map<string, Feature>();
  private verticesBefore = new Map<string, Vertex>();
  private sharedGroupsBefore = new Map<string, SharedVertexGroup>();

  constructor(
    private readonly vertexEditUseCase: VertexEditUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: readonly DeleteVertexParams[]
  ) {
    this.description = params.length > 1 ? '複数頂点を削除' : '頂点を削除';
  }

  execute(): void {
    this.featuresBefore = new Map(this.featureUseCase.getFeaturesMap());
    this.verticesBefore = new Map(this.featureUseCase.getVertices());
    this.sharedGroupsBefore = new Map(this.featureUseCase.getSharedVertexGroups());
    const usedVertexIdsBefore = this.collectAllUsedVertexIds(this.featuresBefore);

    for (const param of this.params) {
      this.deleteVertex(param);
    }

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const usedVertexIdsAfter = this.collectAllUsedVertexIds(features);
    for (const vertexId of usedVertexIdsBefore) {
      if (!usedVertexIdsAfter.has(vertexId)) {
        this.deleteUnusedVertex(vertexId);
      }
    }
  }

  undo(): void {
    this.restoreMap(
      this.featureUseCase.getFeaturesMap() as Map<string, Feature>,
      this.featuresBefore
    );
    this.restoreMap(
      this.featureUseCase.getVertices() as Map<string, Vertex>,
      this.verticesBefore
    );
    this.restoreMap(
      this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>,
      this.sharedGroupsBefore
    );
    for (const featureId of new Set(this.params.map((param) => param.featureId))) {
      eventBus.emit('feature:added', { featureId });
    }
  }

  private deleteVertex(param: DeleteVertexParams): void {
    try {
      if (param.type === 'line') {
        this.vertexEditUseCase.deleteVertexFromLine(
          param.featureId,
          param.currentTime,
          param.vertexId
        );
        return;
      }

      this.vertexEditUseCase.deleteVertexFromPolygon(
        param.featureId,
        param.currentTime,
        param.ringId,
        param.vertexId
      );
    } catch (error) {
      if (this.params.length <= 1) {
        throw error;
      }
      // 複数削除中に前の削除で地物が消えた場合などは残りを無視する。
    }
  }

  private deleteUnusedVertex(vertexId: string): void {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    vertices.delete(vertexId);

    for (const [groupId, group] of sharedGroups) {
      if (!group.vertexIds.includes(vertexId)) continue;

      const updated = group.withVertexIds(
        group.vertexIds.filter((id) => id !== vertexId)
      );
      if (updated.shouldBeRemoved()) {
        sharedGroups.delete(groupId);
      } else {
        sharedGroups.set(groupId, updated);
      }
    }
  }

  private collectAllUsedVertexIds(features: ReadonlyMap<string, Feature>): Set<string> {
    const ids = new Set<string>();
    for (const feature of features.values()) {
      for (const anchor of feature.anchors) {
        switch (anchor.shape.type) {
          case 'Point':
            ids.add(anchor.shape.vertexId);
            break;
          case 'LineString':
            for (const vertexId of anchor.shape.vertexIds) {
              ids.add(vertexId);
            }
            break;
          case 'Polygon':
            for (const ring of anchor.shape.rings) {
              for (const vertexId of ring.vertexIds) {
                ids.add(vertexId);
              }
            }
            break;
        }
      }
    }
    return ids;
  }

  private restoreMap<K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>): void {
    target.clear();
    for (const [key, value] of source) {
      target.set(key, value);
    }
  }
}

export class DeleteVertexCommand extends DeleteVerticesCommand {
  constructor(
    vertexEditUseCase: VertexEditUseCase,
    featureUseCase: AddFeatureUseCase,
    params: DeleteVertexParams
  ) {
    super(vertexEditUseCase, featureUseCase, [params]);
  }
}
