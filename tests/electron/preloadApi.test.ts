import { describe, expect, it, vi } from 'vitest';
import { createPreloadApi } from '../../src/preload/api';

describe('createPreloadApi', () => {
  it.each([
    ['readFile', ['save.json'], 'file:read'],
    ['writeFile', ['save.json', '{"ok":true}'], 'file:write'],
    ['readBinaryFile', ['save.gimoza'], 'file:readBinary'],
    ['writeBinaryFile', ['save.gimoza', 'UEs='], 'file:writeBinary'],
    ['appendFile', ['logs/gimoza.log', '{"ok":true}'], 'file:append'],
    ['existsFile', ['save.json'], 'file:exists'],
    ['listFiles', ['savebackup'], 'file:list'],
    ['deleteFile', ['save.json'], 'file:delete'],
    ['getAutoBackupRootPath', [], 'file:autoBackupRoot'],
    ['getLogRootPath', [], 'file:logRoot'],
    ['showOpenDialog', [], 'dialog:open'],
    ['showSaveDialog', [], 'dialog:save'],
  ] as const)('%s が正しい IPC チャネルへ委譲される', async (method, args, channel) => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = createPreloadApi({ invoke });

    await (api[method] as (...callArgs: string[]) => Promise<unknown>)(...args);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(channel, ...args);
  });

  it('setUnsavedChanges は送信用IPCでdirty状態を通知する', () => {
    const send = vi.fn();
    const api = createPreloadApi({ invoke: vi.fn(), send });

    api.setUnsavedChanges(true);

    expect(send).toHaveBeenCalledWith('app:setDirtyState', true);
  });
});
