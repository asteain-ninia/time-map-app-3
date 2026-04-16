import { describe, expect, it, vi } from 'vitest';
import {
  attachUnsavedChangesCloseGuard,
  createUnsavedChangesTracker,
  registerUnsavedChangesIpc,
} from '../../src/main/closeGuard';

describe('closeGuard', () => {
  it('rendererからdirty状態を受け取る', () => {
    const tracker = createUnsavedChangesTracker();
    const ipcMain = { on: vi.fn() };

    registerUnsavedChangesIpc(ipcMain, tracker);
    const listener = ipcMain.on.mock.calls[0][1];
    listener({}, true);

    expect(ipcMain.on).toHaveBeenCalledWith('app:setDirtyState', expect.any(Function));
    expect(tracker.get()).toBe(true);
  });

  it('未保存変更があるときキャンセル選択でcloseを抑止する', () => {
    const tracker = createUnsavedChangesTracker();
    tracker.set(true);
    const browserWindow = { on: vi.fn() };
    const dialog = { showMessageBoxSync: vi.fn().mockReturnValue(0) };
    const event = { preventDefault: vi.fn() };

    attachUnsavedChangesCloseGuard(browserWindow, dialog, tracker);
    const listener = browserWindow.on.mock.calls[0][1];
    listener(event);

    expect(dialog.showMessageBoxSync).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(tracker.get()).toBe(true);
  });

  it('破棄して終了を選ぶとdirty状態を解除してcloseを続行する', () => {
    const tracker = createUnsavedChangesTracker();
    tracker.set(true);
    const browserWindow = { on: vi.fn() };
    const dialog = { showMessageBoxSync: vi.fn().mockReturnValue(1) };
    const event = { preventDefault: vi.fn() };

    attachUnsavedChangesCloseGuard(browserWindow, dialog, tracker);
    const listener = browserWindow.on.mock.calls[0][1];
    listener(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(tracker.get()).toBe(false);
  });
});
