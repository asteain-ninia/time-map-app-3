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

/**
 * 地物ドラッグ開始判定パラメータ。
 *
 * `hitFeatureId` は呼び出し側が hitTest 経路で確定した「最終ターゲット ID」を指す
 * （開発ガイド §6.2.25 採用ポリシー: hitTest 最終決定 + 空振り時のみ DOM target
 * フォールバック）。DOM target（`clickedFeatureId`）は本判定には参加しない。
 *
 * 理由: DOM target を OR 条件に入れると「親が選択中 / DOM target は親 / hitTest は
 * 子（深い側）」のとき hitFeatureId !== selectedFeatureId なのに DOM target で
 * drag が開始され、§6.2.25「hitTest 優先、DOM は空振り時だけ fallback」と矛盾する
 * （子をクリックしたつもりが親をドラッグしてしまう）。判定キーを「呼び出し側が
 * 解決済みの最終 ID」だけに揃え、tie-break ポリシーが drag 経路でも一貫するように
 * する。
 */
export interface FeatureDragStartParams {
  readonly toolMode: ToolMode;
  readonly editInteractionMode: EditInteractionMode;
  readonly selectedFeatureId: string | null;
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

  return params.hitFeatureId === params.selectedFeatureId;
}
