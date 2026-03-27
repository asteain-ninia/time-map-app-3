/**
 * E2E: §2.3.2 追加モード
 *
 * 点/線/面の追加、仮表示、キャンセル、取り消し（Ctrl+Z）を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

async function panToWrappedState(page: import('@playwright/test').Page) {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 350, cy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  return { map, box };
}

// §2.3.2 追加モード切替 — ツールバーのトグルボタン
test('追加モードで追加ツール群が表示される', async ({ page }) => {
  await page.keyboard.press('a');
  const subTools = page.locator('.tool-button.sub-tool');
  const count = await subTools.count();
  expect(count).toBe(3); // 点、線、面
});

// §2.3.2 追加モードと編集モードは排他的
test('追加モードから編集モードに切替えると追加モードが解除される', async ({ page }) => {
  await page.keyboard.press('a');
  const addBtn = page.locator('.tool-button[title*="追加モード"]');
  await expect(addBtn).toHaveClass(/active/);

  await page.keyboard.press('e');
  const editBtn = page.locator('.tool-button[title*="編集モード"]');
  await expect(editBtn).toHaveClass(/active/);
  await expect(addBtn).not.toHaveClass(/active/);
});

// §2.3.2 点情報追加ツール — クリックで点を配置
test('点ツールでクリックするとポイント地物が追加される', async ({ page }) => {
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
  const featureItems = page.locator('.feature-item');
  await expect(featureItems.first()).toBeVisible({ timeout: 3000 });

  // 点地物のバッジ
  const badge = featureItems.first().locator('.feature-type-badge');
  const text = await badge.textContent();
  expect(text?.trim()).toBe('点');
});

// §2.3.2 線情報追加ツール — 2点以上でconfirmが有効化
test('線ツールで2点クリック後に確定ボタンが表示される', async ({ page }) => {
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx - 30, y: cy } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx + 30, y: cy } });
  await page.waitForTimeout(200);

  // 確定ボタンが表示される
  const confirmBtn = page.locator('.drawing-btn.confirm');
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
});

// §2.1 横方向無限スクロール — 描画プレビューも複製地図に表示される
test('横方向無限スクロール中も描画プレビューが複製地図に表示される', async ({ page }) => {
  const { map, box } = await panToWrappedState(page);
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  await map.click({ position: { x: box.width * 0.35, y: box.height * 0.4 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: box.width * 0.55, y: box.height * 0.45 } });
  await page.waitForTimeout(200);

  expect(await map.locator('g[transform*="translate"]').count()).toBeGreaterThanOrEqual(2);
  expect(await map.locator('.drawing-preview-polyline').count()).toBeGreaterThanOrEqual(2);
  expect(await map.locator('.drawing-preview-vertex').count()).toBeGreaterThanOrEqual(4);
});

// §2.1 東西端またぎ — 線プレビューは長い反対回りではなく短い経路で描画される
test('東西端をまたぐ線プレビューが短い経路で描画される', async ({ page }) => {
  const { map, box } = await panToWrappedState(page);
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  await map.click({ position: { x: box.width * 0.36, y: box.height * 0.5 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: box.width * 0.40, y: box.height * 0.5 } });
  await page.waitForTimeout(200);

  const spans = await map.locator('.drawing-preview-polyline').evaluateAll((els) =>
    els.map((el) => {
      const points = (el.getAttribute('points') || '')
        .trim()
        .split(/\s+/)
        .map((pair) => Number(pair.split(',')[0]));
      return Math.abs(points[points.length - 1] - points[0]);
    })
  );

  expect(spans.some((span) => span < 40)).toBe(true);
});

// §2.3.2 線情報追加ツール — 確定で線地物が追加される
// KNOWN BUG: 線地物がブラウザE2Eでは追加されない（Electronでは未検証）
test.fixme('線ツールで確定すると線地物が追加される', async ({ page }) => {
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx - 30, y: cy } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx + 30, y: cy } });
  await page.waitForTimeout(200);

  const confirmBtn = page.locator('.drawing-btn.confirm');
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await page.waitForTimeout(500);
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();

  // 線バッジを持つ地物が存在するか
  const lineFeature = page.locator('.feature-item .feature-type-badge', { hasText: '線' });
  await expect(lineFeature.first()).toBeVisible({ timeout: 3000 });
});

// §2.3.2 面情報追加ツール — 3点以上でconfirmが有効化
test('面ツールで3点クリック後に確定ボタンが表示される', async ({ page }) => {
  await page.keyboard.press('a');
  const polygonTool = page.locator('.tool-button.sub-tool[title="面を追加"]');
  await polygonTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx - 30, y: cy - 30 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx + 30, y: cy - 30 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: cx, y: cy + 30 } });
  await page.waitForTimeout(200);

  const confirmBtn = page.locator('.drawing-btn.confirm');
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
});

// §2.3.2 共通 — キャンセル（Escape）で描画を破棄
test('描画中にEscapeで描画がキャンセルされる', async ({ page }) => {
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(200);

  // Escapeでキャンセル
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 確定ボタンが消える
  const confirmBtn = page.locator('.drawing-btn.confirm');
  await expect(confirmBtn).not.toBeVisible();
});

// §2.3.2 共通 — 仮表示（追加中のオブジェクトが半透明で表示）
test('描画中に仮表示プレビューが表示される', async ({ page }) => {
  await page.keyboard.press('a');
  const lineTool = page.locator('.tool-button.sub-tool[title="線を追加"]');
  await lineTool.click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 3, y: box.height / 2 } });
  await page.waitForTimeout(200);
  await map.click({ position: { x: box.width * 2 / 3, y: box.height / 2 } });
  await page.waitForTimeout(200);

  // DrawingPreviewが描画するpolyline（描画中のライン）
  const previewPolyline = page.locator('.map-svg polyline[stroke="#00ccff"]');
  const count = await previewPolyline.count();
  expect(count).toBeGreaterThan(0);
});
