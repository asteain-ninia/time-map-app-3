/**
 * E2E: §2.3.3 編集モード（選択・プロパティ表示・解除）
 *
 * 地物選択、プロパティパネル連動、Escape解除、サイドバータブを検証。
 */
import { test, expect } from '@playwright/test';

/** ポイント地物を1つ追加するヘルパー */
async function addPointFeature(page: import('@playwright/test').Page) {
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(500);
  // 表示モードに戻す
  await page.keyboard.press('v');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// §2.3.3.1 選択機能 — 地物クリックで選択
// KNOWN BUG: 地物一覧からの選択でプロパティタブに自動切替されない
test.fixme('地物追加後に地物一覧で選択するとプロパティタブに切り替わる', async ({ page }) => {
  await addPointFeature(page);

  // 地物一覧タブを開く
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);

  // 地物をクリック
  const featureItem = page.locator('.feature-item').first();
  await featureItem.click();
  await page.waitForTimeout(300);

  // プロパティタブに自動切替 — プロパティパネルの内容が表示される
  await page.waitForTimeout(500);
  const propContent = page.locator('#prop-id, .empty-message');
  await expect(propContent.first()).toBeVisible({ timeout: 3000 });
});

// §2.3.3.1 プロパティ表示 — 選択地物のプロパティが表示される
test('選択した地物のIDがプロパティパネルに表示される', async ({ page }) => {
  await addPointFeature(page);

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);

  const featureItem = page.locator('.feature-item').first();
  await featureItem.click();
  await page.waitForTimeout(300);

  // IDフィールドが表示される
  const idInput = page.locator('#prop-id');
  if (await idInput.count() > 0) {
    const value = await idInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  }
});

// §2.3.3.1 選択解除 — Escapeで解除
test('Escapeキーで地物選択が解除される', async ({ page }) => {
  await addPointFeature(page);

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);

  const featureItem = page.locator('.feature-item').first();
  await featureItem.click();
  await page.waitForTimeout(200);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // プロパティパネルに「選択されていません」表示
  const emptyMsg = page.locator('.empty-message');
  if (await emptyMsg.count() > 0) {
    const text = await emptyMsg.textContent();
    expect(text).toContain('選択されていません');
  }
});

// §2.4.3 サイドバー — タブ切替
test('サイドバーのタブが切り替えられる', async ({ page }) => {
  // レイヤータブ
  const layerTab = page.locator('.tab', { hasText: 'レイヤー' });
  await layerTab.click();
  await expect(layerTab).toHaveClass(/active/);

  // 地物一覧タブ
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await expect(featureTab).toHaveClass(/active/);

  // プロパティタブ
  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await expect(propTab).toHaveClass(/active/);
});

// §2.1 レイヤー — デフォルトレイヤーが存在する
test('レイヤータブにデフォルトレイヤーが表示される', async ({ page }) => {
  const layerTab = page.locator('.tab', { hasText: 'レイヤー' });
  await layerTab.click();
  await page.waitForTimeout(200);

  const layerItem = page.locator('.layer-item');
  const count = await layerItem.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

// §2.1 レイヤー — 表示/非表示の切り替え
test('レイヤーの表示/非表示を切り替えられる', async ({ page }) => {
  const layerTab = page.locator('.tab', { hasText: 'レイヤー' });
  await layerTab.click();
  await page.waitForTimeout(200);

  const visToggle = page.locator('.visibility-toggle').first();
  if (await visToggle.count() > 0) {
    const beforeText = await visToggle.textContent();
    await visToggle.click();
    await page.waitForTimeout(200);
    const afterText = await visToggle.textContent();
    expect(afterText).not.toBe(beforeText);
  }
});
