import { test, expect } from '@playwright/test';
test('debug onclick', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('v');
  
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);
  
  // Add a console listener
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));
  
  // Inject a click handler to see if click event fires
  await page.evaluate(() => {
    const item = document.querySelector('.feature-item');
    if (item) {
      item.addEventListener('click', () => {
        console.log('NATIVE_CLICK_FIRED on feature-item');
      }, { capture: true });
    }
  });
  
  const items = page.locator('.feature-item');
  await items.nth(0).click();
  await page.waitForTimeout(500);
  
  console.log('Captured logs:', logs);
  expect(true).toBe(true);
});
