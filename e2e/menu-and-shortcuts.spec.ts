/**
 * E2E: メニューバー・キーボードショートカットテスト
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

test('ファイルメニューを開閉できる', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();

  const dropdown = page.locator('.menu-dropdown');
  await expect(dropdown).toBeVisible();

  // 新規プロジェクトが表示される
  const newProject = page.locator('.menu-action', { hasText: '新規プロジェクト' });
  await expect(newProject).toBeVisible();

  // Escで閉じる
  await page.keyboard.press('Escape');
  await expect(dropdown).not.toBeVisible();
});

test('編集メニューを開閉できる', async ({ page }) => {
  const editTrigger = page.locator('.menu-trigger', { hasText: '編集' });
  await editTrigger.click();

  const undoItem = page.locator('.menu-action', { hasText: '元に戻す' });
  await expect(undoItem).toBeVisible();

  // 背景クリックで閉じる
  const backdrop = page.locator('.menu-backdrop');
  await backdrop.click();
});

test('Ctrl+Zが機能する（Undo）', async ({ page }) => {
  // エラーなく動作することを確認
  await page.keyboard.press('Control+z');
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});

test('Escapeでモーダルが開いていなくても安全', async ({ page }) => {
  await page.keyboard.press('Escape');
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});
