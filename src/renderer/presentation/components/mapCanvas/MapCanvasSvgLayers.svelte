<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { Layer } from '@domain/entities/Layer';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { WorldSettings } from '@domain/entities/World';
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { SnapIndicator } from '@infrastructure/rendering/snapIndicatorUtils';
  import type { SurveyMeasurement } from '@infrastructure/rendering/surveyModeManager';
  import type { AddToolType, ToolMode } from '@presentation/state/toolMachine';
  import type { MapCanvasVertexHandleEntry } from '../mapCanvasUtils';
  import DrawingPreview from '../DrawingPreview.svelte';
  import FeatureRenderer from '../FeatureRenderer.svelte';
  import GridRenderer from '../GridRenderer.svelte';
  import MeasurementOverlay from '../MeasurementOverlay.svelte';
  import VertexHandles from '../VertexHandles.svelte';

  let {
    wrapOffsets = [0] as readonly number[],
    baseMapContent = '',
    baseMapTransform = 'matrix(0.08483762926992506 0 0 0.08483762926992506 0 0)',
    currentTime = undefined as TimePoint | undefined,
    features = [] as readonly Feature[],
    vertices = new Map<string, Vertex>() as ReadonlyMap<string, Vertex>,
    layers = [] as readonly Layer[],
    focusedLayerId = null as string | null,
    settings = undefined as WorldSettings | undefined,
    gridInterval = 10,
    gridColor = '#888888',
    gridOpacity = 0.3,
    zoomLevel = 1,
    viewWidthPx = 800,
    labelAreaThreshold = 0.0005,
    selectedFeatureId = null as string | null,
    vertexSelectionContextFeatureId = null as string | null,
    isDrawing = false,
    showVertexHandles = true,
    vertexHandleEntries = [] as readonly MapCanvasVertexHandleEntry[],
    selectedVertexIds = new Set<string>() as ReadonlySet<string>,
    sharedGroups = new Map<string, SharedVertexGroup>() as ReadonlyMap<string, SharedVertexGroup>,
    snapIndicators = [] as readonly SnapIndicator[],
    suppressPassiveVertexHandles = false,
    drawingCoords = [] as readonly Coordinate[],
    addToolType = 'polygon' as AddToolType,
    cursorGeo = null as { lon: number; lat: number } | null,
    isRingDrawing = false,
    ringDrawingCoords = [] as readonly Coordinate[],
    isKnifeDrawing = false,
    knifeDrawingCoords = [] as readonly Coordinate[],
    toolMode = 'view' as ToolMode,
    surveyMeasurements = [] as readonly SurveyMeasurement[],
    surveyPointA = null as Coordinate | null,
    surveyPointB = null as Coordinate | null,
    boxSelectBox = null as { minX: number; minY: number; maxX: number; maxY: number } | null,
    onVertexMouseDown,
    onVertexActivate,
    onEdgeHandleMouseDown,
    onEdgeHandleActivate,
  }: {
    wrapOffsets?: readonly number[];
    baseMapContent?: string;
    baseMapTransform?: string;
    currentTime?: TimePoint;
    features?: readonly Feature[];
    vertices?: ReadonlyMap<string, Vertex>;
    layers?: readonly Layer[];
    focusedLayerId?: string | null;
    settings?: WorldSettings;
    gridInterval?: number;
    gridColor?: string;
    gridOpacity?: number;
    zoomLevel?: number;
    viewWidthPx?: number;
    labelAreaThreshold?: number;
    selectedFeatureId?: string | null;
    vertexSelectionContextFeatureId?: string | null;
    isDrawing?: boolean;
    showVertexHandles?: boolean;
    vertexHandleEntries?: readonly MapCanvasVertexHandleEntry[];
    selectedVertexIds?: ReadonlySet<string>;
    sharedGroups?: ReadonlyMap<string, SharedVertexGroup>;
    snapIndicators?: readonly SnapIndicator[];
    suppressPassiveVertexHandles?: boolean;
    drawingCoords?: readonly Coordinate[];
    addToolType?: AddToolType;
    cursorGeo?: { lon: number; lat: number } | null;
    isRingDrawing?: boolean;
    ringDrawingCoords?: readonly Coordinate[];
    isKnifeDrawing?: boolean;
    knifeDrawingCoords?: readonly Coordinate[];
    toolMode?: ToolMode;
    surveyMeasurements?: readonly SurveyMeasurement[];
    surveyPointA?: Coordinate | null;
    surveyPointB?: Coordinate | null;
    boxSelectBox?: { minX: number; minY: number; maxX: number; maxY: number } | null;
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
  } = $props();
</script>

<g class="wrap-background-layer" pointer-events="none">
  {#each wrapOffsets as offset}
    <g class="wrap-background-tile" transform="translate({offset}, 0)">
      <rect x="0" y="0" width="360" height="180" fill="#1a1a2e" />
    </g>
  {/each}
</g>

<g class="wrap-base-map-layer" pointer-events="none" style="user-select: none;">
  {#each wrapOffsets as offset}
    <g class="base-map-layer" transform="translate({offset}, 0)">
      <g transform={baseMapTransform}>
        {@html baseMapContent}
      </g>
    </g>
  {/each}
</g>

{#if currentTime}
  <g class="wrap-feature-layer">
    {#each wrapOffsets as offset}
      <g class="wrap-feature-tile" transform="translate({offset}, 0)">
        <FeatureRenderer
          {features}
          {vertices}
          {layers}
          {focusedLayerId}
          {currentTime}
          {settings}
          zoom={zoomLevel}
          {labelAreaThreshold}
          {selectedFeatureId}
          contextFeatureId={vertexSelectionContextFeatureId}
        />
      </g>
    {/each}
  </g>
{/if}

<g class="wrap-grid-layer">
  {#each wrapOffsets as offset}
    <g class="wrap-grid-tile" transform="translate({offset}, 0)">
      <GridRenderer
        zoom={zoomLevel}
        interval={gridInterval}
        color={gridColor}
        opacity={gridOpacity}
        isPrimaryWrap={offset === 0}
      />
    </g>
  {/each}
</g>

<g class="wrap-measurement-layer">
  {#each wrapOffsets as offset}
    <g class="wrap-measurement-tile" transform="translate({offset}, 0)">
      {#each surveyMeasurements as measurement}
        <MeasurementOverlay
          pointA={measurement.pointA}
          pointB={measurement.pointB}
          result={measurement.result}
          zoom={zoomLevel}
          isPrimaryWrap={offset === 0}
        />
      {/each}

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
</g>

<g class="wrap-edit-overlay-layer">
  {#each wrapOffsets as offset}
    <g class="wrap-edit-overlay-tile" transform="translate({offset}, 0)">
      {#if !isDrawing && showVertexHandles}
        {#each vertexHandleEntries as entry (entry.featureId)}
          <VertexHandles
            anchor={entry.anchor}
            {vertices}
            zoom={zoomLevel}
            {viewWidthPx}
            {selectedVertexIds}
            {sharedGroups}
            {snapIndicators}
            showEdgeHandles={!suppressPassiveVertexHandles && entry.showEdgeHandles}
            visibleVertexIds={suppressPassiveVertexHandles ? selectedVertexIds : undefined}
            {onVertexMouseDown}
            {onVertexActivate}
            {onEdgeHandleMouseDown}
            {onEdgeHandleActivate}
          />
        {/each}
      {/if}

      {#if isDrawing && drawingCoords.length > 0}
        <DrawingPreview
          coords={drawingCoords}
          zoom={zoomLevel}
          cursorGeo={cursorGeo}
          isPolygon={addToolType === 'polygon'}
        />
      {/if}

      {#if isRingDrawing && ringDrawingCoords.length > 0}
        <DrawingPreview
          coords={ringDrawingCoords}
          zoom={zoomLevel}
          cursorGeo={cursorGeo}
          isPolygon={true}
        />
      {/if}

      {#if isKnifeDrawing && knifeDrawingCoords.length > 0}
        <DrawingPreview
          coords={knifeDrawingCoords}
          zoom={zoomLevel}
          cursorGeo={cursorGeo}
          isPolygon={false}
        />
      {/if}
    </g>
  {/each}
</g>

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
