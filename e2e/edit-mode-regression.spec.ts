import { expect, test } from '@playwright/test';

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
  await page.keyboard.press('e');
}

async function selectCenterPolygon(page: import('@playwright/test').Page) {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 - 20 } });
  await page.waitForTimeout(300);
  return { map, box };
}

async function getPrimaryFeatureBounds(page: import('@playwright/test').Page) {
  const feature = page.locator('.map-svg path[data-feature-id]').first();
  const bounds = await feature.boundingBox();
  if (!bounds) throw new Error('feature not found');
  return bounds;
}

test('複数選択した頂点をドラッグ開始しても選択が維持される', async ({ page }) => {
  await addPolygonFeature(page);
  const { box } = await selectCenterPolygon(page);

  const startX = box.x + box.width / 2 - 60;
  const startY = box.y + box.height / 2 - 60;
  const endX = box.x + box.width / 2 + 60;
  const endY = box.y + box.height / 2 - 20;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const selectedHandles = page.locator('.vertex-handle[fill="#00ccff"]');
  await expect(selectedHandles).toHaveCount(6);

  const handleBox = await selectedHandles.first().boundingBox();
  if (!handleBox) throw new Error('selected handle not found');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 - 18, handleBox.y + handleBox.height / 2 - 6, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await expect(page.locator('.vertex-handle[fill="#00ccff"]')).toHaveCount(6);
});

test('地物移動ツールを有効にしたときだけ地物ドラッグで移動する', async ({ page }) => {
  await addPolygonFeature(page);
  const { box } = await selectCenterPolygon(page);

  const before = await getPrimaryFeatureBounds(page);

  const dragFromX = box.x + box.width / 2;
  const dragFromY = box.y + box.height / 2 - 20;

  await page.mouse.move(dragFromX, dragFromY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + 50, dragFromY + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const withoutTool = await getPrimaryFeatureBounds(page);
  expect(Math.abs(withoutTool.x - before.x)).toBeLessThan(2);
  expect(Math.abs(withoutTool.y - before.y)).toBeLessThan(2);

  await page.locator('button[title="地物移動ツール"]').click();
  await expect(page.locator('button[title="地物移動ツール"]')).toHaveClass(/active/);

  await page.mouse.move(dragFromX, dragFromY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + 50, dragFromY + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const withTool = await getPrimaryFeatureBounds(page);
  expect(withTool.x - withoutTool.x).toBeGreaterThan(10);
  expect(withTool.y - withoutTool.y).toBeGreaterThan(4);
});

test('穴追加中は地物移動ツールが発動しない', async ({ page }) => {
  await addPolygonFeature(page);
  const { box } = await selectCenterPolygon(page);

  await page.locator('button[title="地物移動ツール"]').click();
  await page.locator('button[title="穴リングを追加"]').click();
  await expect(page.locator('.edit-btn.confirm')).toBeVisible();

  const before = await getPrimaryFeatureBounds(page);
  const dragFromX = box.x + box.width / 2;
  const dragFromY = box.y + box.height / 2 - 20;

  await page.mouse.move(dragFromX, dragFromY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + 40, dragFromY + 15, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await getPrimaryFeatureBounds(page);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
});
