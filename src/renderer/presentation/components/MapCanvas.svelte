<script lang="ts">
  import { ViewportManager } from '@infrastructure/ViewportManager';
  import { eventBus } from '@application/EventBus';
  import GridRenderer from './GridRenderer.svelte';

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
    // 左ボタン（表示モード）または中ボタンでパン開始
    if (e.button === 0 || e.button === 1) {
      isPanning = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
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
    isPanning = false;
  }

  function onMouseLeave(_e: MouseEvent): void {
    isPanning = false;
    cursorGeo = null;
    eventBus.emit('cursor:left', {});
  }
</script>

<div
  class="map-container"
  bind:this={containerEl}
  role="application"
  aria-label="地図表示"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    class="map-svg"
    viewBox={viewBox}
    preserveAspectRatio="xMidYMid meet"
    onwheel={onWheel}
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={onMouseLeave}
  >
    <!-- 海の背景 -->
    <rect x="0" y="0" width="360" height="180" fill="#1a1a2e" />

    <!-- ベースマップ -->
    <g transform="scale({360 / 4243.4}, {180 / 2121.7})">
      {@html baseMapContent}
    </g>

    <!-- グリッド線 -->
    <GridRenderer zoom={zoomLevel} />
  </svg>

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
    cursor: grab;
    position: relative;
  }

  .map-container:active {
    cursor: grabbing;
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
</style>
