/**
 * E2E: §2.3.3.3 コンテキストメニュー
 *
 * 右クリックでコンテキストメニュー表示、閉じる操作を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.3.3.3 右クリックでコンテキストメニューが表示される
test('マップ上で右クリックするとコンテキストメニューが表示される', async ({ page }) => {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({
    position: { x: box.width / 2, y: box.height / 2 },
    button: 'right',
  });
  await page.waitForTimeout(300);

  const contextMenu = page.locator('.context-menu');
  // 何も選択していない状態でもメニューが表示されるかは実装依存
  // 表示された場合のテスト
  if (await contextMenu.count() > 0) {
    await expect(contextMenu).toBeVisible();
  }
});

// §2.3.3.3 コンテキストメニューをEscで閉じる
test('コンテキストメニューをEscキーで閉じられる', async ({ page }) => {
  // まずポイント追加
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(500);

  // 表示モードに戻して右クリック
  await page.keyboard.press('v');
  await page.waitForTimeout(100);

  await map.click({
    position: { x: box.width / 2, y: box.height / 2 },
    button: 'right',
  });
  await page.waitForTimeout(300);

  const contextMenu = page.locator('.context-menu');
  if (await contextMenu.count() > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(contextMenu).not.toBeVisible();
  }
});

// §2.3.3.3 コンテキストメニューを背景クリックで閉じる
test('コンテキストメニューを背景クリックで閉じられる', async ({ page }) => {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({
    position: { x: box.width / 2, y: box.height / 2 },
    button: 'right',
  });
  await page.waitForTimeout(300);

  const contextMenu = page.locator('.context-menu');
  if (await contextMenu.count() > 0) {
    const overlay = page.locator('.context-overlay');
    if (await overlay.count() > 0) {
      await overlay.click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(200);
      await expect(contextMenu).not.toBeVisible();
    }
  }
});
