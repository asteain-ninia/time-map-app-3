/**
 * 地物移動コマンド
 *
 * §2.3.3.2: 地物移動ツール — 全頂点へ同一ベクトルで平行移動
 *
 * 共有頂点も移動対象に含め、共有先の地物にも位置変更が反映される。
 */

import type { UndoableCommand } from '../UndoRedoManager';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import {
  findGroupForVertex,
  getLinkedVertexIds,
} from '@domain/services/SharedVertexService';
import {
  collectImpactedFeatureIdsByVertexIds,
  validatePolygonFeatureIdsOrThrow,
} from '../polygonValidation';

export interface MoveFeatureParams {
  featureId: string;
  dx: number;
  dy: number;
  currentTime: TimePoint;
}

/**
 * 地物平行移動コマンド（Undo対応）
 */
export class MoveFeatureCommand implements UndoableCommand {
  readonly description: string;
  private movedVertexIds: string[] = [];
  private originalCoords: Map<string, Coordinate> = new Map();
  private originalSharedGroups: Map<string, SharedVertexGroup> = new Map();
  private executed = false;

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: MoveFeatureParams
  ) {
    this.description = `地物 ${params.featureId} を移動`;
  }

  execute(): void {
    this.executed = false;
    this.originalCoords.clear();
    this.originalSharedGroups.clear();
    this.movedVertexIds = [];

    const { featureId, dx, dy, currentTime } = this.params;
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) return;

    // 現在時間のアクティブ錨から頂点IDを収集
    const vertexIds = this.collectActiveVertexIds(feature, currentTime);

    // 共有頂点を含めた全移動対象を収集
    const allVertexIds = new Set<string>();
    const vertices = this.featureUseCase.getVertices();
    const groups = this.featureUseCase.getSharedVertexGroups();
    const affectedGroupIds = new Set<string>();

    for (const vid of vertexIds) {
      allVertexIds.add(vid);
      // 共有頂点のリンク先も追加
      const linked = getLinkedVertexIds(vid, groups);
      for (const linkedVid of linked) {
        allVertexIds.add(linkedVid);
      }
      const group = findGroupForVertex(vid, groups);
      if (group) {
        affectedGroupIds.add(group.id);
      }
    }

    const validationVertices = new Map(vertices);
    for (const vid of allVertexIds) {
      const vertex = validationVertices.get(vid);
      if (!vertex) continue;

      validationVertices.set(vid, vertex.withCoordinate(
        new Coordinate(
          vertex.coordinate.x + dx,
          vertex.coordinate.y + dy
        ).clampLatitude()
      ));
    }

    const impactedFeatureIds = collectImpactedFeatureIdsByVertexIds(
      this.featureUseCase.getFeatures(),
      allVertexIds,
      currentTime
    );
    validatePolygonFeatureIdsOrThrow(
      impactedFeatureIds,
      this.featureUseCase.getFeatures(),
      validationVertices,
      currentTime
    );

    // 元の座標を保存（Undo用）
    this.originalSharedGroups = new Map(groups);

    const mutableVertices = vertices as Map<string, Vertex>;
    for (const vid of allVertexIds) {
      const vertex = mutableVertices.get(vid);
      if (!vertex) continue;

      this.originalCoords.set(vid, vertex.coordinate);
      this.movedVertexIds.push(vid);

      const newCoord = new Coordinate(
        vertex.coordinate.x + dx,
        vertex.coordinate.y + dy
      ).clampLatitude();
      mutableVertices.set(vid, vertex.withCoordinate(newCoord));
    }

    const mutableGroups = groups as Map<string, SharedVertexGroup>;
    for (const groupId of affectedGroupIds) {
      const group = mutableGroups.get(groupId);
      if (!group) continue;
      mutableGroups.set(groupId, group.withRepresentativeCoordinate(
        new Coordinate(
          group.representativeCoordinate.x + dx,
          group.representativeCoordinate.y + dy
        ).clampLatitude()
      ));
    }

    this.executed = true;
  }

  undo(): void {
    if (!this.executed) {
      return;
    }

    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    for (const vid of this.movedVertexIds) {
      const original = this.originalCoords.get(vid);
      if (!original) continue;
      const vertex = mutableVertices.get(vid);
      if (!vertex) continue;
      mutableVertices.set(vid, vertex.withCoordinate(original));
    }

    const mutableGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    mutableGroups.clear();
    for (const [groupId, group] of this.originalSharedGroups) {
      mutableGroups.set(groupId, group);
    }
  }

  /**
   * 地物のアクティブ錨から頂点IDを収集する
   */
  private collectActiveVertexIds(feature: Feature, time: TimePoint): Set<string> {
    const ids = new Set<string>();
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) return ids;

    switch (anchor.shape.type) {
      case 'Point':
        ids.add(anchor.shape.vertexId);
        break;
      case 'LineString':
        for (const vid of anchor.shape.vertexIds) ids.add(vid);
        break;
      case 'Polygon':
        for (const ring of anchor.shape.rings) {
          for (const vid of ring.vertexIds) ids.add(vid);
        }
        break;
    }
    return ids;
  }
}
