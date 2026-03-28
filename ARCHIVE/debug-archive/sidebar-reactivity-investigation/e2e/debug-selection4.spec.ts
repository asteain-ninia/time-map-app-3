import { test, expect } from '@playwright/test';
test('debug class binding', async ({ page }) => {
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
  
  const item = page.locator('.feature-item').first();
  
  // click event listener to watch for changes
  await page.evaluate(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          console.log('CLASS_CHANGED:', (m.target as HTMLElement).className);
        }
      }
    });
    const el = document.querySelector('.feature-item');
    if (el) observer.observe(el, { attributes: true });
  });
  
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));
  
  await item.click();
  await page.waitForTimeout(1000);
  
  console.log('Mutation logs:', logs.filter(l => l.includes('CLASS_CHANGED')));
  
  // Also check the full sidebar HTML after longer wait
  const html = await page.locator('.tab-content').innerHTML();
  console.log('Tab content after click:', html.substring(0, 300));
  
  expect(true).toBe(true);
});
