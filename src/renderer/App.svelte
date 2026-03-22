<script lang="ts">
  import { onDestroy } from 'svelte';
  import Toolbar from '@presentation/components/Toolbar.svelte';
  import MapCanvas from '@presentation/components/MapCanvas.svelte';
  import Sidebar from '@presentation/components/Sidebar.svelte';
  import TimelinePanel from '@presentation/components/TimelinePanel.svelte';
  import StatusBar from '@presentation/components/StatusBar.svelte';
  import { createToolStore } from '@presentation/state/toolStore';
  import { addFeature, manageLayers, navigateTime } from '@presentation/state/appState';
  import { eventBus } from '@application/EventBus';
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';
  import { hitTest } from '@infrastructure/rendering/hitTestUtils';

  // --- ツール状態 ---

  const toolStore = createToolStore((addToolType, coords) => {
    // 描画確定時のコールバック
    const layers = manageLayers.getLayers();
    if (layers.length === 0) return;
    const layerId = layers[0].id;
    const time = navigateTime.getCurrentTime();

    if (addToolType === 'point' && coords.length >= 1) {
      addFeature.addPoint(coords[0], layerId, time);
    } else if (addToolType === 'line' && coords.length >= 2) {
      addFeature.addLine(coords, layerId, time);
    } else if (addToolType === 'polygon' && coords.length >= 3) {
      addFeature.addPolygon(coords, layerId, time);
    }
    refreshFeatureData();
  });

  // --- リアクティブ状態 ---

  let toolMode = $state<ToolMode>('view');
  let addToolType = $state<AddToolType>('polygon');
  let isDrawing = $state(false);
  let drawingCoords = $state<readonly Coordinate[]>([]);
  let features = $state<readonly Feature[]>([]);
  let vertices = $state<ReadonlyMap<string, Vertex>>(new Map());
  let layers = $state<readonly Layer[]>([]);
  let currentTime = $state(navigateTime.getCurrentTime());
  let selectedFeatureId = $state<string | null>(null);

  /** ツールストアの状態をリアクティブ変数に同期する */
  function syncToolState(): void {
    const snap = toolStore.getSnapshot();
    toolMode = snap.mode;
    addToolType = snap.addToolType;
    isDrawing = snap.isDrawing;
    drawingCoords = snap.drawingCoords;
  }

  /** 地物データを更新する */
  function refreshFeatureData(): void {
    features = addFeature.getFeatures();
    vertices = addFeature.getVertices();
  }

  /** レイヤーデータを更新する */
  function refreshLayerData(): void {
    layers = manageLayers.getLayers();
  }

  // --- 初期レイヤー（デフォルト1つ） ---
  if (manageLayers.getLayers().length === 0) {
    manageLayers.addLayer('default', 'レイヤー1');
  }
  refreshLayerData();

  // --- イベントバス購読 ---

  const unsubFeatureAdded = eventBus.on('feature:added', () => {
    refreshFeatureData();
  });

  const unsubTimeChanged = eventBus.on('time:changed', (e) => {
    currentTime = e.time;
  });

  const unsubLayerVisibility = eventBus.on('layer:visibilityChanged', () => {
    refreshLayerData();
  });

  onDestroy(() => {
    unsubFeatureAdded();
    unsubTimeChanged();
    unsubLayerVisibility();
    toolStore.stop();
  });

  // --- コールバック ---

  function onModeChange(mode: ToolMode): void {
    toolStore.send({ type: 'MODE_CHANGE', mode });
    selectedFeatureId = null;
    syncToolState();
  }

  function onAddToolChange(toolType: AddToolType): void {
    toolStore.send({ type: 'SET_ADD_TOOL', toolType });
    syncToolState();
  }

  /** ヒットテスト閾値（度単位、ズームに反比例） */
  function getHitThreshold(): number {
    return 5 / (toolStore.getSnapshot().isPanning ? 1 : 1);
  }

  function onMapClick(coord: Coordinate): void {
    if (toolMode === 'add') {
      toolStore.send({ type: 'MAP_CLICK', coord });
      syncToolState();
      // 点ツール: 即座にポイント追加
      if (addToolType === 'point') {
        const layerList = manageLayers.getLayers();
        if (layerList.length > 0) {
          addFeature.addPoint(coord, layerList[0].id, navigateTime.getCurrentTime());
          refreshFeatureData();
        }
      }
    } else if (toolMode === 'view' || toolMode === 'edit') {
      // ヒットテストで地物選択
      const result = hitTest(
        coord,
        features,
        vertices,
        layers,
        currentTime,
        getHitThreshold()
      );
      selectedFeatureId = result?.featureId ?? null;
    }
  }

  function onMapDoubleClick(coord: Coordinate): void {
    if (toolMode === 'add' && isDrawing) {
      toolStore.send({ type: 'MAP_DOUBLE_CLICK', coord });
      syncToolState();
    }
  }

  function onPanStart(): void {
    toolStore.send({ type: 'PAN_START' });
    syncToolState();
  }

  function onPanEnd(): void {
    toolStore.send({ type: 'PAN_END' });
    syncToolState();
  }

  function onConfirm(): void {
    if (isDrawing) {
      toolStore.send({ type: 'CONFIRM' });
      syncToolState();
    }
  }

  function onCancel(): void {
    if (isDrawing) {
      toolStore.send({ type: 'KEY_ESCAPE' });
      syncToolState();
    }
  }

  /** キーボードイベント */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (isDrawing) {
        toolStore.send({ type: 'KEY_ESCAPE' });
        syncToolState();
      } else {
        selectedFeatureId = null;
      }
    }
    if (e.ctrlKey && e.key === 'z' && isDrawing) {
      toolStore.send({ type: 'UNDO_VERTEX' });
      syncToolState();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="app-layout">
  <div class="toolbar-area">
    <Toolbar
      mode={toolMode}
      {addToolType}
      {onModeChange}
      {onAddToolChange}
    />
  </div>
  <div class="main-area">
    <div class="map-and-sidebar">
      <div class="map-area">
        <MapCanvas
          {features}
          {vertices}
          {layers}
          {currentTime}
          {toolMode}
          {isDrawing}
          {drawingCoords}
          {selectedFeatureId}
          {onMapClick}
          {onMapDoubleClick}
          {onPanStart}
          {onPanEnd}
          {onConfirm}
          {onCancel}
        />
      </div>
      <div class="sidebar-area">
        <Sidebar />
      </div>
    </div>
    <div class="bottom-area">
      <TimelinePanel />
      <StatusBar />
    </div>
  </div>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(html, body, #app) {
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: 'Meiryo UI', 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #e0e0e0;
    background: #1e1e1e;
  }

  .app-layout {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .toolbar-area {
    width: 48px;
    min-width: 48px;
    height: 100%;
    background: #252526;
    border-right: 1px solid #3c3c3c;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .map-and-sidebar {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .map-area {
    flex: 1;
    min-width: 0;
    position: relative;
    background: #1a1a2e;
  }

  .sidebar-area {
    width: 280px;
    min-width: 280px;
    background: #252526;
    border-left: 1px solid #3c3c3c;
    overflow-y: auto;
  }

  .bottom-area {
    background: #252526;
    border-top: 1px solid #3c3c3c;
  }
</style>
