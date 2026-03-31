import type { Feature } from '@domain/entities/Feature';
import type { Layer } from '@domain/entities/Layer';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import { getUniqueVertexIds } from './vertexHandleUtils';

export interface VertexSelectionContext {
  readonly kind: 'empty' | 'single' | 'multiple' | 'unknown';
  readonly featureIds: readonly string[];
}

export function buildVisibleVertexOwnerMap(
  features: readonly Feature[],
  layers: readonly Layer[],
  currentTime?: TimePoint
): Map<string, Set<string>> {
  const ownerMap = new Map<string, Set<string>>();
  if (!currentTime) return ownerMap;

  const visibleLayerIds = new Set(
    layers
      .filter((layer) => layer.visible)
      .map((layer) => layer.id)
  );

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || !visibleLayerIds.has(anchor.placement.layerId)) {
      continue;
    }

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
