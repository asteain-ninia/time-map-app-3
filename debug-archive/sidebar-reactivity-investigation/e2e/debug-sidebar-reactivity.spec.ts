/**
 * Sidebar リアクティビティのデバッグテスト
 */
import { test, expect } from '@playwright/test';

test('Sidebar選択状態のデバッグ', async ({ page }) => {
  // ブラウザコンソールのログを転送（ページロード前に設定）
  page.on('console', msg => {
    const text = msg.text();
    if (text.startsWith('CLICK') || text.startsWith('DERIVED') || text.startsWith('after') || text.startsWith('SIDEBAR_') || text.startsWith('EFFECT_') || text.startsWith('APP_') || text.startsWith('handle')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // 2つのポイントを追加
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

  // 地物一覧タブを開く
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(300);

  const appDebug = page.locator('#app-debug');
  const debugP = page.locator('.sidebar p');
  const items = page.locator('.feature-item');
  const count = await items.count();
  console.log(`=== 地物数: ${count} ===`);

  console.log(`  APP_DEBUG: "${await appDebug.textContent()}"`);
  console.log(`  SIDEBAR_DEBUG: "${await debugP.textContent()}"`);


  // 全アイテムのクラスをダンプ
  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    const text = await items.nth(i).textContent();
    console.log(`  item[${i}]: class="${cls}" text="${text?.trim()}"`);
  }

  const sidebarEl = page.locator('.sidebar');

  // item 0 をクリック
  console.log('\n--- item[0] をクリック ---');
  await items.nth(0).click();
  await page.waitForTimeout(500);
  console.log(`  APP_DEBUG: "${await appDebug.textContent()}"`);
  console.log(`  SIDEBAR_DEBUG: "${await debugP.textContent()}"`);

  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    console.log(`  item[${i}]: class="${cls}"`);
  }

  // item 1 をクリック
  console.log('\n--- item[1] をクリック ---');
  await items.nth(1).click();
  await page.waitForTimeout(500);
  console.log(`  APP_DEBUG: "${await appDebug.textContent()}"`);
  console.log(`  SIDEBAR_DEBUG: "${await debugP.textContent()}"`);

  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    console.log(`  item[${i}]: class="${cls}"`);
  }

  // もう一度 item 0 をクリック
  console.log('\n--- item[0] を再クリック ---');
  await items.nth(0).click();
  await page.waitForTimeout(500);
  console.log(`  APP_DEBUG: "${await appDebug.textContent()}"`);
  console.log(`  SIDEBAR_DEBUG: "${await debugP.textContent()}"`);

  for (let i = 0; i < count; i++) {
    const cls = await items.nth(i).getAttribute('class');
    console.log(`  item[${i}]: class="${cls}"`);
  }

  // Sidebar の innerHTML をダンプ
  const sidebar = page.locator('.sidebar');
  const html = await sidebar.innerHTML();
  console.log('\n--- Sidebar innerHTML (最初の2000文字) ---');
  console.log(html.substring(0, 2000));

  // MinimalChild のボタンをクリックして最小再現テスト
  console.log('\n--- MinimalChild テスト ---');
  const minChild = page.locator('#minimal-test');
  const minChildP = minChild.locator('p');
  console.log(`  MinChild初期: "${await minChildP.textContent()}"`);

  const helloBtn = minChild.locator('button', { hasText: 'Set hello' });
  await helloBtn.click();
  await page.waitForTimeout(500);
  console.log(`  MinChild hello後: "${await minChildP.textContent()}"`);
  console.log(`  APP_DEBUG hello後: "${await appDebug.textContent()}"`);

  const worldBtn = minChild.locator('button', { hasText: 'Set world' });
  await worldBtn.click();
  await page.waitForTimeout(500);
  console.log(`  MinChild world後: "${await minChildP.textContent()}"`);
  console.log(`  APP_DEBUG world後: "${await appDebug.textContent()}"`);

  // 強制的にパス（デバッグ用）
  expect(true).toBe(true);
});
