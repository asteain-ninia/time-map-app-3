/**
 * 地物削除計画の共通適用ヘルパー
 *
 * §2.1: 面情報の削除（削除 = 全時間軸からの消滅）に伴う階層参照の掃除
 *
 * `planFeatureRemoval`（HierarchyService）が算出した削除計画を features Map へ反映し、
 * touch した全地物へイベントを対称に発火する（存在・更新 = `feature:added` /
 * 削除 = `feature:removed`。§6.4.16）。
 *
 * 地物が features Map から消える全経路（地物削除・退化形状の自動削除・最後の錨削除）で
 * 本ヘルパーを共有し、経路ごとの参照掃除・イベント発火のドリフトを防ぐ（§6.1.8）。
 */

import type { Feature } from '@domain/entities/Feature';
import type { FeatureRemovalPlan } from '@domain/services/HierarchyService';
import { eventBus } from './EventBus';

/**
 * 削除計画を features Map へ反映し、touch した全地物へイベントを発火する
 *
 * @param features live な全地物マップ（変異する）
 * @param plan `planFeatureRemoval` の算出結果
 */
export function applyFeatureRemoval(
  features: Map<string, Feature>,
  plan: FeatureRemovalPlan
): void {
  for (const featureId of plan.deletedFeatureIds) {
    features.delete(featureId);
  }
  for (const feature of plan.modifiedFeatures) {
    features.set(feature.id, feature);
  }
  for (const featureId of plan.deletedFeatureIds) {
    eventBus.emit('feature:removed', { featureId });
  }
  for (const feature of plan.modifiedFeatures) {
    eventBus.emit('feature:added', { featureId: feature.id });
  }
}
