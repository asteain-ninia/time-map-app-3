/**
 * 保存/読み込みユースケース
 *
 * §2.5: Worldの永続化。Ctrl+S/Ctrl+Oでトリガーされる。
 * §5.3: アプリケーション層でリポジトリを呼び出し、
 *        各ユースケースの状態を World 集約ルートに組み立て/分配する。
 */

import { World, DEFAULT_METADATA, type WorldMetadata } from '@domain/entities/World';
import type { WorldRepository } from '@domain/repositories/WorldRepository';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import type { ManageLayersUseCase } from './ManageLayersUseCase';
import type { NavigateTimeUseCase } from './NavigateTimeUseCase';
import { eventBus } from './EventBus';

/** ファイルダイアログの抽象化 */
export interface DialogPort {
  showOpenDialog(): Promise<string | null>;
  showSaveDialog(): Promise<string | null>;
}

export class SaveLoadUseCase {
  private currentFilePath: string | null = null;

  constructor(
    private readonly repository: WorldRepository,
    private readonly dialog: DialogPort,
    private readonly addFeature: AddFeatureUseCase,
    private readonly manageLayers: ManageLayersUseCase,
    private readonly navigateTime: NavigateTimeUseCase
  ) {}

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
    const world = await this.repository.load(filePath);
    this.distributeWorld(world);
    this.currentFilePath = filePath;
    eventBus.emit('world:loaded', { filePath });
    return true;
  }

  /** 現在の状態をWorldに組み立てる */
  assembleWorld(): World {
    const metadata: WorldMetadata = {
      ...DEFAULT_METADATA,
      sliderMin: 0,
      sliderMax: 10000,
    };

    return new World(
      '1.0.0',
      this.addFeature.getVertices(),
      this.addFeature.getFeaturesMap(),
      this.manageLayers.getLayers(),
      new Map(),
      [],
      metadata
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

  /** 読み込んだWorldの内容を各ユースケースに分配する */
  private distributeWorld(world: World): void {
    this.addFeature.restore(world.features, world.vertices);
    this.manageLayers.restore(world.layers);
    // メタデータのスライダー範囲は将来のNavigateTimeUseCase拡張で対応
  }
}
