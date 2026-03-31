import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const store: Record<string, string> = {};
    const calls = {
      saveDialog: 0,
      openDialog: 0,
      writes: [] as string[],
    };

    (window as typeof window & {
      api: typeof window.api;
      __mockFileApi: {
        store: Record<string, string>;
        calls: typeof calls;
      };
    }).api = {
      readFile: async (filePath: string) => store[filePath] ?? '',
      writeFile: async (filePath: string, data: string) => {
        store[filePath] = data;
        calls.writes.push(filePath);
      },
      existsFile: async (filePath: string) => filePath in store,
      showOpenDialog: async () => {
        calls.openDialog += 1;
        return '/tmp/project-a.json';
      },
      showSaveDialog: async () => {
        calls.saveDialog += 1;
        return '/tmp/project-a.json';
      },
    };
    (window as typeof window & {
      __mockFileApi: {
        store: Record<string, string>;
        calls: typeof calls;
      };
    }).__mockFileApi = { store, calls };
    window.confirm = () => true;
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

async function clickMenuAction(
  page: import('@playwright/test').Page,
  menuLabel: string,
  actionLabel: string,
  actionIndex: number = 0
) {
  await page.locator('.menu-trigger', { hasText: menuLabel }).click();
  await page.waitForTimeout(150);
  await page.locator('.menu-action').filter({ hasText: actionLabel }).nth(actionIndex).click();
  await page.waitForTimeout(250);
}

test('新規プロジェクト後の保存は保存先とメタデータを引き継がない', async ({ page }) => {
  await clickMenuAction(page, 'ツール', 'プロジェクト設定');
  await page.locator('#ps-name').fill('旧プロジェクト');
  await page.locator('.btn.confirm').click();
  await page.waitForTimeout(250);

  await clickMenuAction(page, 'ファイル', '名前を付けて保存');
  await clickMenuAction(page, 'ファイル', '新規プロジェクト');
  await clickMenuAction(page, 'ファイル', '保存', 0);

  const result = await page.evaluate(() => {
    const mock = (window as typeof window & {
      __mockFileApi: {
        store: Record<string, string>;
        calls: {
          saveDialog: number;
          openDialog: number;
          writes: string[];
        };
      };
    }).__mockFileApi;

    return {
      saveDialog: mock.calls.saveDialog,
      savedJson: mock.store['/tmp/project-a.json'],
    };
  });

  const saved = JSON.parse(result.savedJson);

  expect(result.saveDialog).toBe(2);
  expect(saved.metadata.worldName).toBe('新しい世界');
});
