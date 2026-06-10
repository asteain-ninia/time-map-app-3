/**
 * 地物削除ユースケース
 *
 * §5.3.0: DeleteFeatureUseCase — 地物の削除
 * §2.1: 面情報の削除は、全時刻を通じてその地物の下位領域・上位領域への参照を持つ
 *       他の地物が存在しないか、削除に伴う再編が許容される場合にのみ可能とする。
 *       集約地物が下位領域を全て失った場合は自動的に消滅する。
 *
 * 削除 = 全時間軸からの消滅。削除地物への参照（parentId / childIds）を残存する
 * 全地物の全錨から掃除し（`planFeatureRemoval`）、使用されなくなった頂点を
 * クリーンアップする。空コンテナ化した集約地物は連鎖的に消滅する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { planFeatureRemoval } from '@domain/services/HierarchyService';
import { applyFeatureRemoval } from './featureRemoval';

/** 削除結果 */
export interface DeleteFeatureResult {
  /** 削除された地物ID群（削除起点 + 連鎖消滅した集約地物） */
  readonly deletedFeatureIds: readonly string[];
  /** 参照掃除（parentId クリア / childIds 除去 / 空コンテナ錨の剪定）で更新された地物ID群 */
  readonly modifiedFeatureIds: readonly string[];
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
   * - 削除地物への参照を全地物・全錨から掃除（子の parentId クリア + 親の childIds 除去）
   * - 空コンテナ化した集約地物の連鎖消滅（§2.1）
   * - 他の地物から参照されていない頂点を除去
   * - touch した全地物へイベントを対称に発火（§6.4.16）
   *
   * @param featureId 削除対象の地物ID
   * @returns 削除結果。地物が存在しない場合はnull
   */
  deleteFeature(featureId: string): DeleteFeatureResult | null {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    if (!features.has(featureId)) return null;

    const plan = planFeatureRemoval(featureId, features);

    // 削除地物が持つ頂点IDを反映前（地物がまだ Map に居る状態）に収集
    const candidateVertexIds = new Set<string>();
    for (const deletedId of plan.deletedFeatureIds) {
      const deleted = features.get(deletedId);
      if (!deleted) continue;
      for (const vid of this.collectVertexIds(deleted)) {
        candidateVertexIds.add(vid);
      }
    }

    applyFeatureRemoval(features, plan);

    // 頂点クリーンアップ: 他の地物で使われていない頂点を削除
    const deletedVertexIds: string[] = [];
    const usedVertexIds = this.collectAllUsedVertexIds(features);
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;

    for (const vid of candidateVertexIds) {
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

    return {
      deletedFeatureIds: plan.deletedFeatureIds,
      modifiedFeatureIds: plan.modifiedFeatures.map(f => f.id),
      deletedVertexIds,
    };
  }

  /**
   * 地物が持つ全頂点IDを収集する
   */
  private collectVertexIds(feature: Feature): Set<string> {
    const ids = new Set<string>();
    for (const anchor of feature.anchors) {
      if (!anchor.shape) continue;
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
