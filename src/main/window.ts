import { join } from 'path';

export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 600;
export const APP_TITLE = 'gimoza — 時空地歴編纂機';

export interface MainWindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  show: boolean;
  title: string;
  autoHideMenuBar: boolean;
  webPreferences: {
    preload: string;
    sandbox: boolean;
  };
}

export interface BrowserWindowLike {
  on(event: 'ready-to-show', listener: () => void): void;
  show(): void;
  loadURL(url: string): void;
  loadFile(filePath: string): void;
  setMenuBarVisibility?(visible: boolean): void;
  webContents: {
    setWindowOpenHandler(
      handler: (details: { url: string }) => { action: 'deny' | 'allow' }
    ): void;
  };
}

export interface BrowserWindowConstructorLike {
  new (options: MainWindowOptions): BrowserWindowLike;
}

export interface ShellLike {
  openExternal(url: string): void | Promise<void>;
}

export interface MenuLike {
  setApplicationMenu(menu: null): void;
}

export function disableApplicationMenu(menu: MenuLike): void {
  menu.setApplicationMenu(null);
}

export function createMainWindow({
  BrowserWindow,
  shell,
  isPackaged,
  rendererUrl,
  dirname,
}: {
  BrowserWindow: BrowserWindowConstructorLike;
  shell: ShellLike;
  isPackaged: boolean;
  rendererUrl?: string;
  dirname: string;
}): BrowserWindowLike {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(dirname, '../preload/index.js'),
      sandbox: false,
    }
  });

  mainWindow.setMenuBarVisibility?.(false);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!isPackaged && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(join(dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
