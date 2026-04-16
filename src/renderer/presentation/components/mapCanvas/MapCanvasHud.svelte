<script lang="ts">
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import type { SurveyResult } from '@infrastructure/rendering/surveyModeManager';
  import { wrapLongitudeToPrimaryRange } from '@infrastructure/rendering/featureRenderingUtils';
  import type { ToolMode } from '@presentation/state/toolMachine';
  import EditToolbar from '../EditToolbar.svelte';
  import GridLabelsOverlay from '../GridLabelsOverlay.svelte';
  import LongitudeCompass from '../LongitudeCompass.svelte';
  import {
    formatSurveyDistance,
    type MapCanvasViewBoxValues,
  } from '../mapCanvasUtils';

  let {
    viewBox,
    viewWidthPx = 0,
    viewHeightPx = 0,
    gridInterval = 10,
    validationMessage = '',
    isDrawing = false,
    drawingCanConfirm = false,
    drawingCoords = [] as readonly Coordinate[],
    onConfirm,
    onCancel,
    isRingDrawing = false,
    isKnifeDrawing = false,
    centerLongitude = 0,
    zoomLevel = 1,
    onShiftLongitude,
    onSetCenterLongitude,
    selectionAnchor = null as FeatureAnchor | null,
    toolMode = 'view' as ToolMode,
    isFeatureMoveMode = false,
    ringDrawingCanConfirm = false,
    knifeCanConfirm = false,
    onToggleFeatureMove,
    onAddRing,
    onConfirmRing,
    onCancelRing,
    onDeleteVertex,
    onStartKnife,
    onConfirmKnife,
    onCancelKnife,
    mergeTargetCount = 0,
    onAddMergeTarget,
    onStartMerge,
    onClearMerge,
    surveyResult = null as SurveyResult | null,
    surveyPointA = null as Coordinate | null,
    surveyPointB = null as Coordinate | null,
    surveyMeasurementCount = 0,
    onClearSurvey,
    cursorGeo = null as { lon: number; lat: number } | null,
  }: {
    viewBox: MapCanvasViewBoxValues;
    viewWidthPx?: number;
    viewHeightPx?: number;
    gridInterval?: number;
    validationMessage?: string;
    isDrawing?: boolean;
    drawingCanConfirm?: boolean;
    drawingCoords?: readonly Coordinate[];
    onConfirm?: () => void;
    onCancel?: () => void;
    isRingDrawing?: boolean;
    isKnifeDrawing?: boolean;
    centerLongitude?: number;
    zoomLevel?: number;
    onShiftLongitude?: (delta: number) => void;
    onSetCenterLongitude?: (value: number) => void;
    selectionAnchor?: FeatureAnchor | null;
    toolMode?: ToolMode;
    isFeatureMoveMode?: boolean;
    ringDrawingCanConfirm?: boolean;
    knifeCanConfirm?: boolean;
    onToggleFeatureMove?: () => void;
    onAddRing?: () => void;
    onConfirmRing?: () => void;
    onCancelRing?: () => void;
    onDeleteVertex?: () => void;
    onStartKnife?: () => void;
    onConfirmKnife?: () => void;
    onCancelKnife?: () => void;
    mergeTargetCount?: number;
    onAddMergeTarget?: () => void;
    onStartMerge?: () => void;
    onClearMerge?: () => void;
    surveyResult?: SurveyResult | null;
    surveyPointA?: Coordinate | null;
    surveyPointB?: Coordinate | null;
    surveyMeasurementCount?: number;
    onClearSurvey?: () => void;
    cursorGeo?: { lon: number; lat: number } | null;
  } = $props();

  let hasSurveyData = $derived(
    surveyMeasurementCount > 0 || surveyPointA !== null || surveyPointB !== null || surveyResult !== null
  );
</script>

<GridLabelsOverlay
  {viewBox}
  {viewWidthPx}
  {viewHeightPx}
  interval={gridInterval}
/>

{#if validationMessage}
  <div class="validation-banner" role="status">
    {validationMessage}
  </div>
{/if}

{#if !isDrawing && !isRingDrawing && !isKnifeDrawing}
  <LongitudeCompass
    centerLongitude={centerLongitude}
    zoom={zoomLevel}
    onShift={onShiftLongitude}
    onSetCenterLongitude={onSetCenterLongitude}
  />
{/if}

{#if isDrawing}
  <div class="drawing-toolbar">
    <button
      class="drawing-btn confirm"
      disabled={!drawingCanConfirm}
      onclick={() => onConfirm?.()}
    >
      確定 ({drawingCoords.length}点)
    </button>
    <button
      class="drawing-btn cancel"
      onclick={() => onCancel?.()}
    >
      キャンセル
    </button>
  </div>
{/if}

{#if selectionAnchor && !isDrawing && (toolMode === 'edit' || toolMode === 'view')}
  <EditToolbar
    featureType={selectionAnchor.shape.type}
    {isRingDrawing}
    {isKnifeDrawing}
    {isFeatureMoveMode}
    canConfirm={ringDrawingCanConfirm}
    canConfirmKnife={knifeCanConfirm}
    {onToggleFeatureMove}
    {onAddRing}
    {onConfirmRing}
    {onCancelRing}
    {onDeleteVertex}
    {onStartKnife}
    {onConfirmKnife}
    {onCancelKnife}
    {mergeTargetCount}
    {onAddMergeTarget}
    {onStartMerge}
    {onClearMerge}
  />
{/if}

{#if toolMode === 'measure' && surveyResult}
  <div class="survey-panel">
    <div class="survey-header">
      <span>測量</span>
      <button
        class="survey-clear"
        type="button"
        disabled={!hasSurveyData}
        title="測量線をクリア"
        onclick={() => onClearSurvey?.()}
      >
        クリア
      </button>
    </div>
    <div class="survey-row">
      <span class="survey-label">A:</span>
      <span class="survey-value">{surveyResult.displayA.dms}</span>
    </div>
    <div class="survey-row">
      <span class="survey-label">B:</span>
      <span class="survey-value">{surveyResult.displayB.dms}</span>
    </div>
    <div class="survey-divider"></div>
    <div class="survey-row">
      <span class="survey-label">大円距離:</span>
      <span class="survey-value">{formatSurveyDistance(surveyResult.distance.greatCircleKm)} km</span>
    </div>
    <div class="survey-row">
      <span class="survey-label">図法距離:</span>
      <span class="survey-value">{formatSurveyDistance(surveyResult.distance.equirectangularKm)} km</span>
    </div>
  </div>
{:else if toolMode === 'measure' && surveyPointA && !surveyPointB}
  <div class="survey-panel">
    <div class="survey-header">
      <span>測量</span>
      <button
        class="survey-clear"
        type="button"
        disabled={!hasSurveyData}
        title="測量線をクリア"
        onclick={() => onClearSurvey?.()}
      >
        クリア
      </button>
    </div>
    <div class="survey-row">
      <span class="survey-label">A:</span>
      <span class="survey-value">
        {surveyPointA.y.toFixed(4)}°, {wrapLongitudeToPrimaryRange(surveyPointA.x).toFixed(4)}°
      </span>
    </div>
    <div class="survey-hint">終点をクリックして距離を測定</div>
  </div>
{:else if toolMode === 'measure'}
  <div class="survey-panel">
    <div class="survey-header">
      <span>測量</span>
      <button
        class="survey-clear"
        type="button"
        disabled={!hasSurveyData}
        title="測量線をクリア"
        onclick={() => onClearSurvey?.()}
      >
        クリア
      </button>
    </div>
    <div class="survey-hint">始点をクリックして測量開始</div>
  </div>
{/if}

{#if cursorGeo}
  <div class="cursor-info">
    {cursorGeo.lat.toFixed(2)}°, {wrapLongitudeToPrimaryRange(cursorGeo.lon).toFixed(2)}°
  </div>
{/if}

<style>
  .cursor-info {
    position: absolute;
    bottom: 4px;
    left: 4px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.7);
    color: #ccc;
    font-size: 11px;
    border-radius: 3px;
    pointer-events: none;
  }

  .validation-banner {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(80vw, 520px);
    padding: 8px 12px;
    border: 1px solid rgba(255, 120, 120, 0.45);
    border-radius: 8px;
    background: rgba(96, 22, 22, 0.92);
    color: #ffdede;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
    pointer-events: none;
  }

  .drawing-toolbar {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 6px;
    border: 1px solid #555;
  }

  .drawing-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: 1px solid #555;
    font-size: 12px;
    cursor: pointer;
  }

  .drawing-btn.confirm {
    background: #094771;
    color: #fff;
    border-color: #007acc;
  }

  .drawing-btn.confirm:disabled {
    background: #333;
    color: #666;
    border-color: #444;
    cursor: not-allowed;
  }

  .drawing-btn.confirm:not(:disabled):hover {
    background: #0b5a8e;
  }

  .drawing-btn.cancel {
    background: #3c3c3c;
    color: #ccc;
  }

  .drawing-btn.cancel:hover {
    background: #4c4c4c;
  }

  .survey-panel {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 6px;
    border: 1px solid #555;
    font-size: 11px;
    color: #e0e0e0;
    min-width: 200px;
    pointer-events: auto;
  }

  .survey-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    color: #aaa;
    font-size: 11px;
  }

  .survey-clear {
    padding: 2px 8px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #343434;
    color: #ddd;
    font-size: 11px;
    cursor: pointer;
  }

  .survey-clear:disabled {
    color: #666;
    cursor: not-allowed;
  }

  .survey-clear:not(:disabled):hover {
    background: #444;
  }

  .survey-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 2px 0;
  }

  .survey-label {
    color: #aaa;
    flex-shrink: 0;
  }

  .survey-value {
    color: #ffd93d;
    font-family: monospace;
    text-align: right;
  }

  .survey-divider {
    height: 1px;
    background: #444;
    margin: 4px 0;
  }

  .survey-hint {
    color: #888;
    font-style: italic;
    text-align: center;
    margin: 2px 0;
  }
</style>
