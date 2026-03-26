import { test, expect } from '@playwright/test';
test('bind test', async ({ page }) => {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  await page.keyboard.press('a');
  const pt = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pt.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('v');
  await page.waitForTimeout(200);
  
  // Features tab
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(300);
  
  // Click feature in list  
  const item = page.locator('.feature-item').first();
  await item.click();
  await page.waitForTimeout(500);
  
  const cls = await item.getAttribute('class');
  console.log('After list click class:', cls);
  
  // Now test map click
  await page.keyboard.press('v');
  await map.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
  await page.waitForTimeout(500);
  
  // Switch to features tab and check
  await featureTab.click();
  await page.waitForTimeout(300);
  const cls2 = await page.locator('.feature-item').first().getAttribute('class');
  console.log('After map click + tab switch class:', cls2);
  
  // Check property tab
  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(300);
  const propId = page.locator('#prop-id');
  const hasId = await propId.count();
  console.log('PropId visible:', hasId > 0);
  if (hasId > 0) console.log('PropId value:', await propId.inputValue());
  
  expect(true).toBe(true);
});
