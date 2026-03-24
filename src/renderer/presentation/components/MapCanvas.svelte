<script lang="ts">
  import { ViewportManager } from '@infrastructure/ViewportManager';
  import { eventBus } from '@application/EventBus';
  import { Coordinate } from '@domain/value-objects/Coordinate';
  import GridRenderer from './GridRenderer.svelte';
  import FeatureRenderer from './FeatureRenderer.svelte';
  import DrawingPreview from './DrawingPreview.svelte';
  import VertexHandles from './VertexHandles.svelte';
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';

  let {
    features = [] as readonly Feature[],
    vertices = new Map<string, Vertex>() as ReadonlyMap<string, Vertex>,
    layers = [] as readonly Layer[],
    currentTime = undefined as TimePoint | undefined,
    toolMode = 'view' as ToolMode,
    addToolType = 'polygon' as AddToolType,
    isDrawing = false,
    drawingCoords = [] as readonly Coordinate[],
    selectedFeatureId = null as string | null,
    selectedVertexIds = new Set<string>() as ReadonlySet<string>,
    onMapClick,
    onMapDoubleClick,
    onPanStart,
    onPanEnd,
    onConfirm,
    onCancel,
    onVertexMouseDown,
    onEdgeHandleMouseDown,
  }: {
    features?: readonly Feature[];
    vertices?: ReadonlyMap<string, Vertex>;
    layers?: readonly Layer[];
    currentTime?: TimePoint;
    toolMode?: ToolMode;
    addToolType?: AddToolType;
    isDrawing?: boolean;
    drawingCoords?: readonly Coordinate[];
    selectedFeatureId?: string | null;
    selectedVertexIds?: ReadonlySet<string>;
    onMapClick?: (coord: Coordinate) => void;
    onMapDoubleClick?: (coord: Coordinate) => void;
    onPanStart?: () => void;
    onPanEnd?: () => void;
    onConfirm?: () => void;
    onCancel?: () => void;
    onVertexMouseDown?: (vertexId: string, e: MouseEvent) => void;
    onEdgeHandleMouseDown?: (vertexId1: string, vertexId2: string, e: MouseEvent) => void;
  } = $props();

  /** 描画確定可能か（線:2点以上、面:3点以上） */
  let canConfirm = $derived(isDrawing && drawingCoords.length >= 2);

  /** 選択地物のアンカー（頂点ハンドル表示用） */
  let selectedAnchor = $derived(() => {
    if (!selectedFeatureId || !currentTime) return null;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (!feature) return null;
    return feature.getActiveAnchor(currentTime);
  });

  const viewport = new ViewportManager();

  let containerEl = $state<HTMLDivElement | null>(null);
  let viewBox = $state(viewport.getViewBox());
  let zoomLevel = $state(viewport.getZoom());
  let isPanning = $state(false);
  let lastPanX = $state(0);
  let lastPanY = $state(0);
  let cursorGeo = $state<{ lon: number; lat: number } | null>(null);

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
        viewBox = viewport.getViewBox();
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
    toolMode === 'view' ? 'grab' :
    toolMode === 'add' ? 'crosshair' :
    'default'
  );

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    viewport.zoomAtCursor(-e.deltaY, x, y);
    viewBox = viewport.getViewBox();
    zoomLevel = viewport.getZoom();
    eventBus.emit('viewport:zoomChanged', { zoom: zoomLevel });
  }

  function onMouseDown(e: MouseEvent): void {
    if (canPan(e.button)) {
      isPanning = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      onPanStart?.();
      e.preventDefault();
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
    }

    if (isPanning) {
      const dx = e.clientX - lastPanX;
      const dy = e.clientY - lastPanY;
      viewport.pan(dx, dy);
      viewBox = viewport.getViewBox();
      lastPanX = e.clientX;
      lastPanY = e.clientY;
    }
  }

  function onMouseUp(_e: MouseEvent): void {
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
    // パン中やパン直後はクリックとして扱わない
    if (e.button !== 0) return;
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;
    const geo = viewport.screenToGeo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    onMapClick?.(new Coordinate(geo.lon, geo.lat));
  }

  function onDblClick(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = containerEl?.getBoundingClientRect();
    if (!rect) return;
    const geo = viewport.screenToGeo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    onMapDoubleClick?.(new Coordinate(geo.lon, geo.lat));
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
    <!-- 海の背景 -->
    <rect x="0" y="0" width="360" height="180" fill="#1a1a2e" />

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
      />
    {/if}

    <!-- 頂点ハンドル・エッジハンドル（選択地物の編集用） -->
    {#if selectedAnchor() && !isDrawing}
      <VertexHandles
        anchor={selectedAnchor()!}
        {vertices}
        zoom={zoomLevel}
        {selectedVertexIds}
        {onVertexMouseDown}
        {onEdgeHandleMouseDown}
      />
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

    <!-- グリッド線 -->
    <GridRenderer zoom={zoomLevel} />
  </svg>

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
</style>
