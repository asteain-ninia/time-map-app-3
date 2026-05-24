import type { MapSceneEntry } from '@presentation/components/mapSceneEntries';
import { getUniqueVertexIds } from './vertexHandleUtils';

export interface VertexSelectionContext {
  readonly kind: 'empty' | 'single' | 'multiple' | 'unknown';
  readonly featureIds: readonly string[];
}

/**
 * sceneEntries（描画・ヒットテストと同じ集合）から、頂点 ID → 所有地物 ID 集合を作る。
 *
 * Phase 2-D-6-1+2: 描画・ヒットテスト・頂点選択コンテキスト・wrapOffsets が同じ
 * `sceneEntries` を参照するように統一した（開発ガイド §6.1.2 / §6.6.9 / §6.0.1 検出観点2）。
 * これにより「画面に描画されないが頂点所有者として現れる」状態が発生しない。
 *
 * 旧モデルではレイヤー可視性で features を絞っていたが、sceneEntries 化により
 * 描画と同じ集合を共有する責務になったため `buildSceneVertexOwnerMap` へ改名した。
 */
export function buildSceneVertexOwnerMap(
  sceneEntries: readonly MapSceneEntry[]
): Map<string, Set<string>> {
  const ownerMap = new Map<string, Set<string>>();

  for (const { feature, anchor } of sceneEntries) {
    if (!anchor.shape) continue;
    for (const vertexId of getUniqueVertexIds(anchor.shape)) {
      const owners = ownerMap.get(vertexId);
      if (owners) {
        owners.add(feature.id);
        continue;
      }
      ownerMap.set(vertexId, new Set([feature.id]));
    }
  }

  return ownerMap;
}

export function collectFeatureIdsForSelectedVertices(
  selectedVertexIds: ReadonlySet<string>,
  ownerMap: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const featureIds = new Set<string>();

  for (const vertexId of selectedVertexIds) {
    const owners = ownerMap.get(vertexId);
    if (!owners) continue;
    for (const featureId of owners) {
      featureIds.add(featureId);
    }
  }

  return featureIds;
}

export function resolveVertexSelectionContext(
  selectedVertexIds: ReadonlySet<string>,
  ownerMap: ReadonlyMap<string, ReadonlySet<string>>
): VertexSelectionContext {
  if (selectedVertexIds.size === 0) {
    return { kind: 'empty', featureIds: [] };
  }

  const featureIds = collectFeatureIdsForSelectedVertices(selectedVertexIds, ownerMap);
  if (featureIds.size === 0) {
    return { kind: 'unknown', featureIds: [] };
  }

  if (featureIds.size === 1) {
    return { kind: 'single', featureIds: [...featureIds] };
  }

  return { kind: 'multiple', featureIds: [...featureIds] };
}
