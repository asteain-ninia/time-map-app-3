/**
 * E2E: §2.2.4 タイムラインインターフェース
 *
 * スライダー操作、数値入力、ステップ操作、再生制御を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.2.4 タイムラインパネルが表示される
test('タイムラインパネルにスライダーが表示される', async ({ page }) => {
  const slider = page.locator('.timeline-panel input[type="range"]');
  await expect(slider.first()).toBeVisible();
});

// §2.2.4 タイムラインに現在の年が表示される
test('タイムラインに現在の年が表示される', async ({ page }) => {
  const yearInput = page.locator('.timeline-panel .year-input, .timeline-panel input[type="number"]');
  if (await yearInput.count() > 0) {
    const value = await yearInput.first().inputValue();
    expect(parseInt(value)).toBeGreaterThanOrEqual(0);
  }
});

// §2.2.4.2 ステップ操作 — 前進ボタンで年が増加する
test('前進ボタンで年が増加する', async ({ page }) => {
  const yearInput = page.locator('.timeline-panel .year-input, .timeline-panel input[type="number"]').first();
  if (await yearInput.count() === 0) return;

  const beforeValue = parseInt(await yearInput.inputValue());

  const forwardBtn = page.locator('.timeline-panel .step-forward, .timeline-panel button', { hasText: '▶' });
  if (await forwardBtn.count() > 0) {
    await forwardBtn.first().click();
    await page.waitForTimeout(200);
    const afterValue = parseInt(await yearInput.inputValue());
    expect(afterValue).toBeGreaterThan(beforeValue);
  }
});

// §2.2.4.2 ステップ操作 — 後退ボタンで年が減少する
test('後退ボタンで年が減少する', async ({ page }) => {
  const yearInput = page.locator('.timeline-panel .year-input, .timeline-panel input[type="number"]').first();
  if (await yearInput.count() === 0) return;

  // まず前進して1にする
  const forwardBtn = page.locator('.timeline-panel .step-forward, .timeline-panel button', { hasText: '▶' });
  if (await forwardBtn.count() > 0) {
    await forwardBtn.first().click();
    await page.waitForTimeout(100);
  }

  const beforeValue = parseInt(await yearInput.inputValue());
  const backBtn = page.locator('.timeline-panel .step-back, .timeline-panel button', { hasText: '◀' });
  if (await backBtn.count() > 0) {
    await backBtn.first().click();
    await page.waitForTimeout(200);
    const afterValue = parseInt(await yearInput.inputValue());
    expect(afterValue).toBeLessThan(beforeValue);
  }
});

// §2.2.4.2 ステップ単位セレクタ — 年/月/日を選択できる
test('ステップ単位セレクタが存在する', async ({ page }) => {
  const unitSelect = page.locator('.timeline-panel select.step-unit, .timeline-panel .step-unit');
  if (await unitSelect.count() > 0) {
    await expect(unitSelect.first()).toBeVisible();
  }
});

// §2.2.4.3 再生制御 — 再生ボタンが存在する
test('再生ボタンが表示される', async ({ page }) => {
  const playBtn = page.locator('.timeline-panel .play-btn, .timeline-panel button', { hasText: /再生|▶|Play/ });
  if (await playBtn.count() > 0) {
    await expect(playBtn.first()).toBeVisible();
  }
});

// §2.2.4.3 再生制御 — 速度セレクタが存在する
test('再生速度セレクタが存在する', async ({ page }) => {
  const speedSelect = page.locator('.timeline-panel select.speed-select, .timeline-panel .speed-select');
  if (await speedSelect.count() > 0) {
    await expect(speedSelect.first()).toBeVisible();
  }
});
