<script lang="ts">
  import type { GridOverlayViewBox } from './gridLabelsOverlayUtils';
  import {
    buildVisibleLatitudeLabels,
    buildVisibleLongitudeLabels,
  } from './gridLabelsOverlayUtils';

  let {
    viewBox,
    viewWidthPx = 0,
    viewHeightPx = 0,
    interval = 10,
  }: {
    viewBox: GridOverlayViewBox;
    viewWidthPx?: number;
    viewHeightPx?: number;
    interval?: number;
  } = $props();

  let longitudeLabels = $derived(
    buildVisibleLongitudeLabels(viewBox, viewWidthPx, interval)
  );

  let latitudeLabels = $derived(
    buildVisibleLatitudeLabels(viewBox, viewHeightPx, interval)
  );
</script>

<div class="grid-labels-overlay" aria-hidden="true">
  {#each longitudeLabels as label, index (`lon-${index}-${label.text}`)}
    <div
      class="grid-label longitude-label"
      style:left={`${label.px}px`}
    >
      {label.text}
    </div>
  {/each}

  {#each latitudeLabels as label, index (`lat-${index}-${label.text}`)}
    <div
      class="grid-label latitude-label"
      style:top={`${label.px}px`}
    >
      {label.text}
    </div>
  {/each}
</div>

<style>
  .grid-labels-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .grid-label {
    position: absolute;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(18, 18, 24, 0.58);
    color: rgba(232, 232, 232, 0.72);
    font-size: 10px;
    line-height: 1.1;
    white-space: nowrap;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  }

  .longitude-label {
    bottom: 18px;
    transform: translateX(-50%);
  }

  .latitude-label {
    left: 6px;
    transform: translateY(-50%);
  }
</style>
