import { describe, expect, it, vi } from 'vitest';
import { createPreloadApi } from '../../src/preload/api';

describe('createPreloadApi', () => {
  it.each([
    ['readFile', ['save.json'], 'file:read'],
    ['writeFile', ['save.json', '{"ok":true}'], 'file:write'],
    ['existsFile', ['save.json'], 'file:exists'],
    ['listFiles', ['savebackup'], 'file:list'],
    ['deleteFile', ['save.json'], 'file:delete'],
    ['getAutoBackupRootPath', [], 'file:autoBackupRoot'],
    ['showOpenDialog', [], 'dialog:open'],
    ['showSaveDialog', [], 'dialog:save'],
  ] as const)('%s が正しい IPC チャネルへ委譲される', async (method, args, channel) => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = createPreloadApi({ invoke });

    await (api[method] as (...callArgs: string[]) => Promise<unknown>)(...args);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(channel, ...args);
  });
});
