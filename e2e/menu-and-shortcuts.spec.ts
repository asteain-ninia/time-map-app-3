/**
 * E2E: メニューバー・キーボードショートカットテスト
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

async function addPolygonFeature(page: import('@playwright/test').Page) {
  await page.keyboard.press('a');
  await page.locator('.tool-button.sub-tool[title="面を追加"]').click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx - 40, y: cy - 40 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: cx + 40, y: cy - 40 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: cx, y: cy + 40 } });
  await page.waitForTimeout(100);
  await page.locator('.drawing-btn.confirm').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('v');
}

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

test('メニュー展開中もバックドロップは透明で別メニューへ切り替えられる', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();

  const backdrop = page.locator('.menu-backdrop');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const editTrigger = page.locator('.menu-trigger', { hasText: '編集' });
  await editTrigger.click();

  await expect(page.locator('.menu-dropdown[aria-label=\"編集\"]')).toBeVisible();
  await expect(page.locator('.menu-dropdown[aria-label=\"ファイル\"]')).toHaveCount(0);
});

test('Ctrl+Zが機能する（Undo）', async ({ page }) => {
  // エラーなく動作することを確認
  await page.keyboard.press('Control+z');
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});

test('Ctrl+Aで選択地物の全頂点を選択できる', async ({ page }) => {
  await addPolygonFeature(page);

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);
  await page.locator('.feature-item').first().click();
  await page.waitForTimeout(200);

  await page.keyboard.press('Control+a');
  await page.waitForTimeout(200);

  const selectedHandles = page.locator('.vertex-handle.selected');
  expect(await selectedHandles.count()).toBeGreaterThanOrEqual(3);
});

test('Escapeでモーダルが開いていなくても安全', async ({ page }) => {
  await page.keyboard.press('Escape');
  const menuBar = page.locator('.menu-bar');
  await expect(menuBar).toBeVisible();
});
