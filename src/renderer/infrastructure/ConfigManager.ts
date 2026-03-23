/**
 * 設定管理サービス
 *
 * §5.4: ConfigManager — プロジェクト設定/アプリケーション設定の管理
 *
 * WorldSettings（プロジェクト設定）をランタイムで管理する。
 * 保存/読み込みは SaveLoadUseCase が担当するため、
 * ここでは in-memory のアクセスと更新のみを提供する。
 */

import type { WorldSettings, WorldMetadata } from '@domain/entities/World';
import { DEFAULT_SETTINGS, DEFAULT_METADATA } from '@domain/entities/World';

/** アプリケーションレベルの設定（プロジェクト横断） */
export interface AppConfig {
  readonly recentFiles: readonly string[];
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly lastOpenPath: string;
  readonly autoSaveEnabled: boolean;
}

const DEFAULT_APP_CONFIG: AppConfig = {
  recentFiles: [],
  windowWidth: 1200,
  windowHeight: 800,
  lastOpenPath: '',
  autoSaveEnabled: true,
};

/**
 * 設定管理サービス
 */
export class ConfigManager {
  private settings: WorldSettings;
  private metadata: WorldMetadata;
  private appConfig: AppConfig;

  constructor(
    settings?: WorldSettings,
    metadata?: WorldMetadata,
    appConfig?: Partial<AppConfig>
  ) {
    this.settings = settings ?? DEFAULT_SETTINGS;
    this.metadata = metadata ?? DEFAULT_METADATA;
    this.appConfig = { ...DEFAULT_APP_CONFIG, ...appConfig };
  }

  // ──────────────────────────────────────────
  // プロジェクト設定
  // ──────────────────────────────────────────

  getSettings(): WorldSettings {
    return this.settings;
  }

  updateSettings(partial: Partial<WorldSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  getMetadata(): WorldMetadata {
    return this.metadata;
  }

  updateMetadata(partial: Partial<WorldMetadata>): void {
    this.metadata = { ...this.metadata, ...partial };
    // settings はネストされているので特別扱い
    if (partial.settings) {
      this.settings = { ...this.settings, ...partial.settings };
    }
  }

  /**
   * プロジェクト設定をリセットする
   */
  resetSettings(): void {
    this.settings = DEFAULT_SETTINGS;
    this.metadata = DEFAULT_METADATA;
  }

  /**
   * 保存データからプロジェクト設定を復元する
   */
  restoreFromWorld(settings: WorldSettings, metadata: WorldMetadata): void {
    this.settings = settings;
    this.metadata = metadata;
  }

  // ──────────────────────────────────────────
  // アプリケーション設定
  // ──────────────────────────────────────────

  getAppConfig(): AppConfig {
    return this.appConfig;
  }

  updateAppConfig(partial: Partial<AppConfig>): void {
    this.appConfig = { ...this.appConfig, ...partial };
  }

  /**
   * 最近使ったファイルリストに追加する
   */
  addRecentFile(filePath: string): void {
    const filtered = this.appConfig.recentFiles.filter(f => f !== filePath);
    const updated = [filePath, ...filtered].slice(0, 10); // 最大10件
    this.appConfig = { ...this.appConfig, recentFiles: updated };
  }
}
