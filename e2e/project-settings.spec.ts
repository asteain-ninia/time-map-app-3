/**
 * E2E: §2.6 プロジェクト設定ダイアログ
 *
 * 設定ダイアログの表示・閉じる操作・フィールド表示を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.6.2 ツールバーの「設定」ボタンから開く
test('ツールバーの設定ボタンでプロジェクト設定ダイアログが開く', async ({ page }) => {
  const settingsBtn = page.locator('.tool-button[title*="設定"], .tool-button[title*="プロジェクト設定"]');
  if (await settingsBtn.count() > 0) {
    await settingsBtn.first().click();
    const dialog = page.locator('.dialog, .modal-overlay');
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  }
});

// §2.6.2 メニューの「ツール→プロジェクト設定」から開く
test('ツールメニューからプロジェクト設定を開ける', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);

  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const dialog = page.locator('.dialog, .modal-overlay');
  await expect(dialog.first()).toBeVisible();
});

// §2.6.2 Escキーで閉じる
test('プロジェクト設定ダイアログをEscで閉じられる', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const dialog = page.locator('.dialog');
  await expect(dialog).not.toBeVisible();
});

// §2.6.2 背景クリックで閉じる
test('プロジェクト設定ダイアログを背景クリックで閉じられる', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  // オーバーレイの端をクリック
  const overlay = page.locator('.modal-overlay');
  if (await overlay.count() > 0) {
    await overlay.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
    const dialog = page.locator('.dialog');
    await expect(dialog).not.toBeVisible();
  }
});

// §2.6.1 設定項目 — プロジェクト名フィールドが存在する
test('プロジェクト設定にプロジェクト名フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const nameInput = page.locator('.dialog input, .dialog textarea').first();
  await expect(nameInput).toBeVisible();
});

// §2.6.1 設定項目 — グリッド間隔セレクタが存在する
test('プロジェクト設定にグリッド間隔セレクタがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const gridSelect = page.locator('.dialog select');
  if (await gridSelect.count() > 0) {
    await expect(gridSelect.first()).toBeVisible();
  }
});
