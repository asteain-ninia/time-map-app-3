<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getContainer } from '@infrastructure/DIContainer';
  import { eventBus } from '@application/EventBus';
  import type { Layer } from '@domain/entities/Layer';

  const {
    commands: { manageLayers },
    queries: { layers: layerQueries },
  } = getContainer();

  let {
    focusedLayerId = null as string | null,
    onFocusLayerChange,
  }: {
    focusedLayerId?: string | null;
    onFocusLayerChange?: (layerId: string | null) => void;
  } = $props();

  /** リアクティブなレイヤー一覧 */
  let layers = $state<readonly Layer[]>(layerQueries.getLayers());
  let orderedLayers = $derived([...layers].toSorted((left, right) => left.order - right.order));
  let focusedLayer = $derived(
    focusedLayerId ? orderedLayers.find((layer) => layer.id === focusedLayerId) ?? null : null
  );
  let focusSliderValue = $derived(
    Math.max(orderedLayers.findIndex((layer) => layer.id === focusedLayerId), 0)
  );

  /** 表示/非表示切替 */
  function toggleVisibility(layerId: string): void {
    manageLayers.toggleVisibility(layerId);
    layers = layerQueries.getLayers();
  }

  /** 透明度変更 */
  function onOpacityChange(layerId: string, e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    manageLayers.setOpacity(layerId, value);
    layers = layerQueries.getLayers();
  }

  function setFocusedLayer(layerId: string | null): void {
    onFocusLayerChange?.(layerId);
  }

  function onFocusSliderInput(e: Event): void {
    const index = parseInt((e.target as HTMLInputElement).value, 10);
    const layer = orderedLayers[index];
    setFocusedLayer(layer?.id ?? null);
  }

  /** 外部からのレイヤー更新イベントに追従 */
  const unsubLayersChanged = eventBus.on('layers:changed', () => {
    layers = layerQueries.getLayers();
  });

  onDestroy(() => {
    unsubLayersChanged();
  });
</script>

<div class="layer-panel">
  {#if orderedLayers.length > 0}
    <div class="focus-panel">
      <div class="focus-header">
        <span class="focus-title">表示フォーカス</span>
        <button
          class="focus-reset"
          type="button"
          disabled={!focusedLayerId}
          onclick={() => setFocusedLayer(null)}
        >
          全表示
        </button>
      </div>
      <input
        class="focus-slider"
        type="range"
        min="0"
        max={Math.max(orderedLayers.length - 1, 0)}
        step="1"
        value={focusSliderValue}
        oninput={onFocusSliderInput}
        disabled={orderedLayers.length <= 1}
      />
      <div class="focus-label">
        {#if focusedLayer}
          {focusedLayer.order + 1}: {focusedLayer.name}
        {:else}
          全レイヤー表示
        {/if}
      </div>
    </div>
  {/if}

  {#if layers.length === 0}
    <div class="empty-message">レイヤーはまだありません</div>
  {:else}
    <ul class="layer-list">
      {#each orderedLayers as layer (layer.id)}
        <li
          class="layer-item"
          class:hidden={!layer.visible}
          class:focused={focusedLayerId === layer.id}
        >
          <button
            class="visibility-toggle"
            onclick={() => toggleVisibility(layer.id)}
            title={layer.visible ? '非表示にする' : '表示する'}
          >
            {layer.visible ? '👁' : '—'}
          </button>
          <button class="layer-name-button" type="button" onclick={() => setFocusedLayer(layer.id)}>
            <span class="layer-order">#{layer.order + 1}</span>
            <span class="layer-name">{layer.name}</span>
          </button>
          <label class="opacity-control" title="不透明度: {Math.round(layer.opacity * 100)}%">
            <svg class="opacity-icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
            </svg>
            <span class="sr-only">不透明度</span>
            <input
              type="range"
              class="opacity-slider"
              min="0"
              max="1"
              step="0.05"
              value={layer.opacity}
              oninput={(e) => onOpacityChange(layer.id, e)}
            />
            <span class="opacity-value">{Math.round(layer.opacity * 100)}%</span>
          </label>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .layer-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .layer-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .focus-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    background: #252526;
  }

  .focus-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .focus-title,
  .focus-label {
    color: #aaa;
    font-size: 11px;
  }

  .focus-slider {
    width: 100%;
    accent-color: #007acc;
  }

  .focus-reset {
    padding: 2px 8px;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 999px;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
  }

  .focus-reset:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .layer-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 3px;
    background: #2d2d2d;
  }

  .layer-item.focused {
    outline: 1px solid rgba(0, 122, 204, 0.7);
    background: #21384a;
  }

  .layer-item.hidden {
    opacity: 0.5;
  }

  .visibility-toggle {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }

  .visibility-toggle:hover {
    color: #fff;
  }

  .layer-name-button {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .layer-order {
    color: #777;
    font-size: 10px;
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 12px;
    color: #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opacity-slider {
    width: 64px;
    height: 3px;
    accent-color: #007acc;
  }

  .opacity-control {
    display: grid;
    grid-template-columns: 16px 64px 34px;
    align-items: center;
    gap: 5px;
    color: #aaa;
    font-size: 11px;
  }

  .opacity-icon {
    width: 14px;
    height: 14px;
    color: #9cc9e8;
  }

  .opacity-value {
    font-variant-numeric: tabular-nums;
    color: #bbb;
    text-align: right;
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

  .empty-message {
    color: #888;
    font-size: 12px;
    text-align: center;
    padding: 24px 8px;
  }
</style>
