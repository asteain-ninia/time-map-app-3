<script lang="ts">
  import { ViewportManager } from '@infrastructure/ViewportManager';
  import { eventBus } from '@application/EventBus';
  import { Coordinate } from '@domain/value-objects/Coordinate';
  import GridRenderer from './GridRenderer.svelte';
  import FeatureRenderer from './FeatureRenderer.svelte';
  import DrawingPreview from './DrawingPreview.svelte';
  import VertexHandles from './VertexHandles.svelte';
  import EditToolbar from './EditToolbar.svelte';
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';
  import type { SnapIndicator } from '@infrastructure/rendering/snapIndicatorUtils';
  import type { SurveyMeasurement, SurveyResult } from '@infrastructure/rendering/surveyModeManager';
  import MeasurementOverlay from './MeasurementOverlay.svelte';
  import type { Coordinate as CoordinateType } from '@domain/value-objects/Coordinate';

  let {
    features = [] as readonly Feature[],
    vertices = new Map<string, Vertex>() as ReadonlyMap<string, Vertex>,
    layers = [] as readonly Layer[],
    gridInterval = 10,
    gridColor = '#888888',
    gridOpacity = 0.3,
    currentTime = undefined as TimePoint | undefined,
    toolMode = 'view' as ToolMode,
    addToolType = 'polygon' as AddToolType,
    isDrawing = false,
    drawingCoords = [] as readonly Coordinate[],
    selectedFeatureId = null as string | null,
    selectionFeatureId = null as string | null,
    vertexSelectionContextFeatureId = null as string | null,
    selectedVertexIds = new Set<string>() as ReadonlySet<string>,
    sharedGroups = new Map<string, SharedVertexGroup>() as ReadonlyMap<string, SharedVertexGroup>,
    snapIndicators = [] as readonly SnapIndicator[],
    onMapClick,
    onMapDoubleClick,
    onPanStart,
    onPanEnd,
    onConfirm,
    onCancel,
    onVertexMouseDown,
    onEdgeHandleMouseDown,
    onCursorGeoUpdate,
    onDragEnd,
    showVertexHandles = true,
    isRingDrawing = false,
    ringDrawingCanConfirm = false,
    ringDrawingCoords = [] as readonly Coordinate[],
    isFeatureMoveMode = false,
    onToggleFeatureMove,
    onAddRing,
    onConfirmRing,
    onCancelRing,
    onDeleteVertex,
    onMapMouseDown,
    isFeatureDragging = false,
    isKnifeDrawing = false,
    knifeDrawingCoords = [] as readonly Coordinate[],
    knifeCanConfirm = false,
    onStartKnife,
    onConfirmKnife,
    onCancelKnife,
    mergeTargetCount = 0,
    onAddMergeTarget,
    onStartMerge,
    onClearMerge,
    surveyMeasurements = [] as readonly SurveyMeasurement[],
    surveyPointA = null as CoordinateType | null,
    surveyPointB = null as CoordinateType | null,
    surveyResult = null as SurveyResult | null,
    boxSelectBox = null as { minX: number; minY: number; maxX: number; maxY: number } | null,
    validationMessage = '',
  }: {
    features?: readonly Feature[];
    vertices?: ReadonlyMap<string, Vertex>;
    layers?: readonly Layer[];
    gridInterval?: number;
    gridColor?: string;
    gridOpacity?: number;
    currentTime?: TimePoint;
    toolMode?: ToolMode;
    addToolType?: AddToolType;
    isDrawing?: boolean;
    drawingCoords?: readonly Coordinate[];
    selectedFeatureId?: string | null;
    selectionFeatureId?: string | null;
    vertexSelectionContextFeatureId?: string | null;
    selectedVertexIds?: ReadonlySet<string>;
    sharedGroups?: ReadonlyMap<string, SharedVertexGroup>;
    snapIndicators?: readonly SnapIndicator[];
    onMapClick?: (coord: Coordinate, featureId?: string | null) => void;
    onMapDoubleClick?: (coord: Coordinate) => void;
    onPanStart?: () => void;
    onPanEnd?: () => void;
    onConfirm?: () => void;
    onCancel?: () => void;
    onVertexMouseDown?: (vertexId: string, e: MouseEvent) => void;
    onEdgeHandleMouseDown?: (vertexId1: string, vertexId2: string, e: MouseEvent) => void;
    onCursorGeoUpdate?: (
      geo: { lon: number; lat: number },
      screenX: number,
      screenY: number,
      zoom: number,
      viewWidthPx: number
    ) => void;
    onDragEnd?: () => void;
    showVertexHandles?: boolean;
    isRingDrawing?: boolean;
    ringDrawingCanConfirm?: boolean;
    ringDrawingCoords?: readonly Coordinate[];
    isFeatureMoveMode?: boolean;
    onToggleFeatureMove?: () => void;
    onAddRing?: () => void;
    onConfirmRing?: () => void;
    onCancelRing?: () => void;
    onDeleteVertex?: () => void;
    onMapMouseDown?: (
      coord: Coordinate,
      screenX: number,
      screenY: number,
      featureId?: string | null,
      isAdditive?: boolean
    ) => void;
    isFeatureDragging?: boolean;
    isKnifeDrawing?: boolean;
    knifeDrawingCoords?: readonly Coordinate[];
    knifeCanConfirm?: boolean;
    onStartKnife?: () => void;
    onConfirmKnife?: () => void;
    onCancelKnife?: () => void;
    mergeTargetCount?: number;
    onAddMergeTarget?: () => void;
    onStartMerge?: () => void;
    onClearMerge?: () => void;
    surveyMeasurements?: readonly SurveyMeasurement[];
    surveyPointA?: CoordinateType | null;
    surveyPointB?: CoordinateType | null;
    surveyResult?: SurveyResult | null;
    boxSelectBox?: { minX: number; minY: number; maxX: number; maxY: number } | null;
    validationMessage?: string;
  } = $props();

  /** 描画確定可能か（線:2点以上、面:3点以上） */
  let canConfirm = $derived(
    isDrawing &&
      (addToolType === 'polygon'
        ? drawingCoords.length >= 3
        : drawingCoords.length >= 2)
  );

  let visibleLayerIds = $derived(
    new Set(layers.filter((layer) => layer.visible).map((layer) => layer.id))
  );

  /** 選択コンテキスト地物のアンカー */
  let selectionAnchor = $derived(() => {
    if (!selectionFeatureId || !currentTime) return null;
    const feature = features.find((f) => f.id === selectionFeatureId);
    if (!feature) return null;
    return feature.getActiveAnchor(currentTime);
  });

  /** 頂点ハンドル描画対象 */
  let vertexHandleEntries = $derived(() => {
    if (!currentTime) {
      return [] as Array<{
        featureId: string;
        anchor: FeatureAnchor;
        showEdgeHandles: boolean;
      }>;
    }

    if (selectedFeatureId && selectionAnchor()) {
      return [{
        featureId: selectedFeatureId,
        anchor: selectionAnchor()!,
        showEdgeHandles: true,
      }];
    }

    if (selectedVertexIds.size === 0) {
      return [];
    }

    const entries: Array<{
      featureId: string;
      anchor: FeatureAnchor;
      showEdgeHandles: boolean;
    }> = [];

    for (const feature of features) {
      const anchor = feature.getActiveAnchor(currentTime);
      if (!anchor || !visibleLayerIds.has(anchor.placement.layerId)) {
        continue;
      }

      entries.push({
        featureId: feature.id,
        anchor,
        showEdgeHandles: feature.id === vertexSelectionContextFeatureId,
      });
    }

    return entries;
  });

  const viewport = new ViewportManager();

  let containerEl = $state<HTMLDivElement | null>(null);
  let viewBox = $state(viewport.getViewBox());
  let zoomLevel = $state(viewport.getZoom());
  let isPanning = $state(false);
  let lastPanX = $state(0);
  let lastPanY = $state(0);
  let cursorGeo = $state<{ lon: number; lat: number } | null>(null);
  let wrapOffsets = $state<number[]>([0]);

  /** viewBoxとwrapOffsetsを一括更新 */
  function syncViewport(): void {
    viewBox = viewport.getViewBox();
    zoomLevel = viewport.getZoom();
    wrapOffsets = viewport.getWrapOffsets();
  }

  /** ベースマップのSVGコンテンツ */
  let baseMapContent = $state('');

  $effect(() => {
    fetch('./assets/maps/base-map.svg')
      .then(r => r.text())
      .then(text => {
        const match = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (match) baseMapContent = match[1];
      });
  });

  /** コンテナサイズの変更を監視 */
  $effect(() => {
    if (!containerEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        viewport.setViewSize(width, height);
        syncViewport();
      }
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  });

  /** パンが許可されるか判定（表示モードは左+中、その他は中ボタンのみ） */
  function canPan(button: number): boolean {
    if (toolMode === 'view') return button === 0 || button === 1;
    return button === 1;
  }

  /** カーソルスタイル */
  let cursorStyle = $derived(
    isPanning ? 'grabbing' :
    isFeatureDragging ? 'move' :
    toolMode === 'view' ? 'grab' :
    toolMode === 'add' ? 'crosshair' :
    toolMode === 'measure' ? 'crosshair' :
    toolMode === 'edit' && isFeatureMoveMode ? 'move' :
    'default'
  );

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    viewport.zoomAtCursor(-e.deltaY, x, y);
    syncViewport();
    zoomLevel = viewport.getZoom();
    eventBus.emit('viewport:zoomChanged', { zoom: zoomLevel });
  }

  function getFeatureIdFromTarget(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest('[data-feature-id]')?.getAttribute('data-feature-id') ?? null;
  }

  function getClickCoordinate(e: MouseEvent): Coordinate | null {
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return null;

    const geo = viewport.screenToGeo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    return new Coordinate(geo.lon, geo.lat);
  }

  function onMouseDown(e: MouseEvent): void {
    if (canPan(e.button)) {
      isPanning = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      onPanStart?.();
      e.preventDefault();
    } else if (e.button === 0 && onMapMouseDown) {
      const coord = getClickCoordinate(e);
      if (coord) {
        onMapMouseDown(
          coord,
          e.clientX,
          e.clientY,
          getFeatureIdFromTarget(e.target),
          e.shiftKey
        );
      }
    }
  }

  function onMouseMove(e: MouseEvent): void {
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cursorGeo = viewport.screenToGeo(x, y);
    if (cursorGeo) {
      eventBus.emit('cursor:moved', { lon: cursorGeo.lon, lat: cursorGeo.lat });
      onCursorGeoUpdate?.(cursorGeo, e.clientX, e.clientY, zoomLevel, rect.width);
    }

    if (isPanning) {
      const dx = e.clientX - lastPanX;
      const dy = e.clientY - lastPanY;
      viewport.pan(dx, dy);
      syncViewport();
      lastPanX = e.clientX;
      lastPanY = e.clientY;
    }
  }

  function onMouseUp(_e: MouseEvent): void {
    onDragEnd?.();
    if (isPanning) {
      isPanning = false;
      onPanEnd?.();
    }
  }

  function onMouseLeave(_e: MouseEvent): void {
    if (isPanning) {
      isPanning = false;
      onPanEnd?.();
    }
    cursorGeo = null;
    eventBus.emit('cursor:left', {});
  }

  function onClick(e: MouseEvent): void {
    // パン中やドラッグ後はクリックとして扱わない
    if (e.button !== 0 || isFeatureDragging) return;
    const coord = getClickCoordinate(e);
    if (!coord) return;
    onMapClick?.(coord, getFeatureIdFromTarget(e.target));
  }

  function onDblClick(e: MouseEvent): void {
    if (e.button !== 0) return;
    const coord = getClickCoordinate(e);
    if (!coord) return;
    onMapDoubleClick?.(coord);
  }
</script>

<div
  class="map-container"
  bind:this={containerEl}
  role="application"
  aria-label="地図表示"
  style:cursor={cursorStyle}
>
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <svg
    class="map-svg"
    viewBox={viewBox}
    preserveAspectRatio="xMidYMid meet"
    onwheel={onWheel}
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={onMouseLeave}
    onclick={onClick}
    ondblclick={onDblClick}
  >
    <!-- §2.1: 横方向無限スクロール — 複数オフセットでコンテンツを描画 -->
    {#each wrapOffsets as offset}
      <g transform="translate({offset}, 0)">
        <!-- 海の背景 -->
        <rect x="0" y="0" width="360" height="180" fill="#1a1a2e" pointer-events="none" />

        <!-- ベースマップ（§2.1: pointer-events無効、テキスト選択不可） -->
        <g
          transform="scale({360 / 4243.4}, {180 / 2121.7})"
          pointer-events="none"
          style="user-select: none;"
        >
          {@html baseMapContent}
        </g>

        <!-- 地物描画 -->
        {#if currentTime}
          <FeatureRenderer
            {features}
            {vertices}
            {layers}
            {currentTime}
            zoom={zoomLevel}
            {selectedFeatureId}
            contextFeatureId={vertexSelectionContextFeatureId}
          />
        {/if}

        <!-- グリッド線 -->
        <GridRenderer
          zoom={zoomLevel}
          interval={gridInterval}
          color={gridColor}
          opacity={gridOpacity}
          isPrimaryWrap={offset === 0}
        />

        <!-- 頂点ハンドル・エッジハンドル -->
        {#if !isDrawing && showVertexHandles}
          {#each vertexHandleEntries() as entry (entry.featureId)}
            <VertexHandles
              anchor={entry.anchor}
              {vertices}
              zoom={zoomLevel}
              {selectedVertexIds}
              {sharedGroups}
              {snapIndicators}
              showEdgeHandles={entry.showEdgeHandles}
              {onVertexMouseDown}
              {onEdgeHandleMouseDown}
            />
          {/each}
        {/if}

        <!-- 描画プレビュー -->
        {#if isDrawing && drawingCoords.length > 0}
          <DrawingPreview
            coords={drawingCoords}
            zoom={zoomLevel}
            cursorGeo={cursorGeo}
            isPolygon={addToolType === 'polygon'}
          />
        {/if}

        <!-- リング描画プレビュー（穴/飛び地追加中） -->
        {#if isRingDrawing && ringDrawingCoords.length > 0}
          <DrawingPreview
            coords={ringDrawingCoords}
            zoom={zoomLevel}
            cursorGeo={cursorGeo}
            isPolygon={true}
          />
        {/if}

        <!-- ナイフツール描画プレビュー（分断線） -->
        {#if isKnifeDrawing && knifeDrawingCoords.length > 0}
          <DrawingPreview
            coords={knifeDrawingCoords}
            zoom={zoomLevel}
            cursorGeo={cursorGeo}
            isPolygon={false}
          />
        {/if}

        <!-- 完了済み測量オーバーレイ -->
        {#each surveyMeasurements as measurement}
          <MeasurementOverlay
            pointA={measurement.pointA}
            pointB={measurement.pointB}
            result={measurement.result}
            zoom={zoomLevel}
            isPrimaryWrap={offset === 0}
          />
        {/each}

        <!-- 測量中オーバーレイ -->
        {#if toolMode === 'measure' && surveyPointA && !surveyPointB}
          <MeasurementOverlay
            pointA={surveyPointA}
            pointB={null}
            result={null}
            zoom={zoomLevel}
            isPrimaryWrap={offset === 0}
          />
        {/if}
      </g>
    {/each}

    <!-- 矩形選択オーバーレイ -->
    {#if boxSelectBox}
      <rect
        x={boxSelectBox.minX}
        y={90 - boxSelectBox.maxY}
        width={boxSelectBox.maxX - boxSelectBox.minX}
        height={boxSelectBox.maxY - boxSelectBox.minY}
        fill="rgba(0, 122, 204, 0.15)"
        stroke="#007acc"
        stroke-width={1 / zoomLevel}
        stroke-dasharray="{3 / zoomLevel} {2 / zoomLevel}"
        pointer-events="none"
      />
    {/if}

  </svg>

  {#if validationMessage}
    <div class="validation-banner" role="status">
      {validationMessage}
    </div>
  {/if}

  <!-- 描画中の確定/キャンセルボタン（§2.3.2: 確定ボタンの押下で形状を確定） -->
  {#if isDrawing}
    <div class="drawing-toolbar">
      <button
        class="drawing-btn confirm"
        disabled={!canConfirm}
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

  <!-- 編集ツールバー（選択地物がある場合、描画中でない場合） -->
  {#if selectionAnchor() && !isDrawing && (toolMode === 'edit' || toolMode === 'view')}
    <EditToolbar
      featureType={selectionAnchor()?.shape.type ?? null}
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

  <!-- 測量情報パネル -->
  {#if toolMode === 'measure' && surveyResult}
    <div class="survey-panel">
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
        <span class="survey-value">{surveyResult.distance.greatCircleKm < 100 ? surveyResult.distance.greatCircleKm.toFixed(1) : Math.round(surveyResult.distance.greatCircleKm).toLocaleString()} km</span>
      </div>
      <div class="survey-row">
        <span class="survey-label">図法距離:</span>
        <span class="survey-value">{surveyResult.distance.equirectangularKm < 100 ? surveyResult.distance.equirectangularKm.toFixed(1) : Math.round(surveyResult.distance.equirectangularKm).toLocaleString()} km</span>
      </div>
    </div>
  {:else if toolMode === 'measure' && surveyPointA && !surveyPointB}
    <div class="survey-panel">
      <div class="survey-row">
        <span class="survey-label">A:</span>
        <span class="survey-value">{surveyPointA.y.toFixed(4)}°, {surveyPointA.x.toFixed(4)}°</span>
      </div>
      <div class="survey-hint">終点をクリックして距離を測定</div>
    </div>
  {:else if toolMode === 'measure'}
    <div class="survey-panel">
      <div class="survey-hint">始点をクリックして測量開始</div>
    </div>
  {/if}

  <!-- カーソル座標表示 -->
  {#if cursorGeo}
    <div class="cursor-info">
      {cursorGeo.lat.toFixed(2)}°, {cursorGeo.lon.toFixed(2)}°
    </div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .map-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

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
    pointer-events: none;
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
