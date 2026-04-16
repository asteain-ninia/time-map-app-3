import { describe, expect, it, vi } from 'vitest';
import {
  APP_TITLE,
  createMainWindow,
  disableApplicationMenu,
  MIN_HEIGHT,
  MIN_WIDTH,
  type MainWindowOptions,
} from '../../src/main/window';

function normalizePath(path: string | undefined): string | undefined {
  return path?.replaceAll('\\', '/');
}

class BrowserWindowMock {
  static lastOptions: MainWindowOptions | null = null;
  static lastInstance: BrowserWindowMock | null = null;

  readonly webContents = {
    setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => { action: 'deny' | 'allow' }) => {
      this.windowOpenHandler = handler;
    }),
  };

  readonly on = vi.fn((
    event: 'ready-to-show' | 'close',
    listener: (() => void) | ((event: { preventDefault(): void }) => void)
  ) => {
    if (event === 'ready-to-show') {
      this.readyToShowListener = listener as () => void;
    }
  });

  readonly show = vi.fn();
  readonly loadURL = vi.fn();
  readonly loadFile = vi.fn();
  readonly setMenuBarVisibility = vi.fn();

  readyToShowListener: (() => void) | null = null;
  windowOpenHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null = null;

  constructor(options: MainWindowOptions) {
    BrowserWindowMock.lastOptions = options;
    BrowserWindowMock.lastInstance = this;
  }
}

describe('main/window', () => {
  it('アプリケーションメニューを無効化する', () => {
    const menu = {
      setApplicationMenu: vi.fn(),
    };

    disableApplicationMenu(menu);

    expect(menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(menu.setApplicationMenu).toHaveBeenCalledWith(null);
  });

  it('開発時はカスタムメニューだけを表示するウィンドウを生成する', () => {
    const shell = {
      openExternal: vi.fn(),
    };

    createMainWindow({
      BrowserWindow: BrowserWindowMock,
      shell,
      isPackaged: false,
      rendererUrl: 'http://localhost:5173',
      dirname: '/mock/out/main',
    });

    expect(BrowserWindowMock.lastOptions).toMatchObject({
      width: 1280,
      height: 800,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      title: APP_TITLE,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: false,
      }
    });
    expect(normalizePath(BrowserWindowMock.lastOptions?.webPreferences.preload)).toBe(
      '/mock/out/preload/index.js'
    );
    expect(BrowserWindowMock.lastInstance?.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(BrowserWindowMock.lastInstance?.loadURL).toHaveBeenCalledWith('http://localhost:5173');

    BrowserWindowMock.lastInstance?.readyToShowListener?.();
    expect(BrowserWindowMock.lastInstance?.show).toHaveBeenCalledTimes(1);

    const handler = BrowserWindowMock.lastInstance?.windowOpenHandler;
    expect(handler).toBeTypeOf('function');
    expect(handler?.({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('本番時はビルド済み renderer を読み込む', () => {
    const shell = {
      openExternal: vi.fn(),
    };

    createMainWindow({
      BrowserWindow: BrowserWindowMock,
      shell,
      isPackaged: true,
      rendererUrl: 'http://localhost:5173',
      dirname: '/mock/out/main',
    });

    expect(BrowserWindowMock.lastInstance?.loadURL).not.toHaveBeenCalled();
    expect(normalizePath(BrowserWindowMock.lastInstance?.loadFile.mock.calls[0]?.[0])).toBe(
      '/mock/out/renderer/index.html'
    );
  });
});
