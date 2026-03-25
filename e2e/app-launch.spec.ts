/**
 * E2E: アプリ起動テスト
 *
 * レンダラーが正常に表示され、基本UIが描画されることを確認。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

test('ページが表示される', async ({ page }) => {
  const title = await page.title();
  expect(title).toBeDefined();
});

test('メニューバーが表示される', async ({ page }) => {
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});

test('ツールバーが表示される', async ({ page }) => {
  const toolbar = page.locator('.toolbar');
  await expect(toolbar).toBeVisible();
});

test('マップキャンバスが表示される', async ({ page }) => {
  const mapContainer = page.locator('.map-container');
  await expect(mapContainer).toBeVisible();
});

test('サイドバーが表示される', async ({ page }) => {
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
});

test('タイムラインパネルが表示される', async ({ page }) => {
  const timeline = page.locator('.timeline-panel');
  await expect(timeline).toBeVisible();
});

test('ステータスバーが表示される', async ({ page }) => {
  const statusBar = page.locator('.status-bar');
  await expect(statusBar).toBeVisible();
});
