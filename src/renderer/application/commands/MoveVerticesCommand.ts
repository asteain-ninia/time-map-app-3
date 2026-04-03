import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { VertexEditUseCase } from '../VertexEditUseCase';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { UndoableCommand } from '../UndoRedoManager';
import { findGroupForVertex } from '@domain/services/SharedVertexService';
import {
  collectImpactedFeatureIdsByVertexIds,
  validatePolygonFeatureIdsOrThrow,
} from '../polygonValidation';

export class MoveVerticesCommand implements UndoableCommand {
  readonly description = '複数頂点を移動';
  private oldCoordinates = new Map<string, Coordinate>();
  private oldSharedGroups = new Map<string, SharedVertexGroup>();

  constructor(
    private readonly vertexEditUseCase: VertexEditUseCase,
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly vertexIds: readonly string[],
    private readonly deltaX: number,
    private readonly deltaY: number,
    private readonly currentTime?: TimePoint
  ) {}

  execute(): void {
    const uniqueVertexIds = [...new Set(this.vertexIds)];
    if (uniqueVertexIds.length === 0) return;

    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    this.oldCoordinates.clear();
    this.oldSharedGroups = new Map(sharedGroups);

    const validationVertices = new Map(vertices);
    for (const vertexId of uniqueVertexIds) {
      const vertex = vertices.get(vertexId);
      if (!vertex) continue;

      this.oldCoordinates.set(vertexId, vertex.coordinate);
      const movedCoordinate = new Coordinate(
        vertex.x + this.deltaX,
        vertex.y + this.deltaY
      ).clampLatitude();
      validationVertices.set(
        vertexId,
        vertex.withCoordinate(movedCoordinate)
      );
    }

    if (this.currentTime) {
      const impactedFeatureIds = collectImpactedFeatureIdsByVertexIds(
        this.featureUseCase.getFeatures(),
        uniqueVertexIds,
        this.currentTime
      );
      validatePolygonFeatureIdsOrThrow(
        impactedFeatureIds,
        this.featureUseCase.getFeatures(),
        validationVertices,
        this.currentTime
      );
    }

    for (const [vertexId, coordinate] of this.oldCoordinates) {
      this.vertexEditUseCase.moveVertex(
        vertexId,
        new Coordinate(coordinate.x + this.deltaX, coordinate.y + this.deltaY).clampLatitude()
      );
    }

    const affectedGroupIds = new Set<string>();
    for (const vertexId of uniqueVertexIds) {
      const group = findGroupForVertex(vertexId, sharedGroups);
      if (group) {
        affectedGroupIds.add(group.id);
      }
    }

    for (const groupId of affectedGroupIds) {
      const group = sharedGroups.get(groupId);
      if (!group) continue;

      sharedGroups.set(
        groupId,
        group.withRepresentativeCoordinate(
          new Coordinate(
            group.representativeCoordinate.x + this.deltaX,
            group.representativeCoordinate.y + this.deltaY
          ).clampLatitude()
        )
      );
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
}
