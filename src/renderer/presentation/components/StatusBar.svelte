<script lang="ts">
  import { onDestroy } from 'svelte';
  import { eventBus } from '@application/EventBus';

  let cursorLon = $state<number | null>(null);
  let cursorLat = $state<number | null>(null);
  let zoomLevel = $state(1.0);

  const unsubCursorMoved = eventBus.on('cursor:moved', (e) => {
    cursorLon = e.lon;
    cursorLat = e.lat;
  });

  const unsubCursorLeft = eventBus.on('cursor:left', () => {
    cursorLon = null;
    cursorLat = null;
  });

  const unsubZoom = eventBus.on('viewport:zoomChanged', (e) => {
    zoomLevel = e.zoom;
  });

  onDestroy(() => {
    unsubCursorMoved();
    unsubCursorLeft();
    unsubZoom();
  });

  function formatCoord(value: number, posLabel: string, negLabel: string): string {
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = Math.round(((abs - deg) * 60 - min) * 60);
    const dir = value >= 0 ? posLabel : negLabel;
    return `${deg}°${min}'${sec}" ${dir}`;
  }
</script>

<div class="status-bar">
  <div class="status-section">
    {#if cursorLon !== null && cursorLat !== null}
      <span class="status-item">
        {formatCoord(cursorLat, 'N', 'S')}, {formatCoord(cursorLon, 'E', 'W')}
      </span>
      <span class="status-item">
        ({cursorLat.toFixed(4)}°, {cursorLon.toFixed(4)}°)
      </span>
    {:else}
      <span class="status-item status-dim">カーソル座標: --</span>
    {/if}
  </div>
  <div class="status-section">
    <span class="status-item">ズーム: {zoomLevel.toFixed(1)}x</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    padding: 2px 16px;
    background: #007acc;
    color: #ffffff;
    font-size: 11px;
  }

  .status-section {
    display: flex;
    gap: 16px;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-dim {
    opacity: 0.7;
  }
</style>
