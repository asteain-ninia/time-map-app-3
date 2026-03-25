/**
 * E2E: ツールモード切替テスト
 *
 * V/A/E/Mキーおよびツールバーボタンでモード切替できることを確認。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

test('初期モードは表示モード', async ({ page }) => {
  const viewButton = page.locator('.tool-button[title*="表示モード"]');
  await expect(viewButton).toHaveClass(/active/);
});

test('キーボード"A"で追加モードに切替', async ({ page }) => {
  await page.keyboard.press('a');
  const addButton = page.locator('.tool-button[title*="追加モード"]');
  await expect(addButton).toHaveClass(/active/);
});

test('追加モードでサブツールが表示される', async ({ page }) => {
  await page.keyboard.press('a');
  const subTools = page.locator('.tool-button.sub-tool');
  const count = await subTools.count();
  expect(count).toBe(3); // point, line, polygon
});

test('キーボード"E"で編集モードに切替', async ({ page }) => {
  await page.keyboard.press('e');
  const editButton = page.locator('.tool-button[title*="編集モード"]');
  await expect(editButton).toHaveClass(/active/);
});

test('キーボード"M"で測量モードに切替', async ({ page }) => {
  await page.keyboard.press('m');
  const measureButton = page.locator('.tool-button[title*="測量モード"]');
  await expect(measureButton).toHaveClass(/active/);
});

test('キーボード"V"で表示モードに戻る', async ({ page }) => {
  await page.keyboard.press('a'); // まず別モードに
  await page.keyboard.press('v');
  const viewButton = page.locator('.tool-button[title*="表示モード"]');
  await expect(viewButton).toHaveClass(/active/);
});

test('ツールバーの追加ボタンをクリックして追加モードに切替', async ({ page }) => {
  const addButton = page.locator('.tool-button[title*="追加モード"]');
  await addButton.click();
  await expect(addButton).toHaveClass(/active/);
});
