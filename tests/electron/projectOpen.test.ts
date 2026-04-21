import { describe, expect, it, vi } from 'vitest';
import {
  findProjectPathArg,
  isSupportedProjectPath,
  revealProjectOpenWindow,
  sendProjectPathToWindow,
  type ProjectOpenWindow,
} from '../../src/main/projectOpen';

function createWindowMock(isLoading = false): ProjectOpenWindow & {
  send: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const once = vi.fn();
  const focus = vi.fn();
  const restore = vi.fn();

  return {
    isMinimized: () => true,
    restore,
    focus,
    webContents: {
      isLoading: () => isLoading,
      once,
      send,
    },
    send,
    once,
  };
}

describe('projectOpen', () => {
  it.each([
    'world.gimoza',
    'WORLD.GIMOZA',
    'legacy.json',
  ])('対応プロジェクトファイルを判定する: %s', (filePath) => {
    expect(isSupportedProjectPath(filePath)).toBe(true);
  });

  it.each([
    'world.txt',
    'gimoza.zip',
    'project.gimoza.backup',
  ])('非対応ファイルを拒否する: %s', (filePath) => {
    expect(isSupportedProjectPath(filePath)).toBe(false);
  });

  it('起動引数から最初のプロジェクトパスを取り出す', () => {
    expect(findProjectPathArg(['electron.exe', '.', 'C:\\worlds\\test.gimoza']))
      .toBe('C:\\worlds\\test.gimoza');
  });

  it('ウィンドウが読み込み済みなら即座にrendererへ送る', () => {
    const window = createWindowMock(false);

    sendProjectPathToWindow(window, 'C:\\worlds\\test.gimoza');

    expect(window.send).toHaveBeenCalledWith(
      'app:openProjectPath',
      'C:\\worlds\\test.gimoza'
    );
  });

  it('ウィンドウ読み込み中ならdid-finish-loadまで送信を待つ', () => {
    const window = createWindowMock(true);

    sendProjectPathToWindow(window, 'C:\\worlds\\test.gimoza');

    expect(window.send).not.toHaveBeenCalled();
    const listener = window.once.mock.calls[0]?.[1] as (() => void) | undefined;
    listener?.();
    expect(window.send).toHaveBeenCalledWith(
      'app:openProjectPath',
      'C:\\worlds\\test.gimoza'
    );
  });

  it('二重起動時に既存ウィンドウを前面へ戻す', () => {
    const window = createWindowMock(false);

    revealProjectOpenWindow(window);

    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });
});
