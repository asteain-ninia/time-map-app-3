<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
  import { eventBus } from '@application/EventBus';
  import type { Layer } from '@domain/entities/Layer';

  const manageLayers = new ManageLayersUseCase();

  /** リアクティブなレイヤー一覧 */
  let layers = $state<readonly Layer[]>(manageLayers.getLayers());
  let nextId = $state(1);

  /** レイヤー追加 */
  function addLayer(): void {
    const id = `layer-${nextId}`;
    const name = `レイヤー ${nextId}`;
    nextId++;
    manageLayers.addLayer(id, name);
    layers = manageLayers.getLayers();
  }

  /** 表示/非表示切替 */
  function toggleVisibility(layerId: string): void {
    manageLayers.toggleVisibility(layerId);
    layers = manageLayers.getLayers();
  }

  /** 透明度変更 */
  function onOpacityChange(layerId: string, e: Event): void {
    const value = parseFloat((e.target as HTMLInputElement).value);
    manageLayers.setOpacity(layerId, value);
    layers = manageLayers.getLayers();
  }

  /** 外部からの表示切替イベントに追従 */
  const unsubVisibility = eventBus.on('layer:visibilityChanged', () => {
    layers = manageLayers.getLayers();
  });

  onDestroy(() => {
    unsubVisibility();
  });
</script>

<div class="layer-panel">
  <div class="layer-header">
    <span class="layer-title">レイヤー</span>
    <button class="add-button" onclick={addLayer} title="レイヤーを追加">＋</button>
  </div>

  {#if layers.length === 0}
    <div class="empty-message">レイヤーはまだありません</div>
  {:else}
    <ul class="layer-list">
      {#each layers as layer (layer.id)}
        <li class="layer-item" class:hidden={!layer.visible}>
          <button
            class="visibility-toggle"
            onclick={() => toggleVisibility(layer.id)}
            title={layer.visible ? '非表示にする' : '表示する'}
          >
            {layer.visible ? '👁' : '—'}
          </button>
          <span class="layer-name">{layer.name}</span>
          <input
            type="range"
            class="opacity-slider"
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity}
            oninput={(e) => onOpacityChange(layer.id, e)}
            title="透明度: {Math.round(layer.opacity * 100)}%"
          />
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

  .layer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .layer-title {
    font-size: 12px;
    font-weight: bold;
    color: #ccc;
  }

  .add-button {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 3px;
    color: #ccc;
    cursor: pointer;
    font-size: 14px;
  }

  .add-button:hover {
    background: #4c4c4c;
  }

  .layer-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .layer-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 3px;
    background: #2d2d2d;
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

  .layer-name {
    flex: 1;
    font-size: 12px;
    color: #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opacity-slider {
    width: 60px;
    height: 3px;
    accent-color: #007acc;
  }

  .empty-message {
    color: #888;
    font-size: 12px;
    text-align: center;
    padding: 24px 8px;
  }
</style>
