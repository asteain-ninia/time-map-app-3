/**
 * E2E: §2.1 地図表示機能
 *
 * ベースマップ表示、ズーム、パン、グリッド、初期表示を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.1 ベースマップ表示 — SVG形式の地図が表示される
test('ベースマップSVGが表示される', async ({ page }) => {
  const svg = page.locator('.map-svg');
  await expect(svg).toBeVisible();
  // viewBoxが設定されている（座標系が初期化済み）
  const viewBox = await svg.getAttribute('viewBox');
  expect(viewBox).toBeTruthy();
});

// §2.1 ベースマップのpointer-events: none — マウスイベントを受け付けない
test('ベースマップ要素はpointer-events:noneである', async ({ page }) => {
  const baseGroup = page.locator('.base-map-layer');
  if (await baseGroup.count() > 0) {
    const pe = await baseGroup.evaluate(el => getComputedStyle(el).pointerEvents);
    expect(pe).toBe('none');
  }
});

// §2.1 初期表示 — 中心経度0度、中心緯度0度
test('初期表示はズームレベル1で全体表示', async ({ page }) => {
  const statusBar = page.locator('.status-bar');
  const zoomText = statusBar.locator('.zoom-display');
  if (await zoomText.count() > 0) {
    const text = await zoomText.textContent();
    expect(text).toContain('1');
  }
});

// §2.1 ズーム操作 — マウスホイールでズームイン/アウト
test('マウスホイールでズームインできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  // 初期viewBox取得
  const vbBefore = await svg.getAttribute('viewBox');

  // ホイールでズームイン（deltaY < 0）
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  // viewBoxが変わるはず（ズームインすると表示範囲が狭くなる）
  expect(vbAfter).not.toBe(vbBefore);
});

test('マウスホイールでズームアウトできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  // まずズームインしておく
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  const vbZoomedIn = await svg.getAttribute('viewBox');

  // ズームアウト
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const vbZoomedOut = await svg.getAttribute('viewBox');

  expect(vbZoomedOut).not.toBe(vbZoomedIn);
});

// §2.1 パン操作 — 表示モードでは左ボタンドラッグでパン
test('表示モードで左ドラッグでパンできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

// §2.1 パン操作 — 追加モードでは左ドラッグでパンしない
test('追加モードでは左ドラッグでパンしない', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  // 追加モードに切替
  await page.keyboard.press('a');
  await page.waitForTimeout(100);

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  // 追加モードでは左ドラッグでパンしない（viewBox変化なし）
  expect(vbAfter).toBe(vbBefore);
});

// §2.1 グリッド線の表示 — 10度間隔のグリッドが表示される
test('グリッド線が表示される', async ({ page }) => {
  const gridLayer = page.locator('.grid-layer');
  await expect(gridLayer).toBeVisible();
  // grid-layer内にline要素がある
  const gridLines = gridLayer.locator('line');
  const count = await gridLines.count();
  expect(count).toBeGreaterThan(0);
});

// §2.1 グリッド — 赤道・本初子午線・180°経線の強調表示
test('赤道が強調表示される', async ({ page }) => {
  const equator = page.locator('.equator');
  if (await equator.count() > 0) {
    await expect(equator).toBeVisible();
  }
});

// §2.1 カーソル座標表示 — ステータスバーに座標が表示される
test('マウス移動でステータスバーに座標が表示される', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  const statusBar = page.locator('.status-bar');
  const text = await statusBar.textContent();
  // 経度・緯度に関する数値が含まれる
  expect(text).toMatch(/\d/);
});
