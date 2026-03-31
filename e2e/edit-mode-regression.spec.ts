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

async function addSquarePolygonFeature(page: import('@playwright/test').Page) {
  await page.keyboard.press('a');
  await page.locator('.tool-button.sub-tool[title="面を追加"]').click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx - 90, y: cy - 90 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: cx + 90, y: cy - 90 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: cx + 90, y: cy + 90 } });
  await page.waitForTimeout(100);
  await map.click({ position: { x: cx - 90, y: cy + 90 } });
  await page.waitForTimeout(100);
  await page.locator('.drawing-btn.confirm').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
}

async function addPointFeatureAt(
  page: import('@playwright/test').Page,
  offsetX: number,
  offsetY: number
) {
  await page.keyboard.press('a');
  await page.locator('.tool-button.sub-tool[title="点を追加"]').click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await map.click({ position: { x: cx + offsetX, y: cy + offsetY } });
  await page.waitForTimeout(200);
}

async function selectCenterPolygon(page: import('@playwright/test').Page) {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 - 20 } });
  await page.waitForTimeout(300);
  return { map, box };
}

async function drawRingWithOffsets(
  page: import('@playwright/test').Page,
  offsets: readonly { x: number; y: number }[]
) {
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const cx = box.width / 2;
  const cy = box.height / 2;

  await page.locator('button[title="穴/飛び地リングを追加"]').click();
  for (const offset of offsets) {
    await map.click({ position: { x: cx + offset.x, y: cy + offset.y } });
    await page.waitForTimeout(100);
  }
  await page.locator('.edit-btn.confirm').click();
  await page.waitForTimeout(300);
}

async function getPrimaryFeatureBounds(page: import('@playwright/test').Page) {
  const feature = page.locator('.map-svg path[data-feature-id]').first();
  const bounds = await feature.boundingBox();
  if (!bounds) throw new Error('feature not found');
  return bounds;
}

async function getPrimaryFeaturePathData(page: import('@playwright/test').Page) {
  const d = await page.locator('.map-svg path[data-feature-id]').first().getAttribute('d');
  if (!d) throw new Error('feature path not found');
  return d;
}

async function getVisibleVertexHandleBox(page: import('@playwright/test').Page) {
  const map = page.locator('.map-svg');
  const mapBox = await map.boundingBox();
  if (!mapBox) throw new Error('map not found');

  const handles = page.locator('.vertex-handle');
  const count = await handles.count();
  for (let index = 0; index < count; index += 1) {
    const handleBox = await handles.nth(index).boundingBox();
    if (!handleBox) continue;
    const centerX = handleBox.x + handleBox.width / 2;
    const centerY = handleBox.y + handleBox.height / 2;
    if (
      centerX >= mapBox.x &&
      centerX <= mapBox.x + mapBox.width &&
      centerY >= mapBox.y &&
      centerY <= mapBox.y + mapBox.height
    ) {
      return handleBox;
    }
  }

  throw new Error('visible vertex handle not found');
}

async function getVisibleBoxes(
  page: import('@playwright/test').Page,
  selector: string
) {
  const map = page.locator('.map-svg');
  const mapBox = await map.boundingBox();
  if (!mapBox) throw new Error('map not found');

  const elements = page.locator(selector);
  const count = await elements.count();
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const elementBox = await elements.nth(index).boundingBox();
    if (!elementBox) continue;
    const centerX = elementBox.x + elementBox.width / 2;
    const centerY = elementBox.y + elementBox.height / 2;
    if (
      centerX >= mapBox.x &&
      centerX <= mapBox.x + mapBox.width &&
      centerY >= mapBox.y &&
      centerY <= mapBox.y + mapBox.height
    ) {
      boxes.push(elementBox);
    }
  }

  return boxes.sort((a, b) => a.x - b.x);
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

test('複数選択した頂点をドラッグすると同じ移動量で同時に動く', async ({ page }) => {
  await addPointFeatureAt(page, -60, -20);
  await addPointFeatureAt(page, 60, 20);
  await page.keyboard.press('e');
  await page.waitForTimeout(200);

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const startX = box.x + box.width / 2 - 100;
  const startY = box.y + box.height / 2 - 60;
  const endX = box.x + box.width / 2 + 100;
  const endY = box.y + box.height / 2 + 60;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const beforeMarkers = await getVisibleBoxes(page, '.map-svg circle[data-feature-id]');
  expect(beforeMarkers).toHaveLength(2);

  const selectedHandles = await getVisibleBoxes(page, '.vertex-handle[fill="#00ccff"]');
  expect(selectedHandles).toHaveLength(2);

  const dragHandle = selectedHandles[0];
  const dragStartX = dragHandle.x + dragHandle.width / 2;
  const dragStartY = dragHandle.y + dragHandle.height / 2;

  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 30, dragStartY + 12, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterMarkers = await getVisibleBoxes(page, '.map-svg circle[data-feature-id]');
  expect(afterMarkers).toHaveLength(2);

  const delta1X = afterMarkers[0].x - beforeMarkers[0].x;
  const delta1Y = afterMarkers[0].y - beforeMarkers[0].y;
  const delta2X = afterMarkers[1].x - beforeMarkers[1].x;
  const delta2Y = afterMarkers[1].y - beforeMarkers[1].y;

  expect(Math.abs(delta1X)).toBeGreaterThan(5);
  expect(Math.abs(delta1Y)).toBeGreaterThan(2);
  expect(Math.abs(delta1X - delta2X)).toBeLessThan(2);
  expect(Math.abs(delta1Y - delta2Y)).toBeLessThan(2);
});

test('地物移動ツールを有効にしたときだけ地物ドラッグで移動する', async ({ page }) => {
  await addPolygonFeature(page);
  const { box } = await selectCenterPolygon(page);

  const beforePath = await getPrimaryFeaturePathData(page);

  const dragFromX = box.x + box.width / 2;
  const dragFromY = box.y + box.height / 2 - 20;

  await page.mouse.move(dragFromX, dragFromY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + 50, dragFromY + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const withoutToolPath = await getPrimaryFeaturePathData(page);
  expect(withoutToolPath).toBe(beforePath);

  await selectCenterPolygon(page);
  await page.locator('button[title="地物移動ツール"]').click();
  await expect(page.locator('button[title="地物移動ツール"]')).toHaveClass(/active/);

  await page.mouse.move(dragFromX, dragFromY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + 50, dragFromY + 20, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const withToolPath = await getPrimaryFeaturePathData(page);
  expect(withToolPath).not.toBe(withoutToolPath);
});

test('穴追加中は地物移動ツールが発動しない', async ({ page }) => {
  await addPolygonFeature(page);
  const { box } = await selectCenterPolygon(page);

  await page.locator('button[title="地物移動ツール"]').click();
  await page.locator('button[title="穴/飛び地リングを追加"]').click();
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

test('穴/飛び地追加ツールで穴の中に飛び地を追加できる', async ({ page }) => {
  await addSquarePolygonFeature(page);
  const { map, box } = await selectCenterPolygon(page);

  await drawRingWithOffsets(page, [
    { x: -30, y: -20 },
    { x: 30, y: -20 },
    { x: 0, y: 30 },
  ]);
  await expect(page.locator('.validation-banner')).toHaveCount(0);

  await drawRingWithOffsets(page, [
    { x: -8, y: -8 },
    { x: 8, y: -8 },
    { x: 0, y: 2 },
  ]);
  await expect(page.locator('.validation-banner')).toHaveCount(0);

  await map.click({ position: { x: box.width / 2, y: box.height / 2 - 45 } });
  await page.waitForTimeout(300);

  expect(await page.locator('.vertex-handle').count()).toBeGreaterThanOrEqual(10);
});

test('頂点選択コンテキストが単一地物ならプロパティを表示し続ける', async ({ page }) => {
  await addPolygonFeature(page);
  await selectCenterPolygon(page);

  const handleBox = await getVisibleVertexHandleBox(page);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.click(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.waitForTimeout(300);

  expect(await page.locator('.vertex-handle').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#prop-id')).toBeVisible();
  await expect(page.locator('.empty-message')).toHaveCount(0);
});

test('矩形選択で複数地物の頂点を選ぶとプロパティ編集不可メッセージを表示する', async ({ page }) => {
  await addPointFeatureAt(page, -80, -20);
  await addPointFeatureAt(page, 80, 20);
  await page.keyboard.press('e');
  await page.waitForTimeout(200);

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  const startX = box.x + box.width / 2 - 130;
  const startY = box.y + box.height / 2 - 70;
  const endX = box.x + box.width / 2 + 130;
  const endY = box.y + box.height / 2 + 70;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.locator('.tab', { hasText: 'プロパティ' }).click();
  await page.waitForTimeout(200);

  expect(await page.locator('.vertex-handle[fill="#00ccff"]').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.selection-message')).toContainText('複数の地物が選択されています');
  await expect(page.locator('.selection-owner-list li')).toHaveCount(2);
});
