/**
 * 地物削除ユースケース
 *
 * §5.3.0: DeleteFeatureUseCase — 地物の削除
 * §2.1: 下位領域をすべて喪失した場合、上位領域も自動的に消失する
 *
 * 地物を削除し、使用されなくなった頂点のクリーンアップ、
 * 親子関係の整理（孤立した親の自動削除）を行う。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { eventBus } from './EventBus';
import {
  shouldParentDisappear,
  getParentFeature,
  getChildFeatures,
} from '@domain/services/LayerService';
import type { TimePoint } from '@domain/value-objects/TimePoint';

/** 削除結果 */
export interface DeleteFeatureResult {
  /** 削除された地物ID群 */
  readonly deletedFeatureIds: readonly string[];
  /** 削除された頂点ID群 */
  readonly deletedVertexIds: readonly string[];
}

/**
 * 地物削除ユースケース
 */
export class DeleteFeatureUseCase {
  constructor(
    private readonly featureUseCase: AddFeatureUseCase
  ) {}

  /**
   * 地物を削除する
   *
   * - 地物をfeaturesマップから除去
   * - 他の地物から参照されていない頂点を除去
   * - 親子関係の更新（子の parentId を null に設定）
   * - 親が全子喪失なら親も自動削除（§2.1）
   *
   * @param featureId 削除対象の地物ID
   * @param currentTime 親子関係判定に使用する時間点（省略時は階層処理をスキップ）
   * @returns 削除結果。地物が存在しない場合はnull
   */
  deleteFeature(
    featureId: string,
    currentTime?: TimePoint
  ): DeleteFeatureResult | null {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const feature = features.get(featureId);
    if (!feature) return null;

    const deletedFeatureIds: string[] = [];
    const deletedVertexIds: string[] = [];

    // 階層処理: 子地物の parentId をクリア
    if (currentTime) {
      const allFeatures = this.featureUseCase.getFeatures();
      const children = getChildFeatures(feature, allFeatures, currentTime);

      for (const child of children) {
        const anchor = child.getActiveAnchor(currentTime);
        if (anchor) {
          const updatedAnchor = anchor.withPlacement({
            ...anchor.placement,
            parentId: null,
          });
          const updatedAnchors = child.anchors.map(a =>
            a.id === anchor.id ? updatedAnchor : a
          );
          features.set(child.id, child.withAnchors(updatedAnchors));
        }
      }
    }

    // 地物が持つ頂点IDを収集
    const featureVertexIds = this.collectVertexIds(feature);

    // 地物を削除
    features.delete(featureId);
    deletedFeatureIds.push(featureId);
    eventBus.emit('feature:removed', { featureId });

    // 頂点クリーンアップ: 他の地物で使われていない頂点を削除
    const usedVertexIds = this.collectAllUsedVertexIds(features);
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    for (const vid of featureVertexIds) {
      if (!usedVertexIds.has(vid)) {
        vertices.delete(vid);
        deletedVertexIds.push(vid);

        // 共有頂点グループからも除去
        for (const [gid, group] of sharedGroups) {
          if (group.vertexIds.includes(vid)) {
            const updated = group.withVertexIds(
              group.vertexIds.filter(id => id !== vid)
            );
            if (updated.shouldBeRemoved()) {
              sharedGroups.delete(gid);
            } else {
              sharedGroups.set(gid, updated);
            }
          }
        }
      }
    }

    // 親が全子喪失したら親も自動削除（§2.1）
    if (currentTime) {
      const allFeatures = this.featureUseCase.getFeatures();
      const parent = getParentFeature(feature, [...allFeatures, feature], currentTime);
      if (parent && shouldParentDisappear(parent, allFeatures, featureId, currentTime)) {
        const parentResult = this.deleteFeature(parent.id, currentTime);
        if (parentResult) {
          deletedFeatureIds.push(...parentResult.deletedFeatureIds);
          deletedVertexIds.push(...parentResult.deletedVertexIds);
        }
      }
    }

    return { deletedFeatureIds, deletedVertexIds };
  }

  /**
   * 地物が持つ全頂点IDを収集する
   */
  private collectVertexIds(feature: Feature): Set<string> {
    const ids = new Set<string>();
    for (const anchor of feature.anchors) {
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
    }
    return ids;
  }

  /**
   * 全地物で使用されている頂点IDを収集する
   */
  private collectAllUsedVertexIds(features: ReadonlyMap<string, Feature>): Set<string> {
    const ids = new Set<string>();
    for (const feature of features.values()) {
      for (const vid of this.collectVertexIds(feature)) {
        ids.add(vid);
      }
    }
    return ids;
  }
}
