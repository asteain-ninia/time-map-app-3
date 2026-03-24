<script lang="ts">
  import { onDestroy } from 'svelte';
  import Toolbar from '@presentation/components/Toolbar.svelte';
  import MapCanvas from '@presentation/components/MapCanvas.svelte';
  import Sidebar from '@presentation/components/Sidebar.svelte';
  import TimelinePanel from '@presentation/components/TimelinePanel.svelte';
  import StatusBar from '@presentation/components/StatusBar.svelte';
  import { createToolStore } from '@presentation/state/toolStore';
  import { addFeature, manageLayers, navigateTime, saveLoad, undoRedo, vertexEdit } from '@presentation/state/appState';
  import { AddFeatureCommand } from '@application/commands/AddFeatureCommand';
  import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
  import { eventBus } from '@application/EventBus';
  import { Coordinate } from '@domain/value-objects/Coordinate';
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';
  import { hitTest } from '@infrastructure/rendering/hitTestUtils';
  import {
    startDrag,
    startInsertDrag,
    updateDragPreview,
    hasMoved,
    type DragState,
  } from '@infrastructure/rendering/vertexDragManager';
  import {
    buildSnapIndicator,
    type SnapIndicator,
  } from '@infrastructure/rendering/snapIndicatorUtils';
  import {
    findSnapCandidates,
    screenToWorldSnapDistance,
  } from '@domain/services/SharedVertexService';

  // --- ツール状態 ---

  const toolStore = createToolStore((addToolType, coords) => {
    // 描画確定時のコールバック — UndoRedoManager経由で実行
    const layers = manageLayers.getLayers();
    if (layers.length === 0) return;
    const layerId = layers[0].id;
    const time = navigateTime.getCurrentTime();

    if (addToolType === 'point' && coords.length >= 1) {
      undoRedo.execute(new AddFeatureCommand(addFeature, { type: 'point', coord: coords[0], layerId, time }));
    } else if (addToolType === 'line' && coords.length >= 2) {
      undoRedo.execute(new AddFeatureCommand(addFeature, { type: 'line', coords, layerId, time }));
    } else if (addToolType === 'polygon' && coords.length >= 3) {
      undoRedo.execute(new AddFeatureCommand(addFeature, { type: 'polygon', coords, layerId, time }));
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
  let selectedVertexIds = $state<ReadonlySet<string>>(new Set());
  let dragState = $state<DragState | null>(null);
  let sharedGroups = $state(addFeature.getSharedVertexGroups());
  let snapIndicator = $state<SnapIndicator | null>(null);

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
    sharedGroups = addFeature.getSharedVertexGroups();
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

  const unsubWorldLoaded = eventBus.on('world:loaded', () => {
    refreshFeatureData();
    refreshLayerData();
    selectedFeatureId = null;
  });

  onDestroy(() => {
    unsubFeatureAdded();
    unsubTimeChanged();
    unsubLayerVisibility();
    unsubWorldLoaded();
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
      // 点ツール: 即座にポイント追加（Undo対応）
      if (addToolType === 'point') {
        const layerList = manageLayers.getLayers();
        if (layerList.length > 0) {
          undoRedo.execute(new AddFeatureCommand(addFeature, {
            type: 'point', coord, layerId: layerList[0].id, time: navigateTime.getCurrentTime()
          }));
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
      selectedVertexIds = new Set();
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

  /** 頂点ハンドルのmousedown — 頂点選択＋ドラッグ開始 */
  function onVertexMouseDown(vertexId: string, e: MouseEvent): void {
    if (e.shiftKey) {
      // Shift+クリック: 頂点選択トグル（ドラッグなし）
      const next = new Set(selectedVertexIds);
      if (next.has(vertexId)) {
        next.delete(vertexId);
      } else {
        next.add(vertexId);
      }
      selectedVertexIds = next;
      return;
    }

    // ドラッグ開始
    selectedVertexIds = new Set([vertexId]);
    const vertex = vertices.get(vertexId);
    if (vertex) {
      dragState = startDrag(vertexId, vertex.coordinate);
    }
  }

  /** エッジハンドルのmousedown — 頂点挿入＋ドラッグ開始 */
  function onEdgeHandleMouseDown(v1: string, v2: string, e: MouseEvent): void {
    if (!selectedFeatureId || !currentTime) return;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (!feature) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) return;

    // エッジの中点に頂点を挿入
    const vtx1 = vertices.get(v1);
    const vtx2 = vertices.get(v2);
    if (!vtx1 || !vtx2) return;

    const midCoord = new Coordinate(
      (vtx1.x + vtx2.x) / 2,
      (vtx1.y + vtx2.y) / 2
    );

    let newVertexId: string | null = null;
    try {
      if (anchor.shape.type === 'LineString') {
        const edgeIndex = anchor.shape.vertexIds.indexOf(v1);
        if (edgeIndex >= 0) {
          newVertexId = vertexEdit.insertVertexOnLine(
            selectedFeatureId, currentTime, edgeIndex, midCoord
          );
        }
      } else if (anchor.shape.type === 'Polygon') {
        for (const ring of anchor.shape.rings) {
          const ids = ring.vertexIds;
          for (let i = 0; i < ids.length; i++) {
            const next = (i + 1) % ids.length;
            if (ids[i] === v1 && ids[next] === v2) {
              newVertexId = vertexEdit.insertVertexOnPolygon(
                selectedFeatureId, currentTime, ring.id, i, midCoord
              );
              break;
            }
          }
          if (newVertexId) break;
        }
      }
    } catch {
      return;
    }

    if (newVertexId) {
      refreshFeatureData();
      selectedVertexIds = new Set([newVertexId]);
      dragState = startInsertDrag(newVertexId, midCoord);
    }
  }

  /** ドラッグ完了 */
  function commitDrag(): void {
    if (!dragState) return;
    if (hasMoved(dragState)) {
      // ドラッグ中に直接移動していたので、まず元に戻す
      vertexEdit.moveVertex(dragState.vertexId, dragState.startCoord);
      // Undo対応コマンドで正式に移動
      undoRedo.execute(
        new MoveVertexCommand(vertexEdit, addFeature, dragState.vertexId, dragState.previewCoord)
      );
      refreshFeatureData();
    }
    dragState = null;
    snapIndicator = null;
  }

  /** カーソル座標更新コールバック（MapCanvasから呼ばれる） */
  function onCursorGeoUpdate(geo: { lon: number; lat: number }): void {
    if (dragState) {
      const newCoord = new Coordinate(geo.lon, geo.lat);
      dragState = updateDragPreview(dragState, newCoord);
      // リアルタイムプレビュー: 実際の頂点を仮移動
      vertexEdit.moveVertex(dragState.vertexId, newCoord);

      // スナップ候補を検索（ドラッグ中の頂点を除外）
      const snapDist = screenToWorldSnapDistance(50, window.innerWidth, 1);
      const candidates = findSnapCandidates(
        geo.lon, geo.lat, vertices,
        new Set([dragState.vertexId]),
        snapDist
      );
      snapIndicator = buildSnapIndicator(candidates, vertices, sharedGroups);

      refreshFeatureData();
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
        selectedVertexIds = new Set();
      }
    }
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      if (isDrawing) {
        toolStore.send({ type: 'UNDO_VERTEX' });
        syncToolState();
      } else {
        // §2.3.1: 汎用Undo
        undoRedo.undo();
        refreshFeatureData();
        refreshLayerData();
      }
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      // §2.3.1: 汎用Redo
      undoRedo.redo();
      refreshFeatureData();
      refreshLayerData();
    }
    // §2.5: Ctrl+S で保存、Ctrl+O で開く
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveLoad.save();
    }
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      saveLoad.open();
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
          {addToolType}
          {isDrawing}
          {drawingCoords}
          {selectedFeatureId}
          {selectedVertexIds}
          {sharedGroups}
          {snapIndicator}
          {onMapClick}
          {onMapDoubleClick}
          {onPanStart}
          {onPanEnd}
          {onConfirm}
          {onCancel}
          {onVertexMouseDown}
          {onEdgeHandleMouseDown}
          {onCursorGeoUpdate}
          onDragEnd={commitDrag}
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
