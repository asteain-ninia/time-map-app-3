import { describe, it, expect } from 'vitest';
import { ConfigManager } from '@infrastructure/ConfigManager';
import { DEFAULT_SETTINGS, DEFAULT_METADATA } from '@domain/entities/World';

describe('ConfigManager', () => {
  describe('初期化', () => {
    it('デフォルト設定で初期化される', () => {
      const cm = new ConfigManager();
      expect(cm.getSettings()).toEqual(DEFAULT_SETTINGS);
      expect(cm.getMetadata()).toEqual(DEFAULT_METADATA);
    });

    it('カスタム設定で初期化できる', () => {
      const custom = { ...DEFAULT_SETTINGS, zoomMax: 100 };
      const cm = new ConfigManager(custom);
      expect(cm.getSettings().zoomMax).toBe(100);
    });
  });

  describe('プロジェクト設定', () => {
    it('部分更新ができる', () => {
      const cm = new ConfigManager();
      cm.updateSettings({ zoomMax: 200 });
      expect(cm.getSettings().zoomMax).toBe(200);
      expect(cm.getSettings().zoomMin).toBe(DEFAULT_SETTINGS.zoomMin);
    });

    it('メタデータを更新できる', () => {
      const cm = new ConfigManager();
      cm.updateMetadata({ worldName: '新世界' });
      expect(cm.getMetadata().worldName).toBe('新世界');
    });

    it('リセットでデフォルトに戻る', () => {
      const cm = new ConfigManager();
      cm.updateSettings({ zoomMax: 200 });
      cm.resetSettings();
      expect(cm.getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('restoreFromWorldで設定を復元できる', () => {
      const cm = new ConfigManager();
      const custom = { ...DEFAULT_SETTINGS, gridInterval: 20 };
      const meta = { ...DEFAULT_METADATA, worldName: '復元テスト' };
      cm.restoreFromWorld(custom, meta);

      expect(cm.getSettings().gridInterval).toBe(20);
      expect(cm.getMetadata().worldName).toBe('復元テスト');
    });
  });

  describe('アプリケーション設定', () => {
    it('デフォルトのアプリ設定がある', () => {
      const cm = new ConfigManager();
      const config = cm.getAppConfig();
      expect(config.recentFiles).toHaveLength(0);
      expect(config.autoSaveEnabled).toBe(true);
    });

    it('アプリ設定を更新できる', () => {
      const cm = new ConfigManager();
      cm.updateAppConfig({ autoSaveEnabled: false });
      expect(cm.getAppConfig().autoSaveEnabled).toBe(false);
    });

    it('最近使ったファイルを追加できる', () => {
      const cm = new ConfigManager();
      cm.addRecentFile('/path/to/file1.json');
      cm.addRecentFile('/path/to/file2.json');

      const recent = cm.getAppConfig().recentFiles;
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('/path/to/file2.json'); // 最新が先頭
    });

    it('重複ファイルは先頭に移動する', () => {
      const cm = new ConfigManager();
      cm.addRecentFile('/path/a.json');
      cm.addRecentFile('/path/b.json');
      cm.addRecentFile('/path/a.json');

      const recent = cm.getAppConfig().recentFiles;
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('/path/a.json');
    });

    it('最大10件に制限される', () => {
      const cm = new ConfigManager();
      for (let i = 0; i < 15; i++) {
        cm.addRecentFile(`/path/file${i}.json`);
      }
      expect(cm.getAppConfig().recentFiles).toHaveLength(10);
    });
  });
});
