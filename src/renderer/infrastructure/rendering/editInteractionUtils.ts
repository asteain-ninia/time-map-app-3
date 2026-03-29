import type { ToolMode } from '@presentation/state/toolMachine';

export type EditInteractionMode = 'vertex' | 'featureMove';

export interface VertexMouseDownState {
  readonly nextSelection: Set<string>;
  readonly shouldStartDrag: boolean;
}

export function resolveVertexMouseDownState(
  selectedVertexIds: ReadonlySet<string>,
  vertexId: string,
  isShiftPressed: boolean
): VertexMouseDownState {
  if (isShiftPressed) {
    const nextSelection = new Set(selectedVertexIds);
    if (nextSelection.has(vertexId)) {
      nextSelection.delete(vertexId);
    } else {
      nextSelection.add(vertexId);
    }
    return {
      nextSelection,
      shouldStartDrag: false,
    };
  }

  if (selectedVertexIds.has(vertexId)) {
    return {
      nextSelection: new Set(selectedVertexIds),
      shouldStartDrag: true,
    };
  }

  return {
    nextSelection: new Set([vertexId]),
    shouldStartDrag: true,
  };
}

export interface FeatureDragStartParams {
  readonly toolMode: ToolMode;
  readonly editInteractionMode: EditInteractionMode;
  readonly selectedFeatureId: string | null;
  readonly clickedFeatureId: string | null;
  readonly hitFeatureId: string | null;
  readonly hasCurrentTime: boolean;
  readonly isRingDrawing: boolean;
  readonly isKnifeDrawing: boolean;
}

export function shouldStartFeatureDrag(params: FeatureDragStartParams): boolean {
  if (params.toolMode !== 'edit') return false;
  if (params.editInteractionMode !== 'featureMove') return false;
  if (!params.selectedFeatureId || !params.hasCurrentTime) return false;
  if (params.isRingDrawing || params.isKnifeDrawing) return false;

  return (
    params.clickedFeatureId === params.selectedFeatureId ||
    params.hitFeatureId === params.selectedFeatureId
  );
}
