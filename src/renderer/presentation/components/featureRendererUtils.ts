import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export interface ActiveFeatureEntry {
  readonly feature: Feature;
  readonly anchor: FeatureAnchor;
  readonly featureIndex: number;
}

/**
 * 現在時刻でアクティブな描画対象地物（shape を持つ錨）を地図全体で収集する。
 *
 * Phase 2-D-5 で導入。レイヤー単位の自動配色グルーピングを撤去したため、
 * 自動配色の隣接グラフ・featureIndex 連番は地図全体で一意になる。
 *
 * 含めない:
 * - 現在時刻でアクティブな錨が無い地物
 * - 錨が shape プロパティを持たない地物（コンテナ）— Phase 2-C-3 で確立した除外規則
 * - 非表示レイヤー所属の地物 — 表示文脈に含まれないため自動配色の隣接グラフ・featureIndex
 *   連番に混入させない
 *
 * 入力順を保持し、含まれた地物に 0 始まりの連番（地図全体連番）を割り当てる。
 */
export function collectActiveFeatureEntries(
  features: readonly Feature[],
  currentTime: TimePoint,
  visibleLayerIds: ReadonlySet<string>
): readonly ActiveFeatureEntry[] {
  const entries: ActiveFeatureEntry[] = [];
  for (const feature of features) {
    const anchor = feature.getActiveAnchor(currentTime);
    if (anchor && anchor.shape && visibleLayerIds.has(anchor.placement.layerId)) {
      entries.push({ feature, anchor, featureIndex: entries.length });
    }
  }
  return entries;
}
