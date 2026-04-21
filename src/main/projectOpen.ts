const PROJECT_FILE_PATTERN = /\.(gimoza|json)$/i;

export interface ProjectOpenWindow {
  isMinimized?(): boolean;
  restore?(): void;
  focus?(): void;
  webContents: {
    isLoading?(): boolean;
    once?(event: 'did-finish-load', listener: () => void): void;
    send(channel: string, ...args: unknown[]): void;
  };
}

export function isSupportedProjectPath(filePath: string): boolean {
  return PROJECT_FILE_PATTERN.test(filePath.trim());
}

export function findProjectPathArg(argv: readonly string[]): string | null {
  return argv.find((arg) => isSupportedProjectPath(arg)) ?? null;
}

export function revealProjectOpenWindow(window: ProjectOpenWindow): void {
  if (window.isMinimized?.()) {
    window.restore?.();
  }
  window.focus?.();
}

export function sendProjectPathToWindow(
  window: ProjectOpenWindow,
  filePath: string
): void {
  if (!isSupportedProjectPath(filePath)) {
    return;
  }

  const sendPath = (): void => {
    window.webContents.send('app:openProjectPath', filePath);
  };

  if (window.webContents.isLoading?.() && window.webContents.once) {
    window.webContents.once('did-finish-load', sendPath);
    return;
  }

  sendPath();
}
