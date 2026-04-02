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
  readonly snapDistancePx: number;
  readonly renderFps: number;
  readonly alwaysVisibleVertexLimit: number;
}

export interface AppConfigStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const APP_CONFIG_STORAGE_KEY = 'time-map-app:app-config';

const DEFAULT_APP_CONFIG: AppConfig = {
  recentFiles: [],
  windowWidth: 1200,
  windowHeight: 800,
  lastOpenPath: '',
  autoSaveEnabled: true,
  snapDistancePx: 50,
  renderFps: 60,
  alwaysVisibleVertexLimit: 1000,
};

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeAppConfig(appConfig: Partial<AppConfig>): AppConfig {
  const recentFiles = Array.isArray(appConfig.recentFiles)
    ? [...new Set(appConfig.recentFiles.filter((filePath): filePath is string => typeof filePath === 'string'))].slice(0, 10)
    : [...DEFAULT_APP_CONFIG.recentFiles];

  return {
    recentFiles,
    windowWidth: normalizePositiveInteger(appConfig.windowWidth, DEFAULT_APP_CONFIG.windowWidth, 1),
    windowHeight: normalizePositiveInteger(appConfig.windowHeight, DEFAULT_APP_CONFIG.windowHeight, 1),
    lastOpenPath: typeof appConfig.lastOpenPath === 'string'
      ? appConfig.lastOpenPath
      : DEFAULT_APP_CONFIG.lastOpenPath,
    autoSaveEnabled: typeof appConfig.autoSaveEnabled === 'boolean'
      ? appConfig.autoSaveEnabled
      : DEFAULT_APP_CONFIG.autoSaveEnabled,
    snapDistancePx: normalizePositiveInteger(appConfig.snapDistancePx, DEFAULT_APP_CONFIG.snapDistancePx, 1),
    renderFps: normalizePositiveInteger(appConfig.renderFps, DEFAULT_APP_CONFIG.renderFps, 1, 60),
    alwaysVisibleVertexLimit: normalizePositiveInteger(
      appConfig.alwaysVisibleVertexLimit,
      DEFAULT_APP_CONFIG.alwaysVisibleVertexLimit,
      1
    ),
  };
}

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
    this.appConfig = normalizeAppConfig({ ...DEFAULT_APP_CONFIG, ...appConfig });
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
    return {
      ...this.appConfig,
      recentFiles: [...this.appConfig.recentFiles],
    };
  }

  updateAppConfig(partial: Partial<AppConfig>): void {
    this.appConfig = normalizeAppConfig({ ...this.appConfig, ...partial });
  }

  restoreAppConfig(appConfig: Partial<AppConfig>): void {
    this.appConfig = normalizeAppConfig({ ...DEFAULT_APP_CONFIG, ...appConfig });
  }

  loadAppConfig(storage: AppConfigStorage): void {
    const raw = storage.getItem(APP_CONFIG_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      this.restoreAppConfig(JSON.parse(raw) as Partial<AppConfig>);
    } catch {
      this.appConfig = normalizeAppConfig(DEFAULT_APP_CONFIG);
    }
  }

  saveAppConfig(storage: AppConfigStorage): void {
    storage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(this.appConfig));
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
