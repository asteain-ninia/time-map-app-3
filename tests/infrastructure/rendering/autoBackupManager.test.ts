import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BACKUP_CONFIG,
  getBackupFileName,
  getRotationPlan,
  shouldBackup,
} from '@infrastructure/rendering/autoBackupManager';

describe('autoBackupManager', () => {
  describe('DEFAULT_BACKUP_CONFIG', () => {
    it('5分間隔、5世代', () => {
      expect(DEFAULT_BACKUP_CONFIG.intervalMs).toBe(300000);
      expect(DEFAULT_BACKUP_CONFIG.maxGenerations).toBe(5);
    });
  });

  describe('getBackupFileName', () => {
    it('拡張子ありのファイル', () => {
      expect(getBackupFileName('/path/to/file.json', 1))
        .toBe('/path/to/file.backup-1.json');
    });

    it('世代番号が変わる', () => {
      expect(getBackupFileName('/path/to/file.json', 3))
        .toBe('/path/to/file.backup-3.json');
    });

    it('拡張子なしのファイル', () => {
      expect(getBackupFileName('/path/to/file', 2))
        .toBe('/path/to/file.backup-2');
    });

    it('複数ドットのファイル名', () => {
      expect(getBackupFileName('/path/to/my.project.json', 1))
        .toBe('/path/to/my.project.backup-1.json');
    });
  });

  describe('getRotationPlan', () => {
    it('5世代のローテーション計画', () => {
      const plan = getRotationPlan(5);
      expect(plan).toEqual([
        { from: 4, to: 5 },
        { from: 3, to: 4 },
        { from: 2, to: 3 },
        { from: 1, to: 2 },
      ]);
    });

    it('2世代のローテーション計画', () => {
      const plan = getRotationPlan(2);
      expect(plan).toEqual([{ from: 1, to: 2 }]);
    });

    it('1世代はローテーション不要', () => {
      const plan = getRotationPlan(1);
      expect(plan).toEqual([]);
    });
  });

  describe('shouldBackup', () => {
    it('間隔を超えたらtrue', () => {
      expect(shouldBackup(0, 300001, 300000)).toBe(true);
    });

    it('間隔ちょうどでtrue', () => {
      expect(shouldBackup(1000, 301000, 300000)).toBe(true);
    });

    it('間隔未満でfalse', () => {
      expect(shouldBackup(0, 299999, 300000)).toBe(false);
    });
  });
});
