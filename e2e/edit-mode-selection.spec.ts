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

test('頂点ドラッグ後も地物選択が維持される', async ({ page }) => {
  await addPolygonFeature(page);

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');

  await map.click({ position: { x: box.width / 2, y: box.height / 2 - 20 } });
  await page.waitForTimeout(300);

  const handleBox = await getVisibleVertexHandleBox(page);

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 45, startY - 30, { steps: 12 });
  const draggingHandleBox = await page.locator('.vertex-handle.dragging').first().boundingBox();
  expect(draggingHandleBox?.width).toBeLessThanOrEqual(7);
  expect(draggingHandleBox?.height).toBeLessThanOrEqual(7);
  const draggingOutlineStyle = await page.locator('.vertex-handle.dragging').first().evaluate((element) =>
    getComputedStyle(element).outlineStyle
  );
  expect(draggingOutlineStyle).toBe('none');
  await page.mouse.up();
  await page.waitForTimeout(300);

  await expect(page.locator('.vertex-handle')).toHaveCount(9);
  await expect(page.locator('button[title="地物移動ツール"]')).toBeVisible();
});
