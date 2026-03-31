import { describe, it, expect, vi } from 'vitest';
import {
  buildBackupDirectoryPath,
  createAutoBackup,
  createBackupTimestamp,
  DEFAULT_BACKUP_CONFIG,
  getBackupDirectoryName,
  getBackupFileName,
  getBackupFilesToDelete,
  shouldBackup,
} from '@infrastructure/rendering/autoBackupManager';

describe('autoBackupManager', () => {
  describe('DEFAULT_BACKUP_CONFIG', () => {
    it('5分間隔、10世代', () => {
      expect(DEFAULT_BACKUP_CONFIG.intervalMs).toBe(300000);
      expect(DEFAULT_BACKUP_CONFIG.maxGenerations).toBe(10);
    });
  });

  describe('getBackupDirectoryName', () => {
    it('POSIXパスの保存ファイル名を返す', () => {
      expect(getBackupDirectoryName('/path/to/file.json'))
        .toBe('file.json');
    });

    it('Windowsパスの保存ファイル名を返す', () => {
      expect(getBackupDirectoryName('C:\\path\\to\\file.json'))
        .toBe('file.json');
    });
  });

  describe('buildBackupDirectoryPath', () => {
    it('POSIXパスの保存先ディレクトリを生成する', () => {
      expect(buildBackupDirectoryPath('/app/savebackup', '/path/to/file.json'))
        .toBe('/app/savebackup/file.json');
    });

    it('Windowsパスの保存先ディレクトリを生成する', () => {
      expect(buildBackupDirectoryPath('C:\\app\\savebackup', 'C:\\path\\to\\file.json'))
        .toBe('C:\\app\\savebackup\\file.json');
    });
  });

  describe('createBackupTimestamp', () => {
    it('UTCベースの固定幅タイムスタンプを生成する', () => {
      expect(createBackupTimestamp(new Date(Date.UTC(2026, 2, 31, 11, 22, 33, 444))))
        .toBe('20260331-112233-444');
    });
  });

  describe('getBackupFileName', () => {
    it('通常のバックアップファイル名を生成する', () => {
      expect(getBackupFileName('20260331-112233-444'))
        .toBe('20260331-112233-444.json');
    });

    it('重複時のサフィックスを付与する', () => {
      expect(getBackupFileName('20260331-112233-444', 1))
        .toBe('20260331-112233-444-1.json');
    });
  });

  describe('getBackupFilesToDelete', () => {
    it('保持上限を超えた最古バックアップだけを返す', () => {
      expect(getBackupFilesToDelete([
        '20260331-090000-000.json',
        '20260331-100000-000.json',
        '20260331-110000-000.json',
      ], 2)).toEqual(['20260331-090000-000.json']);
    });

    it('バックアップ以外のファイルは削除対象に含めない', () => {
      expect(getBackupFilesToDelete([
        '20260331-090000-000.json',
        'memo.txt',
        '20260331-100000-000.json',
      ], 2)).toEqual([]);
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

  describe('createAutoBackup', () => {
    it('savebackup配下へタイムスタンプ付きバックアップを保存し、超過分を削除する', async () => {
      const writes: Array<{ path: string; data: string }> = [];
      const deletes: string[] = [];
      const listFiles = vi.fn(async (_dirPath: string) => [
        '20260331-090000-000.json',
        '20260331-100000-000.json',
        'note.txt',
      ]);
      const filePort = {
        writeFile: async (filePath: string, data: string) => {
          writes.push({ path: filePath, data });
        },
        listFiles,
        deleteFile: async (filePath: string) => {
          deletes.push(filePath);
        },
        getAutoBackupRootPath: async () => '/app/savebackup',
      };

      const backupPath = await createAutoBackup(
        '/projects/world.json',
        '{"world":true}',
        2,
        filePort,
        new Date(Date.UTC(2026, 2, 31, 12, 0, 0, 0))
      );

      expect(listFiles).toHaveBeenCalledWith('/app/savebackup/world.json');
      expect(backupPath).toBe('/app/savebackup/world.json/20260331-120000-000.json');
      expect(writes).toEqual([
        {
          path: '/app/savebackup/world.json/20260331-120000-000.json',
          data: '{"world":true}',
        },
      ]);
      expect(deletes).toEqual([
        '/app/savebackup/world.json/20260331-090000-000.json',
      ]);
    });

    it('同一タイムスタンプが存在するときは重複回避サフィックスを付ける', async () => {
      const writes: string[] = [];
      const filePort = {
        writeFile: async (filePath: string, _data: string) => {
          writes.push(filePath);
        },
        listFiles: async (_dirPath: string) => [
          '20260331-120000-000.json',
        ],
        deleteFile: async (_filePath: string) => undefined,
        getAutoBackupRootPath: async () => '/app/savebackup',
      };

      await createAutoBackup(
        '/projects/world.json',
        '{}',
        10,
        filePort,
        new Date(Date.UTC(2026, 2, 31, 12, 0, 0, 0))
      );

      expect(writes).toEqual([
        '/app/savebackup/world.json/20260331-120000-000-1.json',
      ]);
    });
  });
});
