import { test, expect } from '@playwright/test';
test('debug selection with DOM check', async ({ page }) => {
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
  
  const items = page.locator('.feature-item');
  const count = await items.count();
  console.log('Feature count:', count);
  
  if (count > 0) {
    // クリックして、何が起こるか確認
    const html1 = await page.locator('.sidebar').innerHTML();
    console.log('BEFORE CLICK sidebar HTML:', html1.substring(0, 500));
    
    await items.nth(0).click();
    await page.waitForTimeout(1000);
    
    const html2 = await page.locator('.sidebar').innerHTML();
    console.log('AFTER CLICK sidebar HTML:', html2.substring(0, 500));
  }
  
  expect(count).toBeGreaterThan(0);
});
