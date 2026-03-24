<script lang="ts">
  import { onDestroy } from 'svelte';
  import Toolbar from '@presentation/components/Toolbar.svelte';
  import MapCanvas from '@presentation/components/MapCanvas.svelte';
  import SplitConfirmModal from '@presentation/components/SplitConfirmModal.svelte';
  import MergeConfirmModal from '@presentation/components/MergeConfirmModal.svelte';
  import ConflictResolutionDialog from '@presentation/components/ConflictResolutionDialog.svelte';
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
  import {
    startRingDrawing,
    addRingVertex,
    undoRingVertex,
    canConfirmRing,
    type RingDrawingState,
  } from '@infrastructure/rendering/ringDrawingManager';
  import {
    startFeatureDrag,
    updateFeatureDrag,
    hasFeatureDragMoved,
    getFeatureDragDelta,
    type FeatureDragState,
  } from '@infrastructure/rendering/featureDragManager';
  import { MoveFeatureCommand } from '@application/commands/MoveFeatureCommand';
  import {
    startBoxSelect,
    updateBoxSelect,
    getSelectionBox,
    isBoxLargeEnough,
    findVerticesInBox,
    mergeSelection,
    type BoxSelectState,
  } from '@infrastructure/rendering/boxSelectManager';
  import {
    createSurveyState,
    addSurveyPoint,
    resetSurvey,
    computeSurveyResult,
    type SurveyModeState,
  } from '@infrastructure/rendering/surveyModeManager';
  import {
    startKnifeDrawing,
    addKnifeVertex,
    undoKnifeVertex,
    canConfirmKnife as canConfirmKnifeDrawing,
    type KnifeDrawingState,
  } from '@infrastructure/rendering/knifeDrawingManager';
  import { SplitFeatureCommand } from '@application/commands/SplitFeatureCommand';
  import { MergeFeatureCommand } from '@application/commands/MergeFeatureCommand';
  import type { SpatialConflict } from '@domain/services/ConflictDetectionService';
  import type { ConflictResolution } from '@application/AnchorEditDraft';
  import { addHoleRing, addExclaveRing } from '@domain/services/RingEditService';
  import { Vertex } from '@domain/entities/Vertex';
  import { Ring } from '@domain/value-objects/Ring';

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
  let ringDrawingState = $state<RingDrawingState | null>(null);
  let featureDragState = $state<FeatureDragState | null>(null);
  let knifeDrawingState = $state<KnifeDrawingState | null>(null);
  let showSplitModal = $state(false);
  let mergeTargetIds = $state<string[]>([]);
  let showMergeModal = $state(false);

  // --- 矩形選択 ---
  let boxSelectState = $state<BoxSelectState | null>(null);

  // --- 測量モード ---
  let surveyState = $state<SurveyModeState>(createSurveyState());
  let surveyResult = $derived(computeSurveyResult(surveyState));

  // --- 競合解決 ---
  let conflictDialogOpen = $state(false);
  let conflictList = $state<readonly SpatialConflict[]>([]);
  let conflictCurrentIndex = $state(0);
  let conflictResolutions = $state<readonly ConflictResolution[]>([]);
  let conflictError = $state('');
  /** 地物ドラッグの開始geo座標 */
  let featureDragStartGeo = $state<{ lon: number; lat: number } | null>(null);
  /** 地物ドラッグ中の前回geo座標（差分計算用） */
  let featureDragLastGeo = $state<{ lon: number; lat: number } | null>(null);

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
    surveyState = resetSurvey(surveyState);
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
    // ナイフ描画中はクリックで頂点追加
    if (knifeDrawingState) {
      knifeDrawingState = addKnifeVertex(knifeDrawingState, coord);
      return;
    }
    // リング描画中はクリックで頂点追加
    if (ringDrawingState) {
      ringDrawingState = addRingVertex(ringDrawingState, coord);
      return;
    }
    if (toolMode === 'measure') {
      surveyState = addSurveyPoint(surveyState, coord);
      return;
    }
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

  // --- リング描画（穴/飛び地追加） ---

  function onAddHole(): void {
    if (!selectedFeatureId) return;
    ringDrawingState = startRingDrawing('hole', selectedFeatureId);
  }

  function onAddExclave(): void {
    if (!selectedFeatureId) return;
    ringDrawingState = startRingDrawing('exclave', selectedFeatureId);
  }

  function onConfirmRing(): void {
    if (!ringDrawingState || !canConfirmRing(ringDrawingState) || !currentTime) return;

    const feature = features.find((f) => f.id === ringDrawingState!.featureId);
    if (!feature) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return;

    // 座標から頂点を作成
    const vertexMap = addFeature.getVertices() as Map<string, Vertex>;
    const newVertexIds: string[] = [];
    for (const coord of ringDrawingState.coords) {
      const id = `v-ring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      vertexMap.set(id, new Vertex(id, coord.normalize()));
      newVertexIds.push(id);
    }

    const newRingId = `ring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      let result;
      if (ringDrawingState.type === 'hole') {
        // 最初の領土リングを親にする
        const parentRing = anchor.shape.rings.find((r) => r.ringType === 'territory' && r.parentId === null);
        if (!parentRing) return;
        result = addHoleRing(anchor.shape.rings, parentRing.id, newRingId, newVertexIds);
      } else {
        // 飛び地: トップレベル（parentId=null）
        result = addExclaveRing(anchor.shape.rings, null, newRingId, newVertexIds);
      }

      const newAnchor = anchor.withShape({ type: 'Polygon', rings: result.rings });
      const newAnchors = feature.anchors.map((a) => a.id === anchor.id ? newAnchor : a);
      const updatedFeature = feature.withAnchors(newAnchors);
      (addFeature.getFeaturesMap() as Map<string, typeof feature>).set(feature.id, updatedFeature);
      refreshFeatureData();
    } catch {
      // バリデーションエラー
    }

    ringDrawingState = null;
  }

  function onCancelRing(): void {
    ringDrawingState = null;
  }

  // --- ナイフツール（分割） ---

  function onStartKnife(): void {
    if (!selectedFeatureId) return;
    knifeDrawingState = startKnifeDrawing(selectedFeatureId);
  }

  /** ナイフ描画の確定ボタン → 分割モーダルを表示 */
  function onConfirmKnife(): void {
    if (!knifeDrawingState) return;
    showSplitModal = true;
  }

  /** 分割モーダルで確定 → SplitFeatureCommand実行 */
  function onSplitConfirm(newName: string): void {
    if (!knifeDrawingState || !currentTime) return;

    const cuttingLine = knifeDrawingState.coords.map(c => ({ x: c.x, y: c.y }));

    undoRedo.execute(
      new SplitFeatureCommand(addFeature, {
        featureId: knifeDrawingState.featureId,
        cuttingLine,
        isClosed: knifeDrawingState.isClosed,
        currentTime,
        newFeatureName: newName,
      })
    );

    refreshFeatureData();
    knifeDrawingState = null;
    showSplitModal = false;
    selectedFeatureId = null;
  }

  function onCancelKnife(): void {
    knifeDrawingState = null;
    showSplitModal = false;
  }

  /** ナイフツールの確定可否を計算 */
  function getKnifeCanConfirm(): boolean {
    if (!knifeDrawingState || !selectedFeatureId || !currentTime) return false;
    const feature = features.find(f => f.id === selectedFeatureId);
    if (!feature) return false;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return false;

    const verts = addFeature.getVertices();
    const polygonRings = anchor.shape.rings.map(ring =>
      ring.vertexIds.map(vid => {
        const v = verts.get(vid);
        return v ? { x: v.x, y: v.y } : { x: 0, y: 0 };
      })
    );
    return canConfirmKnifeDrawing(knifeDrawingState, polygonRings);
  }

  // --- 結合ツール ---

  /** 結合対象に地物を追加する（Shift+クリックで複数選択） */
  function addMergeTarget(featureId: string): void {
    if (mergeTargetIds.includes(featureId)) {
      mergeTargetIds = mergeTargetIds.filter(id => id !== featureId);
    } else {
      mergeTargetIds = [...mergeTargetIds, featureId];
    }
  }

  /** 結合モーダルを表示 */
  function onStartMerge(): void {
    if (mergeTargetIds.length < 2) return;
    showMergeModal = true;
  }

  /** 結合実行 */
  function onMergeConfirm(mergedName: string): void {
    if (mergeTargetIds.length < 2 || !currentTime) return;

    undoRedo.execute(
      new MergeFeatureCommand(addFeature, {
        featureIds: mergeTargetIds,
        currentTime,
        mergedName,
      })
    );

    refreshFeatureData();
    showMergeModal = false;
    mergeTargetIds = [];
    selectedFeatureId = mergeTargetIds.length > 0 ? mergeTargetIds[0] : null;
  }

  function onCancelMerge(): void {
    showMergeModal = false;
  }

  function clearMergeTargets(): void {
    mergeTargetIds = [];
  }

  // --- 競合解決ダイアログ ---

  /** 競合解決ダイアログを開く */
  function openConflictDialog(conflicts: readonly SpatialConflict[]): void {
    conflictList = conflicts;
    conflictCurrentIndex = 0;
    conflictResolutions = [];
    conflictError = '';
    conflictDialogOpen = true;
  }

  function onConflictSelectPreferred(featureId: string): void {
    const idx = conflictCurrentIndex;
    const filtered = conflictResolutions.filter(r => r.conflictIndex !== idx);
    conflictResolutions = [...filtered, { conflictIndex: idx, preferFeatureId: featureId }];
  }

  function onConflictNext(): void {
    if (conflictCurrentIndex < conflictList.length - 1) {
      conflictCurrentIndex++;
    }
  }

  function onConflictPrev(): void {
    if (conflictCurrentIndex > 0) {
      conflictCurrentIndex--;
    }
  }

  function onConflictJumpTo(index: number): void {
    if (index >= 0 && index < conflictList.length) {
      conflictCurrentIndex = index;
    }
  }

  function onConflictCommit(): void {
    // 競合解決の適用は後続の Resolve UseCase と連携して行う
    // 現時点ではダイアログの解決結果を保存して閉じる
    conflictDialogOpen = false;
  }

  function onConflictCancel(): void {
    conflictDialogOpen = false;
    conflictList = [];
    conflictResolutions = [];
  }

  /** 競合名マップの生成 */
  function getConflictFeatureNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const conflict of conflictList) {
      for (const fid of [conflict.featureIdA, conflict.featureIdB]) {
        if (!map.has(fid)) {
          const f = features.find(feat => feat.id === fid);
          const name = f?.getActiveAnchor(currentTime)?.property.name ?? fid;
          map.set(fid, name);
        }
      }
    }
    return map;
  }

  function onDeleteVertex(): void {
    // 頂点削除は後続で詳細化（コンテキストメニューと共通）
    if (selectedVertexIds.size === 0 || !selectedFeatureId || !currentTime) return;
    const feature = features.find((f) => f.id === selectedFeatureId);
    if (!feature) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) return;

    for (const vertexId of selectedVertexIds) {
      try {
        if (anchor.shape.type === 'LineString') {
          vertexEdit.deleteVertexFromLine(selectedFeatureId, currentTime, vertexId);
        } else if (anchor.shape.type === 'Polygon') {
          for (const ring of anchor.shape.rings) {
            if (ring.vertexIds.includes(vertexId)) {
              vertexEdit.deleteVertexFromPolygon(selectedFeatureId, currentTime, ring.id, vertexId);
              break;
            }
          }
        }
      } catch {
        // 最小頂点数エラー等
      }
    }
    selectedVertexIds = new Set();
    refreshFeatureData();
  }

  /** 地図上のmousedown — 地物ドラッグ開始 or 矩形選択開始 */
  function onMapMouseDown(coord: Coordinate, screenX: number, screenY: number): void {
    if (toolMode !== 'edit' && toolMode !== 'view') return;

    if (selectedFeatureId && currentTime) {
      // ヒットテストで選択中の地物上かどうか判定
      const result = hitTest(coord, features, vertices, layers, currentTime, getHitThreshold());
      if (result && result.featureId === selectedFeatureId) {
        featureDragState = startFeatureDrag(selectedFeatureId, screenX, screenY);
        featureDragStartGeo = { lon: coord.x, lat: coord.y };
        featureDragLastGeo = { lon: coord.x, lat: coord.y };
        return;
      }
    }

    // 編集モードで地物未ヒット → 矩形選択開始（選択中地物がある場合のみ）
    if (toolMode === 'edit' && selectedFeatureId) {
      boxSelectState = startBoxSelect(coord, false);
    }
  }

  /** 地物ドラッグの確定 */
  function commitFeatureDrag(): void {
    if (!featureDragState || !currentTime || !featureDragStartGeo || !featureDragLastGeo) {
      featureDragState = null;
      featureDragStartGeo = null;
      featureDragLastGeo = null;
      return;
    }

    if (hasFeatureDragMoved(featureDragState)) {
      const totalDx = featureDragLastGeo.lon - featureDragStartGeo.lon;
      const totalDy = featureDragLastGeo.lat - featureDragStartGeo.lat;

      // プレビュー中に直接移動した分を元に戻す（逆方向に移動）
      applyFeatureTranslation(featureDragState.featureId, -totalDx, -totalDy);

      // Undo対応コマンドで正式に移動
      undoRedo.execute(
        new MoveFeatureCommand(addFeature, {
          featureId: featureDragState.featureId,
          dx: totalDx,
          dy: totalDy,
          currentTime,
        })
      );
      refreshFeatureData();
    }

    featureDragState = null;
    featureDragStartGeo = null;
    featureDragLastGeo = null;
  }

  /** 地物の全頂点を平行移動する（プレビュー用） */
  function applyFeatureTranslation(featureId: string, dx: number, dy: number): void {
    const feature = features.find(f => f.id === featureId);
    if (!feature || !currentTime) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) return;

    const mutableVertices = addFeature.getVertices() as Map<string, Vertex>;
    const vertexIds: string[] = [];

    switch (anchor.shape.type) {
      case 'Point':
        vertexIds.push(anchor.shape.vertexId);
        break;
      case 'LineString':
        vertexIds.push(...anchor.shape.vertexIds);
        break;
      case 'Polygon':
        for (const ring of anchor.shape.rings) {
          vertexIds.push(...ring.vertexIds);
        }
        break;
    }

    for (const vid of vertexIds) {
      const vertex = mutableVertices.get(vid);
      if (vertex) {
        mutableVertices.set(vid, vertex.withCoordinate(
          new Coordinate(vertex.coordinate.x + dx, vertex.coordinate.y + dy)
        ));
      }
    }
  }

  /** 矩形選択の確定 */
  function commitBoxSelect(): void {
    if (!boxSelectState || !selectedFeatureId || !currentTime) {
      boxSelectState = null;
      return;
    }

    if (!isBoxLargeEnough(boxSelectState)) {
      boxSelectState = null;
      return;
    }

    // 選択中地物の頂点IDリストを取得
    const feature = features.find(f => f.id === selectedFeatureId);
    if (!feature) { boxSelectState = null; return; }
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) { boxSelectState = null; return; }

    const vertexIds: string[] = [];
    switch (anchor.shape.type) {
      case 'Point': vertexIds.push(anchor.shape.vertexId); break;
      case 'LineString': vertexIds.push(...anchor.shape.vertexIds); break;
      case 'Polygon':
        for (const ring of anchor.shape.rings) vertexIds.push(...ring.vertexIds);
        break;
    }

    const box = getSelectionBox(boxSelectState);
    const found = findVerticesInBox(box, vertexIds, vertices);
    selectedVertexIds = mergeSelection(selectedVertexIds, found, boxSelectState.isAdditive);
    boxSelectState = null;
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
  function onCursorGeoUpdate(geo: { lon: number; lat: number }, screenX: number, screenY: number): void {
    // 頂点ドラッグ
    if (dragState) {
      const newCoord = new Coordinate(geo.lon, geo.lat);
      dragState = updateDragPreview(dragState, newCoord);
      vertexEdit.moveVertex(dragState.vertexId, newCoord);

      const snapDist = screenToWorldSnapDistance(50, window.innerWidth, 1);
      const candidates = findSnapCandidates(
        geo.lon, geo.lat, vertices,
        new Set([dragState.vertexId]),
        snapDist
      );
      snapIndicator = buildSnapIndicator(candidates, vertices, sharedGroups);

      refreshFeatureData();
      return;
    }

    // 矩形選択
    if (boxSelectState) {
      boxSelectState = updateBoxSelect(boxSelectState, new Coordinate(geo.lon, geo.lat));
      return;
    }

    // 地物ドラッグ
    if (featureDragState && featureDragLastGeo) {
      const incrementalDx = geo.lon - featureDragLastGeo.lon;
      const incrementalDy = geo.lat - featureDragLastGeo.lat;

      featureDragState = updateFeatureDrag(featureDragState, screenX, screenY);
      applyFeatureTranslation(featureDragState.featureId, incrementalDx, incrementalDy);
      featureDragLastGeo = { lon: geo.lon, lat: geo.lat };

      refreshFeatureData();
    }
  }

  /** キーボードイベント */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (showSplitModal) {
        showSplitModal = false;
      } else if (knifeDrawingState) {
        knifeDrawingState = null;
      } else if (ringDrawingState) {
        ringDrawingState = null;
      } else if (isDrawing) {
        toolStore.send({ type: 'KEY_ESCAPE' });
        syncToolState();
      } else if (toolMode === 'measure' && surveyState.pointA) {
        surveyState = resetSurvey(surveyState);
      } else {
        selectedFeatureId = null;
        selectedVertexIds = new Set();
      }
    }
    if (e.key === 'Delete' && selectedVertexIds.size > 0) {
      onDeleteVertex();
    }
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      if (knifeDrawingState) {
        knifeDrawingState = undoKnifeVertex(knifeDrawingState);
      } else if (ringDrawingState) {
        ringDrawingState = undoRingVertex(ringDrawingState);
      } else if (isDrawing) {
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
          onDragEnd={() => { commitDrag(); commitFeatureDrag(); commitBoxSelect(); }}
          isRingDrawing={ringDrawingState !== null}
          ringDrawingCanConfirm={ringDrawingState ? canConfirmRing(ringDrawingState) : false}
          ringDrawingCoords={ringDrawingState?.coords ?? []}
          selectedFeatureType={selectedFeatureId && currentTime ? features.find(f => f.id === selectedFeatureId)?.getActiveAnchor(currentTime)?.shape.type ?? null : null}
          {onAddHole}
          {onAddExclave}
          {onConfirmRing}
          {onCancelRing}
          {onDeleteVertex}
          {onMapMouseDown}
          isFeatureDragging={featureDragState !== null && hasFeatureDragMoved(featureDragState)}
          isKnifeDrawing={knifeDrawingState !== null}
          knifeDrawingCoords={knifeDrawingState?.coords ?? []}
          knifeCanConfirm={getKnifeCanConfirm()}
          {onStartKnife}
          {onConfirmKnife}
          {onCancelKnife}
          mergeTargetCount={mergeTargetIds.length}
          onAddMergeTarget={() => { if (selectedFeatureId) addMergeTarget(selectedFeatureId); }}
          {onStartMerge}
          onClearMerge={clearMergeTargets}
          surveyPointA={surveyState.pointA}
          surveyPointB={surveyState.pointB}
          {surveyResult}
          boxSelectBox={boxSelectState && isBoxLargeEnough(boxSelectState) ? getSelectionBox(boxSelectState) : null}
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

<!-- 分割確認モーダル -->
<!-- 競合解決ダイアログ -->
<ConflictResolutionDialog
  isOpen={conflictDialogOpen}
  conflicts={conflictList}
  currentIndex={conflictCurrentIndex}
  resolutions={conflictResolutions}
  allResolved={conflictResolutions.length >= conflictList.length && conflictList.length > 0}
  errorMessage={conflictError}
  featureNameMap={getConflictFeatureNameMap()}
  onSelectPreferred={onConflictSelectPreferred}
  onNext={onConflictNext}
  onPrev={onConflictPrev}
  onJumpTo={onConflictJumpTo}
  onCommit={onConflictCommit}
  onCancel={onConflictCancel}
/>

<!-- 結合確認モーダル -->
<MergeConfirmModal
  isOpen={showMergeModal}
  featureNames={mergeTargetIds.map(id => {
    const f = features.find(feat => feat.id === id);
    return f?.getActiveAnchor(currentTime)?.property.name ?? id;
  })}
  onConfirm={onMergeConfirm}
  onCancel={onCancelMerge}
/>

<SplitConfirmModal
  isOpen={showSplitModal}
  featureName={knifeDrawingState ? features.find(f => f.id === knifeDrawingState?.featureId)?.getActiveAnchor(currentTime)?.property.name ?? '' : ''}
  onConfirm={onSplitConfirm}
  onCancel={() => { showSplitModal = false; }}
/>

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
