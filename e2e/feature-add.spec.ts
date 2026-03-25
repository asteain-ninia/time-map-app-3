/**
 * E2E: 地物追加テスト
 *
 * 追加モードでマップ上にクリックして地物を追加できることを確認。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

test('ポイント地物を追加できる', async ({ page }) => {
  // 追加モード→点ツールに切替
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();

  // マップ中央付近をクリック
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });

  // 少し待ってからサイドバーの地物一覧タブに切替
  await page.waitForTimeout(500);
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();

  // 地物リストにアイテムがあるか
  const featureItems = page.locator('.feature-item');
  await expect(featureItems.first()).toBeVisible({ timeout: 3000 });
});

test('ポリゴン地物を追加できる', async ({ page }) => {
  // 追加モード→面ツールに切替
  await page.keyboard.press('a');
  const polygonTool = page.locator('.tool-button.sub-tool[title="面を追加"]');
  await polygonTool.click();

  // マップ上で3点クリック
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;
  await map.click({ position: { x: cx - 50, y: cy - 50 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx + 50, y: cy - 50 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx, y: cy + 50 } });
  await page.waitForTimeout(200);

  // 確定ボタンをクリック
  const confirmBtn = page.locator('.drawing-btn.confirm');
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  // 地物タブで確認
  await page.waitForTimeout(500);
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  const featureItems = page.locator('.feature-item');
  await expect(featureItems.first()).toBeVisible({ timeout: 3000 });
});
