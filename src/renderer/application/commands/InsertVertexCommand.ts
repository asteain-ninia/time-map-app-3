/**
 * 頂点挿入コマンド（Undo対応）
 *
 * §2.3.1: Undo/Redo対象操作 — 頂点の追加
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import { eventBus } from '../EventBus';
import type { UndoableCommand } from '../UndoRedoManager';
import type { VertexEditUseCase } from '../VertexEditUseCase';

export type InsertVertexParams =
  | {
      readonly type: 'line';
      readonly featureId: string;
      readonly currentTime: TimePoint;
      readonly edgeIndex: number;
      readonly coordinate: Coordinate;
    }
  | {
      readonly type: 'polygon';
      readonly featureId: string;
      readonly currentTime: TimePoint;
      readonly ringId: string;
      readonly edgeIndex: number;
      readonly coordinate: Coordinate;
    };

export class InsertVertexCommand implements UndoableCommand {
  readonly description = '頂点を追加';
  private featureBefore: Feature | null = null;
  private featureAfter: Feature | null = null;
  private insertedVertex: Vertex | null = null;
  private insertedVertexIdValue: string | null = null;

  constructor(
    private readonly vertexEditUseCase: VertexEditUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: InsertVertexParams
  ) {}

  get insertedVertexId(): string | null {
    return this.insertedVertexIdValue;
  }

  execute(): void {
    if (this.featureAfter && this.insertedVertex) {
      this.restoreAfter();
      return;
    }

    this.featureBefore = this.featureUseCase.getFeatureById(this.params.featureId) ?? null;
    this.insertedVertexIdValue = this.params.type === 'line'
      ? this.vertexEditUseCase.insertVertexOnLine(
        this.params.featureId,
        this.params.currentTime,
        this.params.edgeIndex,
        this.params.coordinate
      )
      : this.vertexEditUseCase.insertVertexOnPolygon(
        this.params.featureId,
        this.params.currentTime,
        this.params.ringId,
        this.params.edgeIndex,
        this.params.coordinate
      );

    this.featureAfter = this.featureUseCase.getFeatureById(this.params.featureId) ?? null;
    this.insertedVertex = this.insertedVertexIdValue
      ? this.featureUseCase.getVertices().get(this.insertedVertexIdValue) ?? null
      : null;
  }

  undo(): void {
    if (!this.featureBefore || !this.insertedVertexIdValue) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    features.set(this.featureBefore.id, this.featureBefore);
    vertices.delete(this.insertedVertexIdValue);
    eventBus.emit('feature:added', { featureId: this.featureBefore.id });
  }

  private restoreAfter(): void {
    if (!this.featureAfter || !this.insertedVertex || !this.insertedVertexIdValue) return;

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    features.set(this.featureAfter.id, this.featureAfter);
    vertices.set(this.insertedVertexIdValue, this.insertedVertex);
    eventBus.emit('feature:added', { featureId: this.featureAfter.id });
  }
}
