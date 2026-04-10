<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ViewportManager } from '@infrastructure/ViewportManager';
  import { eventBus } from '@application/EventBus';
  import { Coordinate } from '@domain/value-objects/Coordinate';
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { WorldSettings } from '@domain/entities/World';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';
  import type { SnapIndicator } from '@infrastructure/rendering/snapIndicatorUtils';
  import type { SurveyMeasurement, SurveyResult } from '@infrastructure/rendering/surveyModeManager';
  import { wrapLongitudeToPrimaryRange } from '@infrastructure/rendering/featureRenderingUtils';
  import MapCanvasHud from './mapCanvas/MapCanvasHud.svelte';
  import MapCanvasSvgLayers from './mapCanvas/MapCanvasSvgLayers.svelte';
  import {
    computeRenderWrapOffsets,
    getAnchorVertexCount,
    normalizeRenderFps,
    normalizeVertexMarkerDisplayLimit,
    normalizeZoomLimits,
    type MapCanvasVertexHandleEntry,
  } from './mapCanvasUtils';

  let {
    features = [] as readonly Feature[],
    vertices = new Map<string, Vertex>() as ReadonlyMap<string, Vertex>,
    layers = [] as readonly Layer[],
    focusedLayerId = null as string | null,
    settings = undefined as WorldSettings | undefined,
    gridInterval = 10,
    gridColor = '#888888',
    gridOpacity = 0.3,
    zoomMin = 1,
    zoomMax = 50,
    targetFps = 60,
    vertexMarkerDisplayLimit = 1000,
    labelAreaThreshold = 0.0005,
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
    onVertexActivate,
    onEdgeHandleMouseDown,
    onEdgeHandleActivate,
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
    surveyPointA = null as Coordinate | null,
    surveyPointB = null as Coordinate | null,
    surveyResult = null as SurveyResult | null,
    boxSelectBox = null as { minX: number; minY: number; maxX: number; maxY: number } | null,
    validationMessage = '',
  }: {
    features?: readonly Feature[];
    vertices?: ReadonlyMap<string, Vertex>;
    layers?: readonly Layer[];
    focusedLayerId?: string | null;
    settings?: WorldSettings;
    gridInterval?: number;
    gridColor?: string;
    gridOpacity?: number;
    zoomMin?: number;
    zoomMax?: number;
    targetFps?: number;
    vertexMarkerDisplayLimit?: number;
    labelAreaThreshold?: number;
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
    onVertexMouseDown?: (vertexId: string, startCoord: Coordinate, e: MouseEvent) => void;
    onVertexActivate?: (vertexId: string, startCoord: Coordinate, isAdditive: boolean) => void;
    onEdgeHandleMouseDown?: (
      vertexId1: string,
      vertexId2: string,
      midpoint: Coordinate,
      e: MouseEvent
    ) => void;
    onEdgeHandleActivate?: (
      vertexId1: string,
      vertexId2: string,
      midpoint: Coordinate
    ) => void;
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
    surveyPointA?: Coordinate | null;
    surveyPointB?: Coordinate | null;
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
      return [] as MapCanvasVertexHandleEntry[];
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

    const entries: MapCanvasVertexHandleEntry[] = [];

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

  let totalVertexHandleCount = $derived(
    vertexHandleEntries().reduce((sum, entry) => sum + getAnchorVertexCount(entry.anchor), 0)
  );

  let suppressPassiveVertexHandles = $derived(
    !selectedFeatureId &&
      totalVertexHandleCount > normalizeVertexMarkerDisplayLimit(vertexMarkerDisplayLimit)
  );

  const viewport = new ViewportManager();

  let containerEl = $state<HTMLDivElement | null>(null);
  let viewBox = $state(viewport.getViewBox());
  let viewBoxValues = $state(viewport.getViewBoxValues());
  let zoomLevel = $state(viewport.getZoom());
  let centerLongitude = $state(wrapLongitudeToPrimaryRange(viewport.getCenterLongitude()));
  let viewWidthPx = $state(800);
  let viewHeightPx = $state(600);
  let isPanning = $state(false);
  let lastPanX = $state(0);
  let lastPanY = $state(0);
  let cursorGeo = $state<{ lon: number; lat: number } | null>(null);
  let wrapOffsets = $state<number[]>([0]);
  let pendingPointerMove: { clientX: number; clientY: number } | null = null;
  let pointerMoveFrameId: number | null = null;
  let lastPointerMoveAt = 0;
  const mapKeyboardInstructionsId = 'map-canvas-keyboard-instructions';

  /** viewBoxとwrapOffsetsを一括更新 */
  function syncViewport(): void {
    viewBox = viewport.getViewBox();
    viewBoxValues = viewport.getViewBoxValues();
    zoomLevel = viewport.getZoom();
    centerLongitude = wrapLongitudeToPrimaryRange(viewport.getCenterLongitude());
  }

  $effect(() => {
    const extraCoords = [
      ...drawingCoords,
      ...ringDrawingCoords,
      ...knifeDrawingCoords,
      ...surveyMeasurements.flatMap((measurement) => [measurement.pointA, measurement.pointB]),
      ...(surveyPointA ? [surveyPointA] : []),
      ...(surveyPointB ? [surveyPointB] : []),
    ];

    wrapOffsets = computeRenderWrapOffsets(
      viewBoxValues,
      features,
      vertices,
      currentTime,
      {
        visibleLayerIds,
        extraCoords,
      }
    );
  });

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

  $effect(() => {
    const limits = normalizeZoomLimits(zoomMin, zoomMax);
    viewport.setZoomLimits(limits.min, limits.max);
    syncViewport();
  });

  onDestroy(() => {
    if (pointerMoveFrameId !== null) {
      cancelAnimationFrame(pointerMoveFrameId);
    }
  });

  /** コンテナサイズの変更を監視 */
  $effect(() => {
    if (!containerEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        viewWidthPx = width;
        viewHeightPx = height;
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

  function zoomAtViewportCenter(delta: number): void {
    if (!containerEl) {
      return;
    }

    const rect = containerEl.getBoundingClientRect();
    viewport.zoomAtCursor(delta, rect.width / 2, rect.height / 2);
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

  function processPointerMove(clientX: number, clientY: number): void {
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    cursorGeo = viewport.screenToGeo(x, y);
    if (cursorGeo) {
      eventBus.emit('cursor:moved', { lon: cursorGeo.lon, lat: cursorGeo.lat });
      onCursorGeoUpdate?.(cursorGeo, clientX, clientY, zoomLevel, rect.width);
    }

    if (isPanning) {
      const dx = clientX - lastPanX;
      const dy = clientY - lastPanY;
      viewport.pan(dx, dy);
      syncViewport();
      lastPanX = clientX;
      lastPanY = clientY;
    }
  }

  function flushPendingPointerMove(force = false): void {
    if (!pendingPointerMove) {
      return;
    }

    const frameIntervalMs = 1000 / normalizeRenderFps(targetFps);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - lastPointerMoveAt < frameIntervalMs) {
      return;
    }

    const next = pendingPointerMove;
    pendingPointerMove = null;
    lastPointerMoveAt = now;
    processPointerMove(next.clientX, next.clientY);
  }

  function schedulePointerMoveFlush(): void {
    if (pointerMoveFrameId !== null) {
      return;
    }

    pointerMoveFrameId = requestAnimationFrame(() => {
      pointerMoveFrameId = null;
      flushPendingPointerMove();
      if (pendingPointerMove) {
        schedulePointerMoveFlush();
      }
    });
  }

  function onMouseMove(e: MouseEvent): void {
    pendingPointerMove = { clientX: e.clientX, clientY: e.clientY };
    if (normalizeRenderFps(targetFps) >= 60) {
      flushPendingPointerMove(true);
      return;
    }
    schedulePointerMoveFlush();
  }

  function onMouseUp(_e: MouseEvent): void {
    flushPendingPointerMove(true);
    onDragEnd?.();
    if (isPanning) {
      isPanning = false;
      onPanEnd?.();
    }
  }

  function onMouseLeave(_e: MouseEvent): void {
    flushPendingPointerMove(true);
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

  function shiftLongitude(delta: number): void {
    viewport.shiftCenterLongitude(delta);
    syncViewport();
  }

  function setCenterLongitude(value: number): void {
    viewport.setCenterLongitude(value);
    syncViewport();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    const panStepX = Math.max(24, Math.round(viewWidthPx * 0.08));
    const panStepY = Math.max(24, Math.round(viewHeightPx * 0.08));
    let handled = true;

    switch (e.key) {
      case 'ArrowLeft':
        viewport.pan(panStepX, 0);
        syncViewport();
        break;
      case 'ArrowRight':
        viewport.pan(-panStepX, 0);
        syncViewport();
        break;
      case 'ArrowUp':
        viewport.pan(0, panStepY);
        syncViewport();
        break;
      case 'ArrowDown':
        viewport.pan(0, -panStepY);
        syncViewport();
        break;
      case '+':
      case '=':
      case 'Add':
        zoomAtViewportCenter(1);
        break;
      case '-':
      case '_':
      case 'Subtract':
        zoomAtViewportCenter(-1);
        break;
      case '0':
        viewport.fitToWorld();
        syncViewport();
        zoomLevel = viewport.getZoom();
        eventBus.emit('viewport:zoomChanged', { zoom: zoomLevel });
        break;
      default:
        handled = false;
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  }
</script>

<div
  class="map-container"
  bind:this={containerEl}
  style:cursor={cursorStyle}
>
  <p id={mapKeyboardInstructionsId} class="sr-only">
    地図はフォーカス可能です。矢印キーで移動し、プラスとマイナスで拡大縮小、0で全体表示に戻ります。
  </p>
  <svg
    class="map-svg"
    role="application"
    tabindex="0"
    aria-label="地図表示"
    aria-describedby={mapKeyboardInstructionsId}
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - 0"
    viewBox={viewBox}
    preserveAspectRatio="xMidYMid meet"
    onwheel={onWheel}
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={onMouseLeave}
    onclick={onClick}
    ondblclick={onDblClick}
    onkeydown={onKeyDown}
  >
    <MapCanvasSvgLayers
      {wrapOffsets}
      {baseMapContent}
      {currentTime}
      {features}
      {vertices}
      {layers}
      {focusedLayerId}
      {settings}
      {gridInterval}
      {gridColor}
      {gridOpacity}
      {zoomLevel}
      {labelAreaThreshold}
      {selectedFeatureId}
      {vertexSelectionContextFeatureId}
      {isDrawing}
      {showVertexHandles}
      vertexHandleEntries={vertexHandleEntries()}
      {selectedVertexIds}
      {sharedGroups}
      {snapIndicators}
      suppressPassiveVertexHandles={suppressPassiveVertexHandles}
      {drawingCoords}
      {addToolType}
      {cursorGeo}
      {isRingDrawing}
      {ringDrawingCoords}
      {isKnifeDrawing}
      {knifeDrawingCoords}
      {toolMode}
      {surveyMeasurements}
      {surveyPointA}
      {surveyPointB}
      {boxSelectBox}
      {onVertexMouseDown}
      {onVertexActivate}
      {onEdgeHandleMouseDown}
      {onEdgeHandleActivate}
    />
  </svg>

  <MapCanvasHud
    viewBox={viewBoxValues}
    {viewWidthPx}
    {viewHeightPx}
    {gridInterval}
    {validationMessage}
    {isDrawing}
    drawingCanConfirm={canConfirm}
    {drawingCoords}
    {onConfirm}
    {onCancel}
    {isRingDrawing}
    {isKnifeDrawing}
    {centerLongitude}
    {zoomLevel}
    onShiftLongitude={shiftLongitude}
    onSetCenterLongitude={setCenterLongitude}
    selectionAnchor={selectionAnchor()}
    {toolMode}
    {isFeatureMoveMode}
    {ringDrawingCanConfirm}
    {knifeCanConfirm}
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
    {surveyResult}
    {surveyPointA}
    {surveyPointB}
    {cursorGeo}
  />
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

  .map-svg:focus-visible {
    outline: 2px solid #00ccff;
    outline-offset: -2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
