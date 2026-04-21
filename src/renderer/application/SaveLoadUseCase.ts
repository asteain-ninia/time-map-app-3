/**
 * 保存/読み込みユースケース
 *
 * §2.5: Worldの永続化。Ctrl+S/Ctrl+Oでトリガーされる。
 * §5.3: アプリケーション層でリポジトリを呼び出し、
 *        各ユースケースの状態を World 集約ルートに組み立て/分配する。
 */

import { World, DEFAULT_METADATA, type WorldMetadata, type WorldSettings } from '@domain/entities/World';
import type { LoadWorldResult, WorldRepository } from '@domain/repositories/WorldRepository';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { ManageLayersUseCase } from './ManageLayersUseCase';
import type { NavigateTimeUseCase } from './NavigateTimeUseCase';
import { eventBus } from './EventBus';

/** ファイルダイアログの抽象化 */
export interface DialogPort {
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
}

function cloneSettings(settings: WorldSettings): WorldSettings {
  return {
    ...settings,
    customPalettes: [...settings.customPalettes],
    baseMap: { ...settings.baseMap },
  };
}

function cloneMetadata(metadata: WorldMetadata): WorldMetadata {
  return {
    ...metadata,
    settings: cloneSettings(metadata.settings),
  };
}

export class SaveLoadUseCase {
  private currentFilePath: string | null = null;
  private metadata: WorldMetadata = cloneMetadata(DEFAULT_METADATA);

  constructor(
    private readonly repository: WorldRepository,
    private readonly dialog: DialogPort,
    private readonly addFeature: AddFeatureUseCase,
    private readonly manageLayers: ManageLayersUseCase,
    private readonly navigateTime: NavigateTimeUseCase
  ) {}

  /** メタデータを設定する（プロジェクト設定変更時に呼ぶ） */
  setMetadata(metadata: WorldMetadata): void {
    this.metadata = cloneMetadata(metadata);
  }

  /** メタデータを取得する */
  getMetadata(): WorldMetadata {
    return cloneMetadata(this.metadata);
  }

  /** 現在のファイルパスを取得する */
  getCurrentFilePath(): string | null {
    return this.currentFilePath;
  }

  /**
   * 名前を付けて保存（Ctrl+Shift+S）
   * ダイアログでファイルパスを選択し保存する
   */
  async saveAs(): Promise<boolean> {
    const filePath = await this.dialog.showSaveDialog();
    if (!filePath) return false;
    return this.saveToPath(filePath);
  }

  /**
   * 上書き保存（Ctrl+S）
   * パスが未設定の場合はsaveAsにフォールバック
   */
  async save(): Promise<boolean> {
    if (!this.currentFilePath) {
      return this.saveAs();
    }
    return this.saveToPath(this.currentFilePath);
  }

  /**
   * ファイルを開く（Ctrl+O）
   * ダイアログでファイルを選択し読み込む
   */
  async open(): Promise<boolean> {
    const filePath = await this.dialog.showOpenDialog();
    if (!filePath) return false;
    return this.loadFromPath(filePath);
  }

  /**
   * 指定パスから読み込む（最近使ったファイル等）
   */
  async loadFromPath(filePath: string): Promise<boolean> {
    const result = await this.loadWorld(filePath);
    this.distributeWorld(result.world);
    this.currentFilePath = filePath;
    eventBus.emit('world:loaded', {
      filePath,
      compatibilityWarnings: result.compatibilityWarnings,
    });
    return true;
  }

  /** 新規プロジェクト開始時に保存先とメタデータを初期化する */
  resetProjectState(): void {
    this.currentFilePath = null;
    this.metadata = cloneMetadata(DEFAULT_METADATA);
  }

  /** 現在の状態をWorldに組み立てる */
  assembleWorld(): World {
    return new World(
      '1.0.0',
      this.addFeature.getVertices(),
      this.addFeature.getFeaturesMap(),
      this.manageLayers.getLayers(),
      this.addFeature.getSharedVertexGroups(),
      [],
      this.metadata
    );
  }

  /** 指定パスに保存する */
  private async saveToPath(filePath: string): Promise<boolean> {
    const world = this.assembleWorld();
    await this.repository.save(filePath, world);
    this.currentFilePath = filePath;
    eventBus.emit('world:saved', { filePath });
    return true;
  }

  private async loadWorld(filePath: string): Promise<LoadWorldResult> {
    if (this.repository.loadWithReport) {
      return this.repository.loadWithReport(filePath);
    }
    return {
      world: await this.repository.load(filePath),
      compatibilityWarnings: [],
    };
  }

  /** 読み込んだWorldの内容を各ユースケースに分配する */
  private distributeWorld(world: World): void {
    this.addFeature.restore(world.features, world.vertices, world.sharedVertexGroups);
    this.manageLayers.restore(world.layers);
    this.metadata = cloneMetadata(world.metadata);
  }
}
