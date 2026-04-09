import { dirname, join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { JSON_FILTERS, createIpcHandlers, registerIpcHandlers } from '../../src/main/ipcHandlers';

function createDeps() {
  const fs = {
    access: vi.fn<(_: string) => Promise<void>>(),
    appendFile: vi.fn<(_: string, __: string, ___: BufferEncoding) => Promise<void>>(),
    mkdir: vi.fn<(_: string, __: { recursive: boolean }) => Promise<void>>(),
    readdir: vi.fn<(_: string, __: { withFileTypes: true }) => Promise<readonly { isFile(): boolean; name: string }[]>>(),
    readFile: vi.fn<(_: string, __: BufferEncoding) => Promise<string>>(),
    unlink: vi.fn<(_: string) => Promise<void>>(),
    writeFile: vi.fn<(_: string, __: string, ___: BufferEncoding) => Promise<void>>(),
  };
  const app = {
    isPackaged: false,
    getAppPath: vi.fn<() => string>().mockReturnValue('E:/app'),
    getPath: vi.fn<(_: 'exe') => string>().mockReturnValue('E:/dist/app.exe'),
  };
  const dialog = {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  };

  return { app, dialog, fs };
}

describe('ipcHandlers', () => {
  it('全ハンドラを ipcMain に登録する', () => {
    const ipcMain = { handle: vi.fn() };

    registerIpcHandlers({ ipcMain, ...createDeps() });

    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual([
      'file:read',
      'file:write',
      'file:append',
      'file:exists',
      'file:list',
      'file:delete',
      'file:autoBackupRoot',
      'file:logRoot',
      'dialog:open',
      'dialog:save',
    ]);
  });

  it('file:write が親ディレクトリを作成して書き込む', async () => {
    const deps = createDeps();
    deps.fs.mkdir.mockResolvedValue();
    deps.fs.writeFile.mockResolvedValue();
    const handlers = createIpcHandlers(deps);
    const filePath = 'E:/workspace/save/world.json';

    await handlers['file:write']({}, filePath, '{"version":"1.0.0"}');

    expect(deps.fs.mkdir).toHaveBeenCalledWith(dirname(filePath), { recursive: true });
    expect(deps.fs.writeFile).toHaveBeenCalledWith(filePath, '{"version":"1.0.0"}', 'utf-8');
  });

  it('file:append が親ディレクトリを作成して追記する', async () => {
    const deps = createDeps();
    deps.fs.mkdir.mockResolvedValue();
    deps.fs.appendFile.mockResolvedValue();
    const handlers = createIpcHandlers(deps);
    const filePath = 'E:/workspace/logs/time-map-app.log';

    await handlers['file:append']({}, filePath, '{"message":"ok"}\n');

    expect(deps.fs.mkdir).toHaveBeenCalledWith(dirname(filePath), { recursive: true });
    expect(deps.fs.appendFile).toHaveBeenCalledWith(filePath, '{"message":"ok"}\n', 'utf-8');
  });

  it('file:list がファイル名だけを返し、ENOENT は空配列にする', async () => {
    const deps = createDeps();
    deps.fs.readdir.mockResolvedValue([
      { name: 'a.json', isFile: () => true },
      { name: 'nested', isFile: () => false },
      { name: 'b.json', isFile: () => true },
    ]);
    const handlers = createIpcHandlers(deps);

    await expect(handlers['file:list']({}, 'E:/workspace/savebackup')).resolves.toEqual([
      'a.json',
      'b.json',
    ]);

    deps.fs.readdir.mockRejectedValueOnce({ code: 'ENOENT' });
    await expect(handlers['file:list']({}, 'E:/workspace/missing')).resolves.toEqual([]);
  });

  it('file:autoBackupRoot と file:logRoot が開発時とパッケージ時で正しい保存先を返す', async () => {
    const deps = createDeps();
    const handlers = createIpcHandlers(deps);

    await expect(handlers['file:autoBackupRoot']({})).resolves.toBe(join('E:/app', 'savebackup'));
    await expect(handlers['file:logRoot']({})).resolves.toBe(join('E:/app', 'logs'));

    deps.app.isPackaged = true;
    await expect(handlers['file:autoBackupRoot']({})).resolves.toBe(join('E:/dist', 'savebackup'));
    await expect(handlers['file:logRoot']({})).resolves.toBe(join('E:/dist', 'logs'));
  });

  it('dialog ハンドラが JSON フィルタと戻り値を正しく扱う', async () => {
    const deps = createDeps();
    deps.dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['E:/workspace/save/world.json'],
    });
    deps.dialog.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });
    const handlers = createIpcHandlers(deps);

    await expect(handlers['dialog:open']({})).resolves.toBe('E:/workspace/save/world.json');
    await expect(handlers['dialog:save']({})).resolves.toBeNull();

    expect(deps.dialog.showOpenDialog).toHaveBeenCalledWith({
      filters: JSON_FILTERS,
      properties: ['openFile'],
    });
    expect(deps.dialog.showSaveDialog).toHaveBeenCalledWith({
      filters: JSON_FILTERS,
    });
  });
});
