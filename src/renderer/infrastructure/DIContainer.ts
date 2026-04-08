/**
 * 依存性注入コンテナ
 *
 * 技術方針§2.2: 全サービスの初期化を一元管理
 *
 * アプリケーション内の全UseCase/サービスの生成と依存関係解決を担う。
 * 手動DIパターン（Pure DI）を採用。フレームワーク不使用。
 */

import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UpdateFeatureAnchorUseCase } from '@application/UpdateFeatureAnchorUseCase';
import { EditFeatureUseCase } from '@application/EditFeatureUseCase';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { PrepareFeatureAnchorEditUseCase } from '@application/PrepareFeatureAnchorEditUseCase';
import { ResolveFeatureAnchorConflictsUseCase } from '@application/ResolveFeatureAnchorConflictsUseCase';
import { CommitFeatureAnchorEditUseCase } from '@application/CommitFeatureAnchorEditUseCase';
import type { DialogPort } from '@application/SaveLoadUseCase';
import { SaveLoadUseCase } from '@application/SaveLoadUseCase';
import {
  FeatureQueryService,
  LayerQueryService,
  TimelineQueryService,
  ProjectQueryService,
} from '@application/queries';
import type { WorldRepository } from '@domain/repositories/WorldRepository';
import { ConfigManager } from './ConfigManager';
import {
  JSONWorldRepository,
  createElectronFileSystem,
  type FileSystemPort,
} from './persistence/JSONWorldRepository';

export interface ApplicationCommands {
  readonly addFeature: AddFeatureUseCase;
  readonly vertexEdit: VertexEditUseCase;
  readonly anchorEdit: UpdateFeatureAnchorUseCase;
  readonly editFeature: EditFeatureUseCase;
  readonly deleteFeature: DeleteFeatureUseCase;
  readonly navigateTime: NavigateTimeUseCase;
  readonly manageLayers: ManageLayersUseCase;
  readonly undoRedo: UndoRedoManager;
  readonly prepareAnchorEdit: PrepareFeatureAnchorEditUseCase;
  readonly resolveConflicts: ResolveFeatureAnchorConflictsUseCase;
  readonly commitAnchorEdit: CommitFeatureAnchorEditUseCase;
  readonly saveLoad: SaveLoadUseCase;
}

export interface ApplicationQueries {
  readonly features: FeatureQueryService;
  readonly layers: LayerQueryService;
  readonly timeline: TimelineQueryService;
  readonly project: ProjectQueryService;
}

export interface InfrastructureServices {
  readonly configManager: ConfigManager;
  readonly repository: WorldRepository;
}

export interface DIContainerDependencies {
  readonly configManager?: ConfigManager;
  readonly repository?: WorldRepository;
  readonly dialog?: DialogPort;
}

function createUnavailableFileSystem(): FileSystemPort {
  return {
    async readFile(): Promise<string> {
      throw new Error('Electron file system is unavailable in this environment');
    },
    async writeFile(): Promise<void> {
      throw new Error('Electron file system is unavailable in this environment');
    },
  };
}

function createRepository(): WorldRepository {
  return new JSONWorldRepository(
    typeof window === 'undefined' || typeof window.api === 'undefined'
      ? createUnavailableFileSystem()
      : createElectronFileSystem()
  );
}

function createDialog(): DialogPort {
  if (typeof window === 'undefined' || typeof window.api === 'undefined') {
    return {
      showOpenDialog: async () => null,
      showSaveDialog: async () => null,
    };
  }

  return {
    showOpenDialog: () => window.api.showOpenDialog(),
    showSaveDialog: () => window.api.showSaveDialog(),
  };
}

/**
 * DIコンテナ — 全サービスを初期化し、シングルトンとして提供する
 */
export class DIContainer {
  readonly commands: ApplicationCommands;
  readonly queries: ApplicationQueries;
  readonly infrastructure: InfrastructureServices;

  constructor(dependencies: DIContainerDependencies = {}) {
    const configManager = dependencies.configManager ?? new ConfigManager();
    const repository = dependencies.repository ?? createRepository();
    const dialog = dependencies.dialog ?? createDialog();

    const addFeature = new AddFeatureUseCase();
    const vertexEdit = new VertexEditUseCase(addFeature);
    const anchorEdit = new UpdateFeatureAnchorUseCase(addFeature);
    const editFeature = new EditFeatureUseCase(
      addFeature, vertexEdit, anchorEdit
    );
    const deleteFeature = new DeleteFeatureUseCase(addFeature);
    const navigateTime = new NavigateTimeUseCase();
    const manageLayers = new ManageLayersUseCase();
    const undoRedo = new UndoRedoManager();
    const prepareAnchorEdit = new PrepareFeatureAnchorEditUseCase(addFeature);
    const resolveConflicts = new ResolveFeatureAnchorConflictsUseCase(
      addFeature, prepareAnchorEdit
    );
    const commitAnchorEdit = new CommitFeatureAnchorEditUseCase(
      addFeature, prepareAnchorEdit
    );
    const saveLoad = new SaveLoadUseCase(
      repository,
      dialog,
      addFeature,
      manageLayers,
      navigateTime
    );

    this.commands = {
      addFeature,
      vertexEdit,
      anchorEdit,
      editFeature,
      deleteFeature,
      navigateTime,
      manageLayers,
      undoRedo,
      prepareAnchorEdit,
      resolveConflicts,
      commitAnchorEdit,
      saveLoad,
    };

    this.queries = {
      features: new FeatureQueryService(addFeature),
      layers: new LayerQueryService(manageLayers),
      timeline: new TimelineQueryService(navigateTime),
      project: new ProjectQueryService(saveLoad, configManager),
    };

    this.infrastructure = {
      configManager,
      repository,
    };
  }
}

/** シングルトンインスタンス */
let _instance: DIContainer | null = null;

/**
 * DIコンテナのシングルトンインスタンスを取得する
 */
export function getContainer(): DIContainer {
  if (!_instance) {
    _instance = new DIContainer();
  }
  return _instance;
}

/**
 * DIコンテナをリセットする（テスト用）
 */
export function resetContainer(): void {
  _instance = null;
}
