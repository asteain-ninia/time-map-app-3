import { expect, test } from '@playwright/test';

async function addPointFeature(
  page: import('@playwright/test').Page,
  offsetX: number
): Promise<void> {
  await page.keyboard.press('a');
  await page.locator('.tool-button.sub-tool[title="点を追加"]').click();

  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) {
    throw new Error('map not found');
  }

  await map.click({
    position: {
      x: box.width / 2 + offsetX,
      y: box.height / 2,
    },
  });
  await page.waitForTimeout(350);
  await page.keyboard.press('v');
}

async function renameSelectedFeature(
  page: import('@playwright/test').Page,
  name: string,
  description: string
): Promise<void> {
  const nameInput = page.locator('#prop-name');
  await expect(nameInput).toBeVisible({ timeout: 3000 });
  await nameInput.fill(name);
  await nameInput.press('Tab');

  const descriptionInput = page.locator('#prop-desc');
  await descriptionInput.fill(description);
  await descriptionInput.blur();
  await page.waitForTimeout(150);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

test('地物一覧で説明文を検索して先頭結果へ移動できる', async ({ page }) => {
  await addPointFeature(page, -60);
  await page.locator('.tab', { hasText: '地物一覧' }).click();
  await page.locator('.feature-item').first().click();
  await renameSelectedFeature(page, 'Alpha City', 'Harbor capital');

  await addPointFeature(page, 60);
  await page.locator('.tab', { hasText: '地物一覧' }).click();
  await page.locator('.feature-item').nth(1).click();
  await renameSelectedFeature(page, 'Beta Fort', 'Mountain watch');

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();

  const searchInput = page.locator('.feature-search-input');
  await searchInput.fill('Harbor');
  await expect(page.locator('.feature-item')).toHaveCount(1);
  await expect(page.locator('.feature-description mark')).toContainText('Harbor');

  await searchInput.press('Enter');
  await expect(page.locator('.tab', { hasText: 'プロパティ' })).toHaveClass(/active/);
  await expect(page.locator('#prop-name')).toHaveValue('Alpha City');

  await featureTab.click();
  await expect(searchInput).toHaveValue('Harbor');
});

test('サイドバーとタイムラインを折りたためる', async ({ page }) => {
  const sidebarArea = page.locator('.sidebar-area');
  const expandedWidth = await sidebarArea.evaluate((el) => el.getBoundingClientRect().width);
  expect(expandedWidth).toBeGreaterThan(200);

  const sidebarToggle = page.locator('.collapse-button');
  await sidebarToggle.click();
  await expect(page.locator('.collapsed-toggle')).toBeVisible();
  await expect
    .poll(async () => sidebarArea.evaluate((el) => el.getBoundingClientRect().width))
    .toBeLessThan(80);

  await page.locator('.collapsed-toggle').click();
  await page.locator('.tab', { hasText: 'レイヤー' }).click();
  await expect(page.locator('.layer-panel')).toBeVisible();
  await expect(page.locator('.focus-panel')).toBeVisible();

  const timelineToggle = page.locator('.timeline-panel-toggle');
  const expandedTimelineHeight = await page
    .locator('.timeline-panel')
    .evaluate((el) => el.getBoundingClientRect().height);
  await timelineToggle.click();
  await expect(page.locator('.timeline-controls')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.locator('.timeline-panel').evaluate((el) => el.getBoundingClientRect().height)
    )
    .toBeLessThan(expandedTimelineHeight / 2);

  await timelineToggle.click();
  await expect(page.locator('.timeline-controls')).toBeVisible();
});
