import type { SaveLoadUseCase } from '@application/SaveLoadUseCase';
import type { ConfigManager, AppConfig } from '@infrastructure/ConfigManager';
import type { WorldMetadata, WorldSettings } from '@domain/entities/World';

/**
 * プロジェクト設定・アプリ設定の読み取り専用クエリ。
 */
export class ProjectQueryService {
  constructor(
    private readonly saveLoad: SaveLoadUseCase,
    private readonly configManager: ConfigManager
  ) {}

  getMetadata(): WorldMetadata {
    return this.saveLoad.getMetadata();
  }

  getSettings(): WorldSettings {
    return this.saveLoad.getMetadata().settings;
  }

  getCurrentFilePath(): string | null {
    return this.saveLoad.getCurrentFilePath();
  }

  getAppConfig(): AppConfig {
    return this.configManager.getAppConfig();
  }
}
