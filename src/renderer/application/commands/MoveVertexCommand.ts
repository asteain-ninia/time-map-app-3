/**
 * 頂点移動コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 頂点の移動
 *
 * execute で頂点を新座標に移動し、undo で元座標に戻す。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { VertexEditUseCase } from '../VertexEditUseCase';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import {
  findGroupForVertex,
  mergeVertices,
  moveSharedVertices,
} from '@domain/services/SharedVertexService';

export class MoveVertexCommand implements UndoableCommand {
  readonly description = '頂点を移動';
  private oldCoordinates = new Map<string, Coordinate>();
  private oldSharedGroups = new Map<string, SharedVertexGroup>();

  constructor(
    private readonly vertexEditUseCase: VertexEditUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly vertexId: string,
    private readonly newCoordinate: Coordinate,
    private readonly mergeTargetVertexId: string | null = null
  ) {}

  execute(): void {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    const vertex = vertices.get(this.vertexId);
    if (!vertex) return;

    this.oldCoordinates.clear();
    this.oldSharedGroups = new Map(sharedGroups);

    const mergeTargetVertex =
      this.mergeTargetVertexId && this.mergeTargetVertexId !== this.vertexId
        ? vertices.get(this.mergeTargetVertexId)
        : undefined;
    const finalCoordinate = mergeTargetVertex?.coordinate ?? this.newCoordinate;

    const draggedGroup = findGroupForVertex(this.vertexId, sharedGroups);
    if (draggedGroup) {
      const moveResult = moveSharedVertices(
        draggedGroup.id,
        finalCoordinate,
        sharedGroups,
        vertices
      );

      for (const [movedVertexId, updatedVertex] of moveResult.updatedVertices) {
        const currentVertex = vertices.get(movedVertexId);
        if (currentVertex && !this.oldCoordinates.has(movedVertexId)) {
          this.oldCoordinates.set(movedVertexId, currentVertex.coordinate);
        }
        vertices.set(movedVertexId, updatedVertex);
      }
      sharedGroups.set(moveResult.updatedGroup.id, moveResult.updatedGroup);
    } else {
      this.oldCoordinates.set(this.vertexId, vertex.coordinate);
      this.vertexEditUseCase.moveVertex(this.vertexId, finalCoordinate);
    }

    if (mergeTargetVertex && this.mergeTargetVertexId) {
      const mergeResult = mergeVertices(
        this.vertexId,
        this.mergeTargetVertexId,
        mergeTargetVertex.coordinate,
        sharedGroups,
        this.createSharedGroupId()
      );

      for (const removedGroupId of mergeResult.removedGroupIds) {
        sharedGroups.delete(removedGroupId);
      }
      for (const updatedGroup of mergeResult.updatedGroups) {
        sharedGroups.set(updatedGroup.id, updatedGroup);
      }
    }
  }

  undo(): void {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    for (const [vertexId, oldCoordinate] of this.oldCoordinates) {
      const vertex = vertices.get(vertexId);
      if (!vertex) continue;
      vertices.set(vertexId, vertex.withCoordinate(oldCoordinate));
    }

    sharedGroups.clear();
    for (const [groupId, group] of this.oldSharedGroups) {
      sharedGroups.set(groupId, group);
    }
  }

  private createSharedGroupId(): string {
    return `svg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
