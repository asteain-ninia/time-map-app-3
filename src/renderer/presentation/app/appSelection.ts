import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { VertexSelectionContext } from '@infrastructure/rendering/vertexSelectionContext';

export interface PropertyPanelSelectionState {
  readonly kind: 'empty' | 'multiple' | 'unknown';
  readonly featureSummaries?: readonly { id: string; name: string }[];
  readonly remainingCount?: number;
}

export function getFeatureById(
  features: readonly Feature[],
  featureId: string | null
): Feature | null {
  if (!featureId) return null;
  return features.find((feature) => feature.id === featureId) ?? null;
}

export function getSelectionFeatureName(
  features: readonly Feature[],
  featureId: string,
  currentTime?: TimePoint
): string {
  const feature = getFeatureById(features, featureId);
  return feature?.getActiveAnchor(currentTime)?.property.name ?? featureId;
}

export function buildPropertyPanelSelectionState(
  features: readonly Feature[],
  selectedFeatureId: string | null,
  vertexSelectionContext: VertexSelectionContext,
  currentTime?: TimePoint
): PropertyPanelSelectionState {
  if (selectedFeatureId || vertexSelectionContext.kind === 'single') {
    return { kind: 'empty' };
  }

  if (vertexSelectionContext.kind === 'multiple') {
    const featureSummaries = vertexSelectionContext.featureIds
      .slice(0, 5)
      .map((featureId) => ({
        id: featureId,
        name: getSelectionFeatureName(features, featureId, currentTime),
      }));

    return {
      kind: 'multiple',
      featureSummaries,
      remainingCount: Math.max(vertexSelectionContext.featureIds.length - featureSummaries.length, 0),
    };
  }

  if (vertexSelectionContext.kind === 'unknown') {
    return { kind: 'unknown' };
  }

  return { kind: 'empty' };
}

export function collectAnchorVertexIds(anchor: FeatureAnchor): string[] {
  switch (anchor.shape.type) {
    case 'Point':
      return [anchor.shape.vertexId];
    case 'LineString':
      return [...anchor.shape.vertexIds];
    case 'Polygon':
      return anchor.shape.rings.flatMap((ring) => ring.vertexIds);
  }
}
