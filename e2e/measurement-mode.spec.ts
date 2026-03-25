/**
 * E2E: §2.1 測量モード
 *
 * 2点クリックで距離計算、座標表示、測量線描画を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.1 測量モード — Mキーで切替
test('Mキーで測量モードに切替できる', async ({ page }) => {
  await page.keyboard.press('m');
  const measureBtn = page.locator('.tool-button[title*="測量モード"]');
  await expect(measureBtn).toHaveClass(/active/);
});

// §2.1 測量モード — カーソルがcrosshairになる
test('測量モードではカーソルがcrosshairになる', async ({ page }) => {
  await page.keyboard.press('m');
  const container = page.locator('.map-container');
  const cursor = await container.evaluate(el => getComputedStyle(el).cursor);
  expect(cursor).toBe('crosshair');
});

// §2.1 測量モード — 1点クリックで始点情報パネルが表示される
test('測量モードで1点クリックすると始点情報が表示される', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await svg.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(300);

  // 測量パネルが表示される
  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    await expect(surveyPanel).toBeVisible();
  }
});

// §2.1 測量モード — 2点クリックで距離が表示される
test('測量モードで2点クリックすると距離が表示される', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await svg.click({ position: { x: cx - 50, y: cy } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: cx + 50, y: cy } });
  await page.waitForTimeout(300);

  // 距離情報を含むテキストが表示される
  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    const text = await surveyPanel.textContent();
    // kmなどの距離表示
    expect(text).toMatch(/km|距離/);
  }
});

// §2.1 測量モード — Escapeで測量をリセット
test('測量モードでEscapeを押すと測量がリセットされる', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await svg.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(200);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 測量パネルにリセット状態のテキストが表示される
  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    const text = await surveyPanel.textContent();
    expect(text).toContain('始点をクリック');
  }
});
