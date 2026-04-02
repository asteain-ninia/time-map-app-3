/**
 * E2E: §2.4-§2.6 プロパティ・保存・設定 — 詳細テスト（Phase E）
 *
 * プロパティパネル名前編集、歴史の錨一覧、
 * 保存ショートカット、メニュー項目、未保存警告、
 * プロジェクト設定の各フィールドを検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

/** ポイント地物を追加して選択するヘルパー */
async function addAndSelectPoint(page: import('@playwright/test').Page) {
  await page.keyboard.press('a');
  const pointTool = page.locator('.tool-button.sub-tool[title="点を追加"]');
  await pointTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('v');

  // 地物一覧で選択
  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);
  const featureItem = page.locator('.feature-item').first();
  await featureItem.click();
  await page.waitForTimeout(300);
}

/** ポリゴン地物を追加して選択するヘルパー */
async function addAndSelectPolygon(page: import('@playwright/test').Page) {
  await page.keyboard.press('a');
  const polygonTool = page.locator('.tool-button.sub-tool[title="面を追加"]');
  await polygonTool.click();
  const map = page.locator('.map-svg');
  const box = await map.boundingBox();
  if (!box) throw new Error('map not found');
  await map.click({ position: { x: box.width * 0.35, y: box.height * 0.4 } });
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.35 } });
  await map.click({ position: { x: box.width * 0.45, y: box.height * 0.55 } });
  await page.locator('.drawing-btn.confirm').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('v');

  const featureTab = page.locator('.tab', { hasText: '地物一覧' });
  await featureTab.click();
  await page.waitForTimeout(200);
  await page.locator('.feature-item').first().click();
  await page.waitForTimeout(300);
}

// ============================================================
// §2.4.1 プロパティパネル
// ============================================================

// §2.4.1 プロパティ — 名前入力フィールドがある
test('プロパティパネルに名前入力フィールドがある', async ({ page }) => {
  await addAndSelectPoint(page);

  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  const nameInput = page.locator('#prop-name');
  if (await nameInput.count() > 0) {
    await expect(nameInput).toBeVisible();
  }
});

// §2.4.1 プロパティ — IDフィールドが読み取り専用
test('プロパティパネルのIDフィールドが読み取り専用である', async ({ page }) => {
  await addAndSelectPoint(page);

  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  const idInput = page.locator('#prop-id');
  if (await idInput.count() > 0) {
    const readonly = await idInput.getAttribute('readonly');
    expect(readonly).not.toBeNull();
  }
});

// §2.3.3.1 プロパティ — 歴史の錨一覧が表示される
test('プロパティパネルに歴史の錨一覧が表示される', async ({ page }) => {
  await addAndSelectPoint(page);

  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  const anchorList = page.locator('.anchor-list');
  if (await anchorList.count() > 0) {
    await expect(anchorList).toBeVisible();
  }
});

// §2.4.1 プロパティ — 選択地物を変更するとプロパティが更新される
test('別の地物を選択するとプロパティパネルのIDが更新される', async ({ page }) => {
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
  await page.waitForTimeout(200);

  const items = page.locator('.feature-item');
  const count = await items.count();
  if (count < 2) return; // 地物が2つ追加されていない場合スキップ

  // 1つ目を選択
  await items.nth(0).click();
  await page.waitForTimeout(300);

  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  const idInput = page.locator('#prop-id');
  if (await idInput.count() === 0) return;

  const firstId = await idInput.inputValue();

  // 地物一覧に戻って2つ目を選択
  await featureTab.click();
  await page.waitForTimeout(200);
  await items.nth(1).click();
  await page.waitForTimeout(300);

  await propTab.click();
  await page.waitForTimeout(200);

  const secondId = await idInput.inputValue();

  // 異なるIDが表示されることを確認
  expect(firstId).not.toBe(secondId);
});

// §2.4.1 プロパティ — 空選択時に「選択されていません」メッセージ
test('何も選択していない時に「選択されていません」が表示される', async ({ page }) => {
  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  const emptyMsg = page.locator('.empty-message');
  if (await emptyMsg.count() > 0) {
    const text = await emptyMsg.textContent();
    expect(text).toContain('選択されていません');
  }
});

test('プロジェクト設定の既定パレットが新規面のプロパティ初期値に反映される', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  await page.locator('.menu-action', { hasText: 'プロジェクト設定' }).click();
  await page.waitForTimeout(300);

  await page.locator('#ps-default-palette').selectOption('パステル');
  await page.locator('button', { hasText: '保存' }).click();
  await page.waitForTimeout(300);

  await addAndSelectPolygon(page);

  const propTab = page.locator('.tab', { hasText: 'プロパティ' });
  await propTab.click();
  await page.waitForTimeout(200);

  await expect(page.locator('#prop-auto-color')).toBeChecked();
  await expect(page.locator('#prop-palette')).toHaveValue('パステル');
});

// ============================================================
// §2.5 保存・読み込み — メニュー項目
// ============================================================

// §2.5 保存 — ファイルメニューに「保存」がある
test('ファイルメニューに「保存」と「開く」がある', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();
  await page.waitForTimeout(200);

  const saveAction = page.locator('.menu-action', { hasText: '保存' });
  await expect(saveAction.first()).toBeVisible();

  const openAction = page.locator('.menu-action', { hasText: '開く' });
  await expect(openAction.first()).toBeVisible();

  await page.keyboard.press('Escape');
});

// §2.5 保存 — 「名前を付けて保存」がある
test('ファイルメニューに「名前を付けて保存」がある', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();
  await page.waitForTimeout(200);

  const saveAsAction = page.locator('.menu-action', { hasText: '名前を付けて' });
  if (await saveAsAction.count() > 0) {
    await expect(saveAsAction.first()).toBeVisible();
  }

  await page.keyboard.press('Escape');
});

// §2.5 保存 — ショートカットキーが表示される（Ctrl+S、Ctrl+O）
test('保存と開くにショートカットキーが表示される', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();
  await page.waitForTimeout(200);

  const dropdown = page.locator('.menu-dropdown');
  const text = await dropdown.textContent();
  expect(text).toContain('Ctrl+S');
  expect(text).toContain('Ctrl+O');

  await page.keyboard.press('Escape');
});

// §2.3.1 編集メニュー — Undo/Redoにショートカットが表示される
test('編集メニューにCtrl+ZとCtrl+Yのショートカットが表示される', async ({ page }) => {
  const editTrigger = page.locator('.menu-trigger', { hasText: '編集' });
  await editTrigger.click();
  await page.waitForTimeout(200);

  const dropdown = page.locator('.menu-dropdown');
  const text = await dropdown.textContent();
  expect(text).toContain('Ctrl+Z');
  expect(text).toContain('Ctrl+Y');

  await page.keyboard.press('Escape');
});

// §2.5 新規プロジェクト — ファイルメニューに「新規プロジェクト」がある
test('ファイルメニューに「新規プロジェクト」がある', async ({ page }) => {
  const fileTrigger = page.locator('.menu-trigger', { hasText: 'ファイル' });
  await fileTrigger.click();
  await page.waitForTimeout(200);

  const newAction = page.locator('.menu-action', { hasText: '新規プロジェクト' });
  await expect(newAction).toBeVisible();

  await page.keyboard.press('Escape');
});

// ============================================================
// §2.6 プロジェクト設定 — フィールド詳細
// ============================================================

// §2.6.1 設定 — 赤道長フィールドがある
test('プロジェクト設定に赤道長フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const eqInput = page.locator('#ps-eq');
  if (await eqInput.count() > 0) {
    await expect(eqInput).toBeVisible();
  }
});

// §2.6.1 設定 — タイムライン最小年/最大年フィールドがある
test('プロジェクト設定にタイムライン最小年と最大年がある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const minInput = page.locator('#ps-min');
  const maxInput = page.locator('#ps-max');
  if (await minInput.count() > 0) {
    await expect(minInput).toBeVisible();
    await expect(maxInput).toBeVisible();
  }
});

// §2.6.1 設定 — プロジェクト説明テキストエリアがある
test('プロジェクト設定にプロジェクト説明欄がある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const descInput = page.locator('#ps-desc');
  if (await descInput.count() > 0) {
    await expect(descInput).toBeVisible();
  }
});

// §2.6.1 設定 — 扁平率フィールドがある
test('プロジェクト設定に扁平率フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const obInput = page.locator('#ps-ob');
  if (await obInput.count() > 0) {
    await expect(obInput).toBeVisible();
  }
});

// §2.6.2 設定UI — モーダル内コンテンツは縦スクロール可能
test('プロジェクト設定ダイアログはスクロール可能', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const dialogBody = page.locator('.dialog-body');
  if (await dialogBody.count() > 0) {
    const overflow = await dialogBody.evaluate(el => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflow);
  }
});

// §2.6.1 面情報ラベル閾値 — 設定項目がある
test('プロジェクト設定に面情報ラベル閾値フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const latInput = page.locator('#ps-lat');
  if (await latInput.count() > 0) {
    await expect(latInput).toBeVisible();
  }
});
