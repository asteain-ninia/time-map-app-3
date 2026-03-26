import { test, expect } from '@playwright/test';
test('debug feature list selection', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  
  // ポイント2つ追加
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
  await page.waitForTimeout(500);
  await map.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('v');
  
  // 地物一覧タブ
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);
  
  const items = page.locator('.feature-item');
  const count = await items.count();
  console.log('Feature count:', count);
  
  // クリック前のクラス
  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    console.log(`Before click - item ${i} class: "${cls}"`);
  }
  
  // 1つ目をクリック
  await items.nth(0).click();
  await page.waitForTimeout(500);
  
  // クリック後のクラス
  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    console.log(`After click 0 - item ${i} class: "${cls}"`);
  }
  
  // selectedFeatureIdを確認
  const selectedId = await page.evaluate(() => {
    // Svelteの内部状態にアクセスは難しいので、プロパティパネルのIDを確認
    const propIdEl = document.querySelector('#prop-id') as HTMLInputElement;
    return propIdEl?.value ?? 'NOT_FOUND';
  });
  console.log('Selected ID from prop-id:', selectedId);
  
  expect(count).toBeGreaterThanOrEqual(2);
});
