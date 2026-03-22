/**
 * 頂点移動コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 頂点の移動
 *
 * execute で頂点を新座標に移動し、undo で元座標に戻す。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import type { Vertex } from '@domain/entities/Vertex';
import type { VertexEditUseCase } from '../VertexEditUseCase';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';

export class MoveVertexCommand implements UndoableCommand {
  readonly description = '頂点を移動';
  private oldCoordinate: Coordinate | null = null;

  constructor(
    private readonly vertexEditUseCase: VertexEditUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly vertexId: string,
    private readonly newCoordinate: Coordinate
  ) {}

  execute(): void {
    const vertex = this.featureUseCase.getVertices().get(this.vertexId);
    if (!vertex) return;

    this.oldCoordinate = vertex.coordinate;
    this.vertexEditUseCase.moveVertex(this.vertexId, this.newCoordinate);
  }

  undo(): void {
    if (!this.oldCoordinate) return;
    this.vertexEditUseCase.moveVertex(this.vertexId, this.oldCoordinate);
  }
}
