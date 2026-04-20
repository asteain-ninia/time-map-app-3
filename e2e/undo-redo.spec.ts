/**
 * E2E: §2.3.1 アンドゥ・リドゥ
 *
 * 地物追加→取り消し→やり直しを検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

async function addLineFeature(page: import('@playwright/test').Page): Promise<void> {
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2 - 40, y: box.height / 2 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: box.width / 2 + 40, y: box.height / 2 } });
  await page.waitForTimeout(100);

  await page.locator('.drawing-btn.confirm').click();
  await page.waitForTimeout(300);
}

async function getLinePointCount(page: import('@playwright/test').Page): Promise<number> {
  const points = await page.locator('.map-svg polyline[data-feature-id]').first().getAttribute('points');
  return points?.trim().split(/\s+/).filter(Boolean).length ?? 0;
}

// §2.3.1 Undo — 地物追加後にCtrl+Zで取り消し
test('ポイント追加後にCtrl+Zで取り消しできる', async ({ page }) => {
  // ポイント追加
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(500);

  // 地物一覧で確認
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await expect(page.locator('.feature-item').first()).toBeVisible({ timeout: 3000 });

  // Undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);

  // 地物がなくなる
  const count = await page.locator('.feature-item').count();
  expect(count).toBe(0);
});

// §2.3.1 Redo — Undo後にCtrl+Yでやり直し
test('Undo後にCtrl+Yでやり直しできる', async ({ page }) => {
  // ポイント追加
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(500);

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await expect(page.locator('.feature-item').first()).toBeVisible({ timeout: 3000 });

  // Undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect(await page.locator('.feature-item').count()).toBe(0);

  // Redo
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(500);

  // 地物が復活
  await expect(page.locator('.feature-item').first()).toBeVisible({ timeout: 3000 });
});

// §2.3.1 Undo — 空のアンドゥスタックでもクラッシュしない
test('変更なしでCtrl+Zを押してもクラッシュしない', async ({ page }) => {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});

// §2.3.1 Undo — 線上に追加した頂点を削除後、Undoで復元する
test('線上に追加した頂点を削除後にCtrl+Zで復元できる', async ({ page }) => {
  await addLineFeature(page);
  await page.keyboard.press('e');
  await page.waitForTimeout(100);

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator('.edge-handle').first()).toBeVisible();

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(300);
  expect(await getLinePointCount(page)).toBe(3);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await getLinePointCount(page)).toBe(2);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect(await getLinePointCount(page)).toBe(3);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect(await getLinePointCount(page)).toBe(2);
});
