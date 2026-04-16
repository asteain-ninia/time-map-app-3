export interface CloseEventLike {
  preventDefault(): void;
}

export interface ClosableWindowLike {
  on(event: 'close', listener: (event: CloseEventLike) => void): void;
}

export interface DialogLike {
  showMessageBoxSync(
    browserWindow: unknown,
    options: {
      type: 'warning';
      buttons: string[];
      defaultId: number;
      cancelId: number;
      title: string;
      message: string;
      detail: string;
      noLink: boolean;
    }
  ): number;
}

export interface IpcMainOnLike {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export interface UnsavedChangesTracker {
  get(): boolean;
  set(isDirty: boolean): void;
}

export function createUnsavedChangesTracker(): UnsavedChangesTracker {
  let hasUnsavedChanges = false;
  return {
    get: () => hasUnsavedChanges,
    set: (isDirty: boolean) => {
      hasUnsavedChanges = isDirty;
    },
  };
}

export function registerUnsavedChangesIpc(
  ipcMain: IpcMainOnLike,
  tracker: UnsavedChangesTracker
): void {
  ipcMain.on('app:setDirtyState', (_event, isDirty) => {
    tracker.set(isDirty === true);
  });
}

export function attachUnsavedChangesCloseGuard(
  browserWindow: ClosableWindowLike,
  dialog: DialogLike,
  tracker: UnsavedChangesTracker
): void {
  browserWindow.on('close', (event) => {
    if (!tracker.get()) {
      return;
    }

    const selected = dialog.showMessageBoxSync(browserWindow, {
      type: 'warning',
      buttons: ['キャンセル', '変更を破棄して終了'],
      defaultId: 0,
      cancelId: 0,
      title: '未保存の変更',
      message: '未保存の変更があります。終了しますか？',
      detail: '保存していない変更は失われます。',
      noLink: true,
    });

    if (selected === 0) {
      event.preventDefault();
      return;
    }

    tracker.set(false);
  });
}
