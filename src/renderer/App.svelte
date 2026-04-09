<script lang="ts">
  import { onDestroy } from 'svelte';
  import Toolbar from '@presentation/components/Toolbar.svelte';
  import MenuBar from '@presentation/components/MenuBar.svelte';
  import MapCanvas from '@presentation/components/MapCanvas.svelte';
  import SplitConfirmModal from '@presentation/components/SplitConfirmModal.svelte';
  import MergeConfirmModal from '@presentation/components/MergeConfirmModal.svelte';
  import ConflictResolutionDialog from '@presentation/components/ConflictResolutionDialog.svelte';
  import ProjectSettingsDialog from '@presentation/components/ProjectSettingsDialog.svelte';
  import ContextMenu from '@presentation/components/ContextMenu.svelte';
  import type { ContextMenuEntry } from '@presentation/components/ContextMenu.svelte';
  import { buildContextMenuItems, type ContextMenuContext, type ContextMenuActions } from '@infrastructure/rendering/contextMenuBuilder';
  import Sidebar from '@presentation/components/Sidebar.svelte';
  import TimelinePanel from '@presentation/components/TimelinePanel.svelte';
  import StatusBar from '@presentation/components/StatusBar.svelte';
  import { createToolStore } from '@presentation/state/toolStore';
  import { getContainer } from '@infrastructure/DIContainer';
  import { AddFeatureCommand } from '@application/commands/AddFeatureCommand';
  import { DeleteFeatureCommand } from '@application/commands/DeleteFeatureCommand';
  import { MoveVertexCommand } from '@application/commands/MoveVertexCommand';
  import { MoveVerticesCommand } from '@application/commands/MoveVerticesCommand';
  import { eventBus } from '@application/EventBus';
  import { Coordinate } from '@domain/value-objects/Coordinate';
  import type { Feature } from '@domain/entities/Feature';
  import type { Layer } from '@domain/entities/Layer';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';
  import { hitTest } from '@infrastructure/rendering/hitTestUtils';
  import {
    startDrag,
    startInsertDrag,
    updateDragPreview,
    createWrappedDragCoordinate,
    hasMoved,
    type DragState,
  } from '@infrastructure/rendering/vertexDragManager';
  import {
    buildSnapIndicators,
    type SnapIndicator,
  } from '@infrastructure/rendering/snapIndicatorUtils';
  import {
    findGroupForVertex,
    findSnapCandidates,
    getLinkedVertexIds,
    isSharedVertexMergeAllowed,
    moveSharedVertices,
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
    type FeatureDragState,
  } from '@infrastructure/rendering/featureDragManager';
  import {
    resolveVertexMouseDownState,
    shouldStartFeatureDrag,
    type EditInteractionMode,
  } from '@infrastructure/rendering/editInteractionUtils';
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
    toSurveyMeasurement,
    type SurveyModeState,
    type SurveyMeasurement,
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
  import {
    addHoleRing,
    addExclaveRing,
    isRingDrawingPointAllowed,
    resolveRingDrawingPlacement,
    validateNewRingPlacement,
  } from '@domain/services/RingEditService';
  import type { AnchorProperty, FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import { DEFAULT_SETTINGS, DEFAULT_METADATA, type WorldSettings, type WorldMetadata } from '@domain/entities/World';
  import { Vertex } from '@domain/entities/Vertex';
  import type { AppConfig } from '@infrastructure/ConfigManager';
  import { serialize as serializeWorld } from '@infrastructure/persistence/JSONSerializer';
  import {
    PolygonValidationError,
    createTransientPolygonFeature,
    validatePolygonOrThrow,
  } from '@application/polygonValidation';
  import { createDefaultPolygonStyle } from '@infrastructure/StyleResolver';
  import {
    wrapLongitudeNearReference,
  } from '@infrastructure/rendering/featureRenderingUtils';
  import {
    createDirtyState,
    markDirty,
    markSaved,
    resetDirty,
    type DirtyState,
  } from '@infrastructure/rendering/dirtyTracker';
  import {
    createAutoBackup,
    DEFAULT_BACKUP_CONFIG,
    shouldBackup,
  } from '@infrastructure/rendering/autoBackupManager';
  import {
    buildVisibleVertexOwnerMap,
    collectFeatureIdsForSelectedVertices,
    resolveVertexSelectionContext,
  } from '@infrastructure/rendering/vertexSelectionContext';
  import {
    hasProjectSettingsChanged,
    normalizeWorldSettings,
  } from '@presentation/app/appProjectSettings';
  import {
    buildPropertyPanelSelectionState,
    collectAnchorVertexIds,
    getFeatureById,
  } from '@presentation/app/appSelection';

  const container = getContainer();
  const {
    commands: {
      addFeature,
      anchorEdit,
      deleteFeature,
      manageLayers,
      navigateTime,
      saveLoad,
      undoRedo,
      vertexEdit,
    },
    queries: {
      features: featureQueries,
      layers: layerQueries,
      timeline: timelineQueries,
      project: projectQueries,
    },
    infrastructure: {
      configManager,
    },
  } = container;

  // --- ツール状態 ---

  const toolStore = createToolStore((addToolType, coords) => {
    // 描画確定時のコールバック — UndoRedoManager経由で実行
    const layers = layerQueries.getLayers();
    if (layers.length === 0) return;
    const layerId = layers[0].id;
    const time = timelineQueries.getCurrentTime();
    const polygonIndexInLayer = features.filter((feature) => {
      const anchor = feature.getActiveAnchor(time);
      return anchor?.shape.type === 'Polygon' && anchor.placement.layerId === layerId;
    }).length;

    try {
      if (addToolType === 'point' && coords.length >= 1) {
        undoRedo.execute(new AddFeatureCommand(addFeature, { type: 'point', coord: coords[0], layerId, time }));
      } else if (addToolType === 'line' && coords.length >= 2) {
        undoRedo.execute(new AddFeatureCommand(addFeature, { type: 'line', coords, layerId, time }));
      } else if (addToolType === 'polygon' && coords.length >= 3) {
        undoRedo.execute(new AddFeatureCommand(addFeature, {
          type: 'polygon',
          coords,
          layerId,
          time,
          style: createDefaultPolygonStyle(polygonIndexInLayer, projectSettings),
        }));
      }
      validationMessage = '';
      refreshFeatureData();
    } catch (error) {
      validationMessage = getValidationMessage(error);
    }
  });

  // --- リアクティブ状態 ---

  let toolMode = $state<ToolMode>('view');
  let addToolType = $state<AddToolType>('polygon');
  let isDrawing = $state(false);
  let drawingCoords = $state<readonly Coordinate[]>([]);
  let features = $state<readonly Feature[]>([]);
  let vertices = $state<ReadonlyMap<string, Vertex>>(new Map());
  let layers = $state<readonly Layer[]>([]);
  let currentTime = $state(timelineQueries.getCurrentTime());
  let selectedFeatureId = $state<string | null>(null);
  let focusedLayerId = $state<string | null>(null);
  let isSidebarCollapsed = $state(false);
  let selectedVertexIds = $state<ReadonlySet<string>>(new Set());
  let editInteractionMode = $state<EditInteractionMode>('vertex');
  let dragState = $state<DragState | null>(null);
  let sharedGroups = $state<ReadonlyMap<string, SharedVertexGroup>>(
    new Map(addFeature.getSharedVertexGroups())
  );
  let snapIndicators = $state<readonly SnapIndicator[]>([]);
  let ringDrawingState = $state<RingDrawingState | null>(null);
  let featureDragState = $state<FeatureDragState | null>(null);
  let knifeDrawingState = $state<KnifeDrawingState | null>(null);
  let showSplitModal = $state(false);
  let mergeTargetIds = $state<string[]>([]);
  let showMergeModal = $state(false);

  // --- プロジェクト設定 ---
  let settingsDialogOpen = $state(false);
  let projectSettings = $state<WorldSettings>({ ...DEFAULT_SETTINGS });
  let projectMetadata = $state<WorldMetadata>({ ...DEFAULT_METADATA });
  let appConfig = $state<AppConfig>(projectQueries.getAppConfig());
  let autoBackupIntervalMs = $derived(
    Number.isFinite(projectSettings.autoSaveInterval) &&
      projectSettings.autoSaveInterval > 0
      ? projectSettings.autoSaveInterval * 1000
      : DEFAULT_BACKUP_CONFIG.intervalMs
  );
  let visibleVertexOwnerMap = $derived(
    buildVisibleVertexOwnerMap(features, layers, currentTime)
  );
  let vertexSelectionContext = $derived(
    resolveVertexSelectionContext(selectedVertexIds, visibleVertexOwnerMap)
  );
  let vertexSelectionContextFeatureId = $derived(
    vertexSelectionContext.kind === 'single'
      ? vertexSelectionContext.featureIds[0]
      : null
  );
  let selectionFeatureId = $derived(
    selectedFeatureId ?? vertexSelectionContextFeatureId
  );
  let selectedVertexOwnerFeatureIds = $derived(
    [...collectFeatureIdsForSelectedVertices(selectedVertexIds, visibleVertexOwnerMap)]
  );
  let lockedLayerIds = $derived(
    new Set(
      features.flatMap((feature) =>
        feature.anchors.map((anchor) => anchor.placement.layerId)
      )
    )
  );

  $effect(() => {
    if (focusedLayerId && !layers.some((layer) => layer.id === focusedLayerId && layer.visible)) {
      focusedLayerId = null;
    }
  });

  function openSettings(): void {
    settingsDialogOpen = true;
  }

  function loadAppConfig(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    configManager.loadAppConfig(localStorage);
    appConfig = projectQueries.getAppConfig();
  }

  function saveAppConfig(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    configManager.saveAppConfig(localStorage);
  }

  function onSettingsSave(
    metaPatch: Partial<WorldMetadata>,
    settingsPatch: Partial<WorldSettings>,
    nextLayers: readonly Layer[],
    appConfigPatch: Partial<AppConfig>
  ): void {
    const nextProjectSettings = normalizeWorldSettings({ ...projectSettings, ...settingsPatch });
    const nextProjectMetadata = { ...projectMetadata, ...metaPatch, settings: nextProjectSettings };
    const hasProjectChange = hasProjectSettingsChanged(
      projectMetadata,
      projectSettings,
      layers,
      nextProjectMetadata,
      nextProjectSettings,
      nextLayers
    );

    manageLayers.restore(nextLayers);
    refreshLayerData();
    projectSettings = nextProjectSettings;
    projectMetadata = nextProjectMetadata;
    saveLoad.setMetadata(nextProjectMetadata);
    configManager.updateAppConfig(appConfigPatch);
    appConfig = projectQueries.getAppConfig();
    saveAppConfig();
    if (hasProjectChange) {
      markAsDirty();
    }
  }

  loadAppConfig();

  // --- ダーティ状態管理 ---
  let dirtyState = $state<DirtyState>(createDirtyState());
  let validationMessage = $state('');
  let suppressNextMapClick = $state(false);

  /** 変更を記録する（各編集操作後に呼ぶ） */
  function markAsDirty(): void {
    dirtyState = markDirty(dirtyState);
  }

  function getValidationMessage(error: unknown): string {
    if (error instanceof PolygonValidationError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return '形状を確定できません';
  }

  function buildValidationVertices(
    updates: readonly { vertexId: string; coordinate: Coordinate }[]
  ): Map<string, Vertex> {
    const validationVertices = new Map(addFeature.getVertices());
    for (const update of updates) {
      const existing = validationVertices.get(update.vertexId);
      validationVertices.set(
        update.vertexId,
        existing
          ? existing.withCoordinate(update.coordinate)
          : new Vertex(update.vertexId, update.coordinate.clampLatitude())
      );
    }
    return validationVertices;
  }

  function getRingDrawingTarget() {
    if (!ringDrawingState || !currentTime) return null;

    const feature = features.find((candidate) => candidate.id === ringDrawingState.featureId);
    if (!feature) return null;

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || anchor.shape.type !== 'Polygon') return null;

    return { feature, anchor };
  }

  function getAnchorReferenceLongitude(anchor: FeatureAnchor): number | null {
    switch (anchor.shape.type) {
      case 'Point': {
        return addFeature.getVertices().get(anchor.shape.vertexId)?.x ?? null;
      }
      case 'LineString': {
        for (const vertexId of anchor.shape.vertexIds) {
          const vertex = addFeature.getVertices().get(vertexId);
          if (vertex) return vertex.x;
        }
        return null;
      }
      case 'Polygon': {
        for (const ring of anchor.shape.rings) {
          for (const vertexId of ring.vertexIds) {
            const vertex = addFeature.getVertices().get(vertexId);
            if (vertex) return vertex.x;
          }
        }
        return null;
      }
    }
  }

  function getSelectedPolygonReferenceLongitude(): number | null {
    if (!selectionFeatureId || !currentTime) return null;
    const feature = features.find((candidate) => candidate.id === selectionFeatureId);
    const anchor = feature?.getActiveAnchor(currentTime);
    return anchor && anchor.shape.type === 'Polygon'
      ? getAnchorReferenceLongitude(anchor)
      : null;
  }

  function alignCoordinateNearReference(
    coord: Coordinate,
    currentCoords: readonly Coordinate[],
    fallbackReferenceLon: number | null = null
  ): Coordinate {
    const referenceLon = currentCoords.at(-1)?.x ?? fallbackReferenceLon;
    return referenceLon === null
      ? coord
      : new Coordinate(wrapLongitudeNearReference(coord.x, referenceLon), coord.y);
  }

  function getRingDrawingConstraintMessage(): string {
    const target = getRingDrawingTarget();
    if (!target) return 'ポリゴン地物が選択されていません';
    if (!ringDrawingState || ringDrawingState.coords.length === 0) {
      return '穴/飛び地を開始できません';
    }

    const resolution = resolveRingDrawingPlacement(
      target.anchor.shape.rings,
      addFeature.getVertices(),
      { x: ringDrawingState.coords[0].x, y: ringDrawingState.coords[0].y }
    );
    if (!resolution.placement) {
      return resolution.message ?? '穴/飛び地を開始できません';
    }

    switch (resolution.placement.constraint.kind) {
      case 'territory':
        return '穴追加中の頂点は開始した領土リングの内部に配置してください';
      case 'hole':
        return '飛び地追加中の頂点は開始した穴リングの内部に配置してください';
      case 'outside':
        return '飛び地追加中の頂点は選択中ポリゴンの外部に配置してください';
    }
  }

  function validateRingDrawingVertex(coord: Coordinate): string | null {
    const target = getRingDrawingTarget();
    if (!target) return 'ポリゴン地物が選択されていません';

    const alignedCoord = alignCoordinateNearReference(
      coord,
      ringDrawingState?.coords ?? [],
      getAnchorReferenceLongitude(target.anchor)
    );

    if (!ringDrawingState || ringDrawingState.coords.length === 0) {
      const resolution = resolveRingDrawingPlacement(
        target.anchor.shape.rings,
        addFeature.getVertices(),
        { x: alignedCoord.x, y: alignedCoord.y }
      );
      return resolution.message;
    }

    const resolution = resolveRingDrawingPlacement(
      target.anchor.shape.rings,
      addFeature.getVertices(),
      { x: ringDrawingState.coords[0].x, y: ringDrawingState.coords[0].y }
    );
    if (!resolution.placement) {
      return resolution.message ?? '穴/飛び地を開始できません';
    }

    return isRingDrawingPointAllowed(
      { x: alignedCoord.x, y: alignedCoord.y },
      resolution.placement,
      target.anchor.shape.rings,
      addFeature.getVertices()
    )
      ? null
      : getRingDrawingConstraintMessage();
  }

  function validatePendingPolygon(coords: readonly Coordinate[]): string | null {
    if (addToolType !== 'polygon' || !currentTime) return null;

    const layerList = layerQueries.getLayers();
    if (layerList.length === 0) return null;

    try {
      const transient = createTransientPolygonFeature(
        coords,
        layerList[0].id,
        currentTime,
        'pending-drawing',
        'pending-drawing-ring',
        'pending-drawing-v'
      );
      const validationVertices = new Map(addFeature.getVertices());
      for (const [vertexId, vertex] of transient.vertices) {
        validationVertices.set(vertexId, vertex);
      }
      validatePolygonOrThrow(
        transient.feature,
        features,
        validationVertices,
        currentTime,
        layerList[0].id
      );
      return null;
    } catch (error) {
      return getValidationMessage(error);
    }
  }

  // --- 自動バックアップ ---
  let lastBackupTime = $state(Date.now());
  let backupIntervalId: ReturnType<typeof setInterval> | null = null;

  function startAutoBackup(): void {
    if (backupIntervalId) return;
    backupIntervalId = setInterval(async () => {
      const filePath = saveLoad.getCurrentFilePath();
      if (!filePath || !dirtyState.isDirty) return;
      if (!shouldBackup(lastBackupTime, Date.now(), autoBackupIntervalMs)) return;

      try {
        const world = saveLoad.assembleWorld();
        const json = serializeWorld(world);
        await createAutoBackup(
          filePath,
          json,
          DEFAULT_BACKUP_CONFIG.maxGenerations,
          window.api
        );
        lastBackupTime = Date.now();
      } catch (err) {
        console.warn('Auto-backup failed:', err);
      }
    }, 60_000); // チェック間隔は1分（実際のバックアップはshouldBackupで制御）
  }

  startAutoBackup();

  // --- プロパティ編集 ---

  function onPropertyChange(featureId: string, anchorId: string, property: AnchorProperty): void {
    anchorEdit.updateProperty(featureId, anchorId, property);
    refreshFeatureData();
    markAsDirty();
  }

  // --- コンテキストメニュー ---
  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuItems = $state<readonly ContextMenuEntry[]>([]);

  // --- 矩形選択 ---
  let boxSelectState = $state<BoxSelectState | null>(null);

  // --- 測量モード ---
  let surveyState = $state<SurveyModeState>(createSurveyState());
  let surveyMeasurements = $state<readonly SurveyMeasurement[]>([]);
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
  /** 複数選択由来の頂点ドラッグか */
  let dragMovesMultipleVertices = $state(false);
  /** 頂点ドラッグ中にプレビュー移動する実頂点ID群 */
  let dragMovedVertexIds = $state<readonly string[]>([]);
  /** 頂点ドラッグ開始時の元座標 */
  let dragBaseCoordinates = $state<ReadonlyMap<string, Coordinate>>(new Map());
  /** 頂点ドラッグ開始時の共有頂点代表座標 */
  let dragBaseSharedGroupCoordinates = $state<ReadonlyMap<string, Coordinate>>(new Map());

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
    features = featureQueries.getFeatures();
    vertices = featureQueries.getVertices();
    sharedGroups = featureQueries.getSharedVertexGroups();
  }

  function resetVertexDragContext(): void {
    dragMovesMultipleVertices = false;
    dragMovedVertexIds = [];
    dragBaseCoordinates = new Map();
    dragBaseSharedGroupCoordinates = new Map();
  }

  function collectDraggedSelectionIds(
    primaryVertexId: string,
    selection: ReadonlySet<string>
  ): readonly string[] {
    if (!selection.has(primaryVertexId) || selection.size <= 1) {
      return [primaryVertexId];
    }
    return [...selection];
  }

  function expandDraggedVertexIds(
    vertexIds: readonly string[],
    groups: ReadonlyMap<string, SharedVertexGroup>
  ): string[] {
    const expandedVertexIds = new Set<string>();
    for (const vertexId of vertexIds) {
      const linkedVertexIds = getLinkedVertexIds(vertexId, groups);
      if (linkedVertexIds.length === 0) {
        expandedVertexIds.add(vertexId);
        continue;
      }
      for (const linkedVertexId of linkedVertexIds) {
        expandedVertexIds.add(linkedVertexId);
      }
    }
    return [...expandedVertexIds];
  }

  function createVertexCoordinateSnapshot(vertexIds: readonly string[]): Map<string, Coordinate> {
    const snapshot = new Map<string, Coordinate>();
    const currentVertices = addFeature.getVertices();
    for (const vertexId of vertexIds) {
      const vertex = currentVertices.get(vertexId);
      if (vertex) {
        snapshot.set(vertexId, vertex.coordinate);
      }
    }
    return snapshot;
  }

  function createSharedGroupCoordinateSnapshot(vertexIds: readonly string[]): Map<string, Coordinate> {
    const snapshot = new Map<string, Coordinate>();
    const currentSharedGroups = addFeature.getSharedVertexGroups();
    for (const vertexId of vertexIds) {
      const group = findGroupForVertex(vertexId, currentSharedGroups);
      if (group && !snapshot.has(group.id)) {
        snapshot.set(group.id, group.representativeCoordinate);
      }
    }
    return snapshot;
  }

  function beginVertexDrag(
    vertexId: string,
    startCoord: Coordinate,
    selection: ReadonlySet<string>,
    isInserted: boolean = false
  ): void {
    const currentSharedGroups = addFeature.getSharedVertexGroups();
    const baseDraggedVertexIds = isInserted
      ? [vertexId]
      : collectDraggedSelectionIds(vertexId, selection);
    const expandedDraggedVertexIds = expandDraggedVertexIds(
      baseDraggedVertexIds,
      currentSharedGroups
    );

    dragMovesMultipleVertices = baseDraggedVertexIds.length > 1;
    dragMovedVertexIds = expandedDraggedVertexIds;
    dragBaseCoordinates = createVertexCoordinateSnapshot(expandedDraggedVertexIds);
    dragBaseSharedGroupCoordinates = createSharedGroupCoordinateSnapshot(expandedDraggedVertexIds);
    dragState = isInserted
      ? startInsertDrag(vertexId, startCoord)
      : startDrag(vertexId, startCoord);
  }

  function getVertexDragDelta(targetCoord: Coordinate): { dx: number; dy: number } {
    if (!dragState) return { dx: 0, dy: 0 };

    const wrappedLon = wrapLongitudeNearReference(
      targetCoord.x,
      dragState.startCoord.x
    );
    return {
      dx: wrappedLon - dragState.startCoord.x,
      dy: targetCoord.y - dragState.startCoord.y,
    };
  }

  function restoreVertexDragPreview(): void {
    const mutableVertices = addFeature.getVertices() as Map<string, Vertex>;
    for (const [vertexId, baseCoordinate] of dragBaseCoordinates) {
      const vertex = mutableVertices.get(vertexId);
      if (!vertex) continue;
      mutableVertices.set(vertexId, vertex.withCoordinate(baseCoordinate));
    }

    const mutableSharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    for (const [groupId, baseCoordinate] of dragBaseSharedGroupCoordinates) {
      const group = mutableSharedGroups.get(groupId);
      if (!group) continue;
      mutableSharedGroups.set(groupId, group.withRepresentativeCoordinate(baseCoordinate));
    }
  }

  function applyMultiVertexDragPreview(targetCoord: Coordinate): void {
    const { dx, dy } = getVertexDragDelta(targetCoord);
    const mutableVertices = addFeature.getVertices() as Map<string, Vertex>;
    for (const [vertexId, baseCoordinate] of dragBaseCoordinates) {
      const vertex = mutableVertices.get(vertexId);
      if (!vertex) continue;
      mutableVertices.set(
        vertexId,
        vertex.withCoordinate(
          new Coordinate(baseCoordinate.x + dx, baseCoordinate.y + dy).clampLatitude()
        )
      );
    }

    const mutableSharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    for (const [groupId, baseCoordinate] of dragBaseSharedGroupCoordinates) {
      const group = mutableSharedGroups.get(groupId);
      if (!group) continue;
      mutableSharedGroups.set(
        groupId,
        group.withRepresentativeCoordinate(
          new Coordinate(baseCoordinate.x + dx, baseCoordinate.y + dy).clampLatitude()
        )
      );
    }
  }

  function getSelectionFeature(): Feature | null {
    return getFeatureById(features, selectionFeatureId);
  }

  function getPropertyPanelSelectionState(): {
    kind: 'empty' | 'multiple' | 'unknown';
    featureSummaries?: readonly { id: string; name: string }[];
    remainingCount?: number;
  } {
    return buildPropertyPanelSelectionState(
      features,
      selectedFeatureId,
      vertexSelectionContext,
      currentTime
    );
  }

  /** レイヤーデータを更新する */
  function refreshLayerData(): void {
    layers = layerQueries.getLayers();
  }

  // --- 初期レイヤー（デフォルト1つ） ---
  if (layerQueries.getLayers().length === 0) {
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

  const unsubLayersChanged = eventBus.on('layers:changed', () => {
    refreshLayerData();
    markAsDirty();
  });

  const unsubWorldLoaded = eventBus.on('world:loaded', () => {
    refreshFeatureData();
    refreshLayerData();
    selectedFeatureId = null;
    selectedVertexIds = new Set();
    surveyState = resetSurvey(surveyState);
    surveyMeasurements = [];
    dirtyState = resetDirty();
    // メタデータ・設定を復元
    const loaded = projectQueries.getMetadata();
    projectSettings = normalizeWorldSettings(loaded.settings);
    projectMetadata = { ...loaded, settings: projectSettings };
    lastBackupTime = Date.now();
  });

  const unsubWorldSaved = eventBus.on('world:saved', () => {
    dirtyState = markSaved(dirtyState);
    lastBackupTime = Date.now();
  });

  const unsubFeatureChanged = eventBus.on('feature:added', () => {
    markAsDirty();
  });

  const unsubFeatureRemoved = eventBus.on('feature:removed', () => {
    refreshFeatureData();
    markAsDirty();
  });

  // Undo/Redo操作時にDirty状態を更新（コマンド経由の全操作をカバー）
  const unsubUndoRedo = undoRedo.subscribe(() => {
    markAsDirty();
  });

  onDestroy(() => {
    unsubFeatureAdded();
    unsubTimeChanged();
    unsubLayersChanged();
    unsubWorldLoaded();
    unsubWorldSaved();
    unsubFeatureChanged();
    unsubFeatureRemoved();
    unsubUndoRedo();
    toolStore.stop();
    if (backupIntervalId) clearInterval(backupIntervalId);
  });

  // --- コールバック ---

  function onModeChange(mode: ToolMode): void {
    toolStore.send({ type: 'MODE_CHANGE', mode });
    selectedFeatureId = null;
    selectedVertexIds = new Set();
    dragState = null;
    boxSelectState = null;
    snapIndicators = [];
    resetVertexDragContext();
    if (mode !== 'edit') {
      editInteractionMode = 'vertex';
    }
    validationMessage = '';
    syncToolState();
  }

  function onAddToolChange(toolType: AddToolType): void {
    toolStore.send({ type: 'SET_ADD_TOOL', toolType });
    validationMessage = '';
    syncToolState();
  }

  function setEditInteractionMode(mode: EditInteractionMode): void {
    editInteractionMode = mode;
    validationMessage = '';
    if (mode === 'featureMove') {
      selectedVertexIds = new Set();
      dragState = null;
      boxSelectState = null;
      snapIndicators = [];
      resetVertexDragContext();
    }
  }

  function onToggleFeatureMove(): void {
    setEditInteractionMode(
      editInteractionMode === 'featureMove' ? 'vertex' : 'featureMove'
    );
  }

  /** ヒットテスト閾値（度単位、ズームに反比例） */
  function getHitThreshold(): number {
    return 5 / (toolStore.getSnapshot().isPanning ? 1 : 1);
  }

  function onMapClick(coord: Coordinate, clickedFeatureId: string | null = null): void {
    if (suppressNextMapClick) {
      suppressNextMapClick = false;
      return;
    }

    // ナイフ描画中はクリックで頂点追加
    if (knifeDrawingState) {
      const alignedCoord = alignCoordinateNearReference(
        coord,
        knifeDrawingState.coords,
        getSelectedPolygonReferenceLongitude()
      );
      knifeDrawingState = addKnifeVertex(knifeDrawingState, alignedCoord);
      return;
    }
    // リング描画中はクリックで頂点追加
    if (ringDrawingState) {
      const alignedCoord = alignCoordinateNearReference(
        coord,
        ringDrawingState.coords,
        getSelectedPolygonReferenceLongitude()
      );
      const ringValidationMessage = validateRingDrawingVertex(alignedCoord);
      if (ringValidationMessage) {
        validationMessage = ringValidationMessage;
        return;
      }
      validationMessage = '';
      ringDrawingState = addRingVertex(ringDrawingState, alignedCoord);
      return;
    }
    if (toolMode === 'measure') {
      const nextSurveyState = addSurveyPoint(surveyState, coord);
      const previousMeasurement = toSurveyMeasurement(surveyState);
      const nextMeasurement = toSurveyMeasurement(nextSurveyState);
      if (!previousMeasurement && nextMeasurement) {
        surveyMeasurements = [...surveyMeasurements, nextMeasurement];
      }
      surveyState = nextSurveyState;
      return;
    }
    if (toolMode === 'add') {
      const alignedCoord = alignCoordinateNearReference(coord, drawingCoords);
      toolStore.send({ type: 'MAP_CLICK', coord: alignedCoord });
      syncToolState();
      // 点ツール: 即座にポイント追加（Undo対応）
      if (addToolType === 'point') {
        const layerList = layerQueries.getLayers();
        if (layerList.length > 0) {
          undoRedo.execute(new AddFeatureCommand(addFeature, {
            type: 'point',
            coord: alignedCoord,
            layerId: layerList[0].id,
            time: timelineQueries.getCurrentTime(),
          }));
          refreshFeatureData();
        }
      }
    } else if (toolMode === 'view' || toolMode === 'edit') {
      if (clickedFeatureId) {
        selectedFeatureId = clickedFeatureId;
        selectedVertexIds = new Set();
        return;
      }

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
      const alignedCoord = alignCoordinateNearReference(coord, drawingCoords);
      const nextCoords = [...drawingCoords, alignedCoord];
      const pendingValidation = validatePendingPolygon(nextCoords);
      if (pendingValidation) {
        validationMessage = pendingValidation;
        return;
      }
      validationMessage = '';
      toolStore.send({ type: 'MAP_DOUBLE_CLICK', coord: alignedCoord });
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
      const pendingValidation = validatePendingPolygon(drawingCoords);
      if (pendingValidation) {
        validationMessage = pendingValidation;
        return;
      }
      validationMessage = '';
      toolStore.send({ type: 'CONFIRM' });
      syncToolState();
    }
  }

  function onCancel(): void {
    if (isDrawing) {
      validationMessage = '';
      toolStore.send({ type: 'KEY_ESCAPE' });
      syncToolState();
    }
  }

  // --- リング描画（穴/飛び地追加） ---

  function onAddRing(): void {
    if (!selectionFeatureId) return;
    setEditInteractionMode('vertex');
    validationMessage = '';
    ringDrawingState = startRingDrawing('auto', selectionFeatureId);
  }

  function onConfirmRing(): void {
    if (!ringDrawingState || !canConfirmRing(ringDrawingState) || !currentTime) return;

    const target = getRingDrawingTarget();
    if (!target) return;
    const { feature, anchor } = target;

    const currentVertices = addFeature.getVertices();
    const newRingCoords = ringDrawingState.coords.map((coord) => ({ x: coord.x, y: coord.y }));
    const placementResolution = resolveRingDrawingPlacement(
      anchor.shape.rings,
      currentVertices,
      { x: ringDrawingState.coords[0].x, y: ringDrawingState.coords[0].y }
    );
    if (!placementResolution.placement) {
      validationMessage = placementResolution.message ?? '穴/飛び地を開始できません';
      return;
    }

    const placement = placementResolution.placement;
    const placementErrors = validateNewRingPlacement(
      anchor.shape.rings,
      currentVertices,
      placement,
      newRingCoords
    );
    if (placementErrors.length > 0) {
      validationMessage = placementErrors[0].message;
      return;
    }

    try {
      const pendingVertexIds = ringDrawingState.coords.map((_, index) => `pending-ring-v-${index}`);
      const validationVertices = buildValidationVertices(
        ringDrawingState.coords.map((coord, index) => ({
          vertexId: pendingVertexIds[index],
          coordinate: coord,
        }))
      );
      const pendingRingResult = placement.type === 'hole'
        ? addHoleRing(anchor.shape.rings, placement.parentRingId!, 'pending-ring', pendingVertexIds)
        : addExclaveRing(anchor.shape.rings, placement.parentRingId, 'pending-ring', pendingVertexIds);
      const pendingAnchor = anchor.withShape({ type: 'Polygon', rings: pendingRingResult.rings });
      const pendingFeature = feature.withAnchors(
        feature.anchors.map((candidate) => candidate.id === anchor.id ? pendingAnchor : candidate)
      );
      validatePolygonOrThrow(
        pendingFeature,
        features,
        validationVertices,
        currentTime,
        anchor.placement.layerId
      );

      const vertexMap = addFeature.getVertices() as Map<string, Vertex>;
      const newVertexIds: string[] = [];
      for (const coord of ringDrawingState.coords) {
        const id = `v-ring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        vertexMap.set(id, new Vertex(id, coord.clampLatitude()));
        newVertexIds.push(id);
      }
      const newRingId = `ring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = placement.type === 'hole'
        ? addHoleRing(anchor.shape.rings, placement.parentRingId!, newRingId, newVertexIds)
        : addExclaveRing(anchor.shape.rings, placement.parentRingId, newRingId, newVertexIds);

      const newAnchor = anchor.withShape({ type: 'Polygon', rings: result.rings });
      const newAnchors = feature.anchors.map((a) => a.id === anchor.id ? newAnchor : a);
      const updatedFeature = feature.withAnchors(newAnchors);
      (addFeature.getFeaturesMap() as Map<string, typeof feature>).set(feature.id, updatedFeature);
      validationMessage = '';
      refreshFeatureData();
      markAsDirty();
    } catch (error) {
      validationMessage = getValidationMessage(error);
      return;
    }

    ringDrawingState = null;
  }

  function onCancelRing(): void {
    validationMessage = '';
    ringDrawingState = null;
  }

  // --- ナイフツール（分割） ---

  function onStartKnife(): void {
    if (!selectionFeatureId) return;
    setEditInteractionMode('vertex');
    knifeDrawingState = startKnifeDrawing(selectionFeatureId);
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
    validationMessage = '';
    knifeDrawingState = null;
    showSplitModal = false;
  }

  /** ナイフツールの確定可否を計算 */
  function getKnifeCanConfirm(): boolean {
    if (!knifeDrawingState || !selectionFeatureId || !currentTime) return false;
    const feature = features.find(f => f.id === selectionFeatureId);
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
    if (selectedVertexIds.size === 0 || !selectionFeatureId || !currentTime) return;
    const feature = features.find((f) => f.id === selectionFeatureId);
    if (!feature) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) return;

    for (const vertexId of selectedVertexIds) {
      try {
        if (anchor.shape.type === 'LineString') {
          vertexEdit.deleteVertexFromLine(selectionFeatureId, currentTime, vertexId);
        } else if (anchor.shape.type === 'Polygon') {
          for (const ring of anchor.shape.rings) {
            if (ring.vertexIds.includes(vertexId)) {
              vertexEdit.deleteVertexFromPolygon(selectionFeatureId, currentTime, ring.id, vertexId);
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
    markAsDirty();
  }

  /** 地図上のmousedown — 地物ドラッグ開始 or 矩形選択開始 */
  function onMapMouseDown(
    coord: Coordinate,
    screenX: number,
    screenY: number,
    clickedFeatureId: string | null = null,
    isAdditive: boolean = false
  ): void {
    if (toolMode !== 'edit') return;

    let hitFeatureId = clickedFeatureId;
    if (!hitFeatureId && selectedFeatureId && currentTime) {
      hitFeatureId = hitTest(
        coord,
        features,
        vertices,
        layers,
        currentTime,
        getHitThreshold()
      )?.featureId ?? null;
    }

    if (shouldStartFeatureDrag({
      toolMode,
      editInteractionMode,
      selectedFeatureId,
      clickedFeatureId,
      hitFeatureId,
      hasCurrentTime: currentTime !== undefined,
      isRingDrawing: ringDrawingState !== null,
      isKnifeDrawing: knifeDrawingState !== null,
    })) {
      featureDragState = startFeatureDrag(selectedFeatureId!, screenX, screenY);
      featureDragStartGeo = { lon: coord.x, lat: coord.y };
      featureDragLastGeo = { lon: coord.x, lat: coord.y };
      return;
    }

    if (
      toolMode === 'edit' &&
      editInteractionMode === 'vertex' &&
      !ringDrawingState &&
      !knifeDrawingState
    ) {
      boxSelectState = startBoxSelect(coord, isAdditive);
    }
  }

  /** 地物ドラッグの確定 */
  function commitFeatureDrag(): void {
    if (!featureDragState) {
      return;
    }

    if (!currentTime || !featureDragStartGeo || !featureDragLastGeo) {
      featureDragState = null;
      featureDragStartGeo = null;
      featureDragLastGeo = null;
      suppressNextMapClick = true;
      return;
    }

    if (hasFeatureDragMoved(featureDragState)) {
      const totalDx = featureDragLastGeo.lon - featureDragStartGeo.lon;
      const totalDy = featureDragLastGeo.lat - featureDragStartGeo.lat;

      // プレビュー中に直接移動した分を元に戻す（逆方向に移動）
      applyFeatureTranslation(featureDragState.featureId, -totalDx, -totalDy);

      try {
        // Undo対応コマンドで正式に移動
        undoRedo.execute(
          new MoveFeatureCommand(addFeature, {
            featureId: featureDragState.featureId,
            dx: totalDx,
            dy: totalDy,
            currentTime,
          })
        );
        validationMessage = '';
      } catch (error) {
        validationMessage = getValidationMessage(error);
      }
      refreshFeatureData();
    }

    suppressNextMapClick = true;
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
    if (!boxSelectState) {
      boxSelectState = null;
      return;
    }

    if (!isBoxLargeEnough(boxSelectState)) {
      boxSelectState = null;
      return;
    }

    const box = getSelectionBox(boxSelectState);
    const found = findVerticesInBox(box, [...visibleVertexOwnerMap.keys()], vertices);
    selectedFeatureId = null;
    selectedVertexIds = mergeSelection(selectedVertexIds, found, boxSelectState.isAdditive);
    boxSelectState = null;
    suppressNextMapClick = true;
  }

  /** 頂点ハンドルのmousedown — 頂点選択＋ドラッグ開始 */
  function onVertexMouseDown(vertexId: string, startCoord: Coordinate, e: MouseEvent): void {
    validationMessage = '';
    selectedFeatureId = null;
    const { nextSelection, shouldStartDrag } = resolveVertexMouseDownState(
      selectedVertexIds,
      vertexId,
      e.shiftKey
    );
    selectedVertexIds = nextSelection;
    if (!shouldStartDrag || editInteractionMode !== 'vertex') {
      return;
    }

    beginVertexDrag(vertexId, startCoord, nextSelection);
  }

  /** エッジハンドルのmousedown — 頂点挿入＋ドラッグ開始 */
  function onEdgeHandleMouseDown(
    v1: string,
    v2: string,
    midpoint: Coordinate,
    e: MouseEvent
  ): void {
    if (!selectionFeatureId || !currentTime) return;
    const feature = features.find((f) => f.id === selectionFeatureId);
    if (!feature) return;
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) return;

    // エッジの中点に頂点を挿入
    const vtx1 = vertices.get(v1);
    const vtx2 = vertices.get(v2);
    if (!vtx1 || !vtx2) return;

    let newVertexId: string | null = null;
    try {
      if (anchor.shape.type === 'LineString') {
        const edgeIndex = anchor.shape.vertexIds.indexOf(v1);
        if (edgeIndex >= 0) {
          newVertexId = vertexEdit.insertVertexOnLine(
            selectionFeatureId, currentTime, edgeIndex, midpoint
          );
        }
      } else if (anchor.shape.type === 'Polygon') {
        for (const ring of anchor.shape.rings) {
          const ids = ring.vertexIds;
          for (let i = 0; i < ids.length; i++) {
            const next = (i + 1) % ids.length;
            if (ids[i] === v1 && ids[next] === v2) {
              newVertexId = vertexEdit.insertVertexOnPolygon(
                selectionFeatureId, currentTime, ring.id, i, midpoint
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
      beginVertexDrag(newVertexId, midpoint, selectedVertexIds, true);
    }
  }

  /** 頂点ドラッグのプレビュー移動（共有頂点はグループ全体を連動移動） */
  function applyVertexDragPreview(vertexId: string, newCoord: Coordinate): void {
    const mutableVertices = addFeature.getVertices() as Map<string, Vertex>;
    const mutableSharedGroups = addFeature.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    const sharedGroup = findGroupForVertex(vertexId, mutableSharedGroups);

    if (!sharedGroup) {
      vertexEdit.moveVertex(vertexId, newCoord);
      return;
    }

    const moveResult = moveSharedVertices(
      sharedGroup.id,
      newCoord,
      mutableSharedGroups,
      mutableVertices
    );

    for (const [movedVertexId, updatedVertex] of moveResult.updatedVertices) {
      mutableVertices.set(movedVertexId, updatedVertex);
    }
    mutableSharedGroups.set(moveResult.updatedGroup.id, moveResult.updatedGroup);
  }

  /** ドラッグ完了 */
  function commitDrag(): void {
    if (!dragState) return;
    if (hasMoved(dragState)) {
      // ドラッグ中に直接移動していたので、まず元に戻す
      restoreVertexDragPreview();
      try {
        // Undo対応コマンドで正式に移動
        if (dragMovesMultipleVertices) {
          const { dx, dy } = getVertexDragDelta(dragState.previewCoord);
          undoRedo.execute(
            new MoveVerticesCommand(
              vertexEdit,
              addFeature,
              dragMovedVertexIds,
              dx,
              dy,
              currentTime ?? undefined
            )
          );
        } else {
          undoRedo.execute(
            new MoveVertexCommand(
              vertexEdit,
              addFeature,
              dragState.vertexId,
              dragState.previewCoord,
              // 複数スナップ候補のうち最近接（[0]）のみを共有化対象とする
              snapIndicators[0]?.targetVertexId ?? null,
              currentTime
            )
          );
        }
        validationMessage = '';
      } catch (error) {
        validationMessage = getValidationMessage(error);
      }
      refreshFeatureData();
    }
    suppressNextMapClick = true;
    dragState = null;
    snapIndicators = [];
    resetVertexDragContext();
  }

  /** カーソル座標更新コールバック（MapCanvasから呼ばれる） */
  function onCursorGeoUpdate(
    geo: { lon: number; lat: number },
    screenX: number,
    screenY: number,
    zoom: number,
    viewWidthPx: number
  ): void {
    // 頂点ドラッグ
    if (dragState) {
      const newCoord = createWrappedDragCoordinate(
        dragState.previewCoord.x,
        geo.lon,
        geo.lat
      );
      dragState = updateDragPreview(dragState, newCoord);
      if (dragMovesMultipleVertices) {
        applyMultiVertexDragPreview(newCoord);
        snapIndicators = [];
        refreshFeatureData();
        return;
      }

      applyVertexDragPreview(dragState.vertexId, newCoord);

      const currentVertices = addFeature.getVertices();
      const currentSharedGroups = addFeature.getSharedVertexGroups();
      const linkedVertexIds = getLinkedVertexIds(dragState.vertexId, currentSharedGroups);
      const excludedVertexIds = new Set(
        linkedVertexIds.length > 0
          ? linkedVertexIds
          : [dragState.vertexId]
      );
      const snapDist = screenToWorldSnapDistance(appConfig.snapDistancePx, viewWidthPx, zoom);
      const candidates = findSnapCandidates(
        newCoord.x, newCoord.y, currentVertices,
        excludedVertexIds,
        snapDist
      ).filter((candidate) =>
        isSharedVertexMergeAllowed(
          dragState.vertexId,
          candidate.vertexId,
          features,
          currentSharedGroups,
          currentTime ?? undefined
        )
      );
      snapIndicators = buildSnapIndicators(
        candidates,
        currentVertices,
        currentSharedGroups
      );

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

  // --- コンテキストメニュー ---

  /** 右クリックメニューを表示 */
  function onContextMenu(e: MouseEvent): void {
    // 編集・表示モードのみ
    if (toolMode !== 'edit' && toolMode !== 'view') return;
    if (!selectedFeatureId) return;

    e.preventDefault();

    const featureType = (() => {
      if (!currentTime) return null;
      const f = features.find(feat => feat.id === selectedFeatureId);
      return f?.getActiveAnchor(currentTime)?.shape.type ?? null;
    })();

    // 選択頂点が共有頂点かチェック
    const hasShared = [...selectedVertexIds].some(vid => {
      for (const group of sharedGroups.values()) {
        if (group.vertexIds.includes(vid)) return true;
      }
      return false;
    });

    const ctx: ContextMenuContext = {
      selectedFeatureId,
      featureType,
      selectedVertexCount: selectedVertexIds.size,
      hasSharedVertex: hasShared,
    };

    const actions: ContextMenuActions = {
      onDelete: () => {
        if (selectedFeatureId) {
          const cmd = new DeleteFeatureCommand(
            deleteFeature, addFeature, selectedFeatureId, currentTime
          );
          undoRedo.execute(cmd);
          selectedFeatureId = null;
          selectedVertexIds = new Set();
          refreshFeatureData();
          markAsDirty();
        }
      },
      onDeleteVertex,
      onUnmergeVertex: () => {
        // 共有解除は後続の詳細化で拡充
      },
      onAddRing,
      onStartKnife,
      onAddMergeTarget: () => {
        if (selectedFeatureId) addMergeTarget(selectedFeatureId);
      },
    };

    contextMenuItems = buildContextMenuItems(ctx, actions);
    if (contextMenuItems.length === 0) return;

    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuOpen = true;
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
  }

  function isTextInputTarget(target: EventTarget | null): boolean {
    const element = target instanceof HTMLElement ? target : null;
    const tag = element?.tagName;
    return tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      element?.isContentEditable === true;
  }

  function onSelectAllVertices(): void {
    if (toolMode !== 'view' && toolMode !== 'edit') {
      return;
    }

    const feature = getSelectionFeature();
    const anchor = currentTime ? feature?.getActiveAnchor(currentTime) : null;
    if (!feature || !anchor) {
      return;
    }

    selectedFeatureId = feature.id;
    selectedVertexIds = new Set(collectAnchorVertexIds(anchor));
  }

  /** キーボードイベント */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (settingsDialogOpen) {
        settingsDialogOpen = false;
      } else if (contextMenuOpen) {
        contextMenuOpen = false;
      } else if (showSplitModal) {
        showSplitModal = false;
      } else if (knifeDrawingState) {
        knifeDrawingState = null;
      } else if (ringDrawingState) {
        ringDrawingState = null;
      } else if (isDrawing) {
        toolStore.send({ type: 'KEY_ESCAPE' });
        syncToolState();
      } else if (toolMode === 'measure' && (surveyState.pointA || surveyMeasurements.length > 0)) {
        surveyState = resetSurvey(surveyState);
        surveyMeasurements = [];
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
    // §2.5: Ctrl+Shift+S で名前を付けて保存、Ctrl+S で保存、Ctrl+O で開く
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      saveLoad.saveAs();
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveLoad.save();
    }
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      if (confirmUnsavedChanges()) saveLoad.open();
    }

    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      if (!isTextInputTarget(e.target)) {
        e.preventDefault();
        onSelectAllVertices();
      }
    }

    // §2.7.3: ツールモード切替（入力フォーカス時は無効）
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !isTextInputTarget(e.target)) {
      if (e.key === 'v' || e.key === 'V') { onModeChange('view'); }
      else if (e.key === 'a' || e.key === 'A') { onModeChange('add'); }
      else if (e.key === 'e' || e.key === 'E') { onModeChange('edit'); }
      else if (e.key === 'm' || e.key === 'M') { onModeChange('measure'); }
    }
  }

  /** 未保存変更の確認 */
  function confirmUnsavedChanges(): boolean {
    if (!dirtyState.isDirty) return true;
    return confirm('未保存の変更があります。続行しますか？');
  }

  /** 新規プロジェクト */
  function newProject(): void {
    if (!confirmUnsavedChanges()) return;
    saveLoad.resetProjectState();
    addFeature.restore(new Map(), new Map(), []);
    manageLayers.restore([]);
    manageLayers.addLayer('default', 'レイヤー1');
    refreshFeatureData();
    refreshLayerData();
    selectedFeatureId = null;
    selectedVertexIds = new Set();
    surveyState = resetSurvey(surveyState);
    surveyMeasurements = [];
    dirtyState = resetDirty();
    const resetMetadata = projectQueries.getMetadata();
    projectSettings = normalizeWorldSettings(resetMetadata.settings);
    projectMetadata = { ...resetMetadata, settings: projectSettings };
    lastBackupTime = Date.now();
  }

  /** ウィンドウクローズ時の未保存警告 */
  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (dirtyState.isDirty) {
      e.preventDefault();
    }
  }

  /** D&Dでファイルを読み込む */
  function onDrop(e: DragEvent): void {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) return;
    if (!confirmUnsavedChanges()) return;
    // Electronのfile.pathでファイルパスを取得
    const filePath = (file as File & { path?: string }).path;
    if (filePath) {
      saveLoad.loadFromPath(filePath);
    }
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
  }
</script>

<svelte:window
  onkeydown={onKeyDown}
  oncontextmenu={onContextMenu}
  onbeforeunload={onBeforeUnload}
  ondrop={onDrop}
  ondragover={onDragOver}
/>

<div class="app-layout">
  <MenuBar
    onNewProject={newProject}
    onOpen={() => { if (confirmUnsavedChanges()) saveLoad.open(); }}
    onSave={() => saveLoad.save()}
    onSaveAs={() => saveLoad.saveAs()}
    onUndo={() => { undoRedo.undo(); refreshFeatureData(); refreshLayerData(); }}
    onRedo={() => { undoRedo.redo(); refreshFeatureData(); refreshLayerData(); }}
    onSelectAll={onSelectAllVertices}
    onSettings={openSettings}
  />
  <div class="content-area">
  <div class="toolbar-area">
    <Toolbar
      mode={toolMode}
      {addToolType}
      {onModeChange}
      {onAddToolChange}
      onSettingsClick={openSettings}
    />
  </div>
  <div class="main-area">
    <div class="map-and-sidebar">
      <div class="map-area">
        <MapCanvas
          {features}
          {vertices}
          {layers}
          {focusedLayerId}
          settings={projectSettings}
          gridInterval={projectSettings.gridInterval}
          gridColor={projectSettings.gridColor}
          gridOpacity={projectSettings.gridOpacity}
          zoomMin={projectSettings.zoomMin}
          zoomMax={projectSettings.zoomMax}
          targetFps={appConfig.renderFps}
          vertexMarkerDisplayLimit={appConfig.alwaysVisibleVertexLimit}
          labelAreaThreshold={projectSettings.labelAreaThreshold}
          {currentTime}
          {toolMode}
          {addToolType}
          {isDrawing}
          {drawingCoords}
          {selectedFeatureId}
          selectionFeatureId={selectionFeatureId}
          vertexSelectionContextFeatureId={vertexSelectionContextFeatureId}
          {selectedVertexIds}
          {sharedGroups}
          {snapIndicators}
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
          showVertexHandles={editInteractionMode !== 'featureMove'}
          isRingDrawing={ringDrawingState !== null}
          ringDrawingCanConfirm={ringDrawingState ? canConfirmRing(ringDrawingState) : false}
          ringDrawingCoords={ringDrawingState?.coords ?? []}
          isFeatureMoveMode={editInteractionMode === 'featureMove'}
          {onToggleFeatureMove}
          {onAddRing}
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
          onAddMergeTarget={() => { if (selectionFeatureId) addMergeTarget(selectionFeatureId); }}
          {onStartMerge}
          onClearMerge={clearMergeTargets}
          {surveyMeasurements}
          surveyPointA={surveyState.pointA}
          surveyPointB={surveyState.pointB}
          {surveyResult}
          boxSelectBox={boxSelectState && isBoxLargeEnough(boxSelectState) ? getSelectionBox(boxSelectState) : null}
          {validationMessage}
        />
      </div>
      <div class="sidebar-area" class:collapsed={isSidebarCollapsed}>
        <Sidebar
          selectedFeature={getSelectionFeature()}
          propertySelectionState={getPropertyPanelSelectionState()}
          {focusedLayerId}
          settings={projectSettings}
          {currentTime}
          timelineMin={projectMetadata.sliderMin}
          timelineMax={projectMetadata.sliderMax}
          {features}
          isCollapsed={isSidebarCollapsed}
          onFocusLayerChange={(layerId) => {
            focusedLayerId = layerId;
          }}
          {onPropertyChange}
          onFeatureSelect={(id) => {
            selectedFeatureId = id;
            selectedVertexIds = new Set();
          }}
          onCollapsedChange={(collapsed) => {
            isSidebarCollapsed = collapsed;
          }}
        />
      </div>
    </div>
    <div class="bottom-area">
      <TimelinePanel
        sliderMin={projectMetadata.sliderMin}
        sliderMax={projectMetadata.sliderMax}
      />
      <StatusBar />
    </div>
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

<ProjectSettingsDialog
  isOpen={settingsDialogOpen}
  metadata={projectMetadata}
  settings={projectSettings}
  {appConfig}
  {layers}
  {lockedLayerIds}
  onSave={onSettingsSave}
  onClose={() => { settingsDialogOpen = false; }}
/>

<ContextMenu
  isOpen={contextMenuOpen}
  x={contextMenuX}
  y={contextMenuY}
  items={contextMenuItems}
  onClose={closeContextMenu}
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
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .content-area {
    flex: 1;
    display: flex;
    min-height: 0;
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
    transition:
      width 160ms ease,
      min-width 160ms ease;
  }

  .sidebar-area.collapsed {
    width: 48px;
    min-width: 48px;
    overflow: hidden;
  }

  .bottom-area {
    background: #252526;
    border-top: 1px solid #3c3c3c;
  }
</style>
