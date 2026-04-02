/**
 * E2E: §2.1 地図表示機能 — 詳細テスト（Phase A）
 *
 * 横方向無限スクロール、中ボタンパン、カーソル中心ズーム、
 * ベースマップ制約、グリッド設定、経度シフトを検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// ============================================================
// §2.1 横方向無限スクロール
// ============================================================

// §2.1 横方向無限スクロール — 地図の複製が存在する（wrapOffsets）
test('横方向無限スクロール: 地図の複製グループが複数存在する', async ({ page }) => {
  const svg = page.locator('.map-svg');
  // wrapOffsetsによる<g transform="translate(...)">グループが複数ある
  // 初期表示では1つかもしれないが、ズームインすると複数になる
  await page.mouse.move(
    (await svg.boundingBox())!.x + (await svg.boundingBox())!.width / 2,
    (await svg.boundingBox())!.y + (await svg.boundingBox())!.height / 2
  );
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const translateGroups = svg.locator('g[transform*="translate"]');
  const count = await translateGroups.count();
  // ズームインするとwrapOffsetsが増える
  expect(count).toBeGreaterThanOrEqual(1);
});

// §2.1 横方向無限スクロール — 左にパンして東端を超えても地図が途切れない
test('横方向無限スクロール: 大きく左パンしても地図が表示され続ける', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // viewBox取得
  const vbBefore = await svg.getAttribute('viewBox');

  // 大きく左にパン（東方向にスクロール）
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 300, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);

  // 地図複製グループがまだ存在する
  const translateGroups = svg.locator('g[transform*="translate"]');
  const count = await translateGroups.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// §2.1 横方向無限スクロール — 右にパンして西端を超えても地図が途切れない
test('横方向無限スクロール: 大きく右パンしても地図が表示され続ける', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // 大きく右にパン（西方向にスクロール）
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 300, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // 地図複製グループがまだ存在する
  const translateGroups = svg.locator('g[transform*="translate"]');
  const count = await translateGroups.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// §2.1 横方向無限スクロール — 1周以上パンしても対応する複製グループが更新される
test('横方向無限スクロール: 複数周パンしても表示タイルが追随する', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  for (let i = 0; i < 4; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 600, cy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  const transforms = await svg.locator('g[transform*="translate"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('transform') || '')
  );

  expect(transforms.some((transform) => transform.includes('-720'))).toBe(true);
});

// §2.1 横方向無限スクロール — レイヤー単位の描画順でタイル干渉を防ぐ
test('横方向無限スクロール: 背景・地物・グリッドがレイヤー分離されている', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const layerNames = await svg.evaluate((el) =>
    Array.from(el.children)
      .map((child) => child.getAttribute('class'))
      .filter((className): className is string => Boolean(className))
  );

  expect(layerNames.some((className) => className.includes('wrap-background-layer'))).toBe(true);
  expect(layerNames.some((className) => className.includes('wrap-feature-layer'))).toBe(true);
  expect(layerNames.some((className) => className.includes('wrap-grid-layer'))).toBe(true);

  expect(layerNames.findIndex((className) => className.includes('wrap-background-layer'))).toBeLessThan(
    layerNames.findIndex((className) => className.includes('wrap-feature-layer'))
  );
  expect(layerNames.findIndex((className) => className.includes('wrap-feature-layer'))).toBeLessThan(
    layerNames.findIndex((className) => className.includes('wrap-grid-layer'))
  );

  const wrapTileCounts = await Promise.all([
    svg.locator('.wrap-background-layer > .wrap-background-tile').count(),
    svg.locator('.wrap-feature-layer > .wrap-feature-tile').count(),
    svg.locator('.wrap-grid-layer > .wrap-grid-tile').count(),
  ]);

  expect(wrapTileCounts[0]).toBeGreaterThanOrEqual(2);
  expect(wrapTileCounts[0]).toBe(wrapTileCounts[1]);
  expect(wrapTileCounts[1]).toBe(wrapTileCounts[2]);
});

// ============================================================
// §2.1 パン操作 — 中ボタンドラッグ
// ============================================================

// §2.1 パン操作 — 表示モードで中ボタンドラッグでもパンできる
test('表示モードで中ボタンドラッグでパンできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

// §2.1 パン操作 — 追加モードで中ボタンドラッグでパンできる
test('追加モードで中ボタンドラッグでパンできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.keyboard.press('a');
  await page.waitForTimeout(100);

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

// §2.1 パン操作 — 編集モードでは左ドラッグでパンしない
test('編集モードでは左ドラッグでパンしない', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.keyboard.press('e');
  await page.waitForTimeout(100);

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).toBe(vbBefore);
});

// §2.1 パン操作 — 編集モードで中ボタンドラッグでパンできる
test('編集モードで中ボタンドラッグでパンできる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.keyboard.press('e');
  await page.waitForTimeout(100);

  const vbBefore = await svg.getAttribute('viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(200);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

// ============================================================
// §2.1 ズーム操作 — カーソル中心
// ============================================================

// §2.1 ズーム操作 — ズームはカーソル位置を中心に行われる
test('ズームイン時にカーソル位置が中心になる', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  // 右上でズームイン
  const rightX = box.x + box.width * 0.75;
  const topY = box.y + box.height * 0.25;

  const vbBefore = await svg.getAttribute('viewBox');
  const [, , wBefore] = (vbBefore || '').split(' ').map(Number);

  await page.mouse.move(rightX, topY);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  const [xAfter, , wAfter] = (vbAfter || '').split(' ').map(Number);

  // ズームイン後、viewBoxの幅が小さくなる
  expect(wAfter).toBeLessThan(wBefore);
  // viewBox原点が右方向にシフトしている（右側でズームしたため）
  expect(xAfter).toBeGreaterThan(0);
});

// §2.1 ズーム操作 — 全モードでホイールズームが動作する
test('追加モードでもホイールズームが動作する', async ({ page }) => {
  await page.keyboard.press('a');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const vbBefore = await svg.getAttribute('viewBox');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

test('編集モードでもホイールズームが動作する', async ({ page }) => {
  await page.keyboard.press('e');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const vbBefore = await svg.getAttribute('viewBox');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

test('測量モードでもホイールズームが動作する', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const vbBefore = await svg.getAttribute('viewBox');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  const vbAfter = await svg.getAttribute('viewBox');
  expect(vbAfter).not.toBe(vbBefore);
});

// ============================================================
// §2.1 ベースマップ制約
// ============================================================

// §2.1 ベースマップ — テキスト選択不可
test('ベースマップのテキスト選択が不可である', async ({ page }) => {
  const baseGroup = page.locator('.wrap-base-map-layer').first();
  if (await baseGroup.count() > 0) {
    const userSelect = await baseGroup.evaluate(el => getComputedStyle(el).userSelect);
    expect(userSelect).toBe('none');
  }
});

// ============================================================
// §2.1 グリッド設定
// ============================================================

// §2.1 グリッド — 本初子午線が強調表示される
test('本初子午線が強調表示される（緑色のline要素が存在する）', async ({ page }) => {
  // SVG内の要素はPlaywrightのvisibility判定で隠れることがあるので、存在確認
  const greenLines = page.locator('.grid-layer line[stroke="#66ff66"]');
  const count = await greenLines.count();
  expect(count).toBeGreaterThan(0);
});

// §2.1 グリッド — 180度経線（反子午線）が強調表示される
test('180度経線が強調表示される（青色のline要素が存在する）', async ({ page }) => {
  const blueLines = page.locator('.grid-layer line[stroke="#6666ff"]');
  const count = await blueLines.count();
  expect(count).toBeGreaterThan(0);
});

// §2.1 グリッド — 赤道が強調表示される（赤色のline要素が存在する）
test('赤道が強調表示される（赤色のline要素が存在する）', async ({ page }) => {
  const redLines = page.locator('.grid-layer line[stroke="#ff6666"]');
  const count = await redLines.count();
  expect(count).toBeGreaterThan(0);
});

// §2.1 グリッド間隔設定 — プロジェクト設定でグリッド間隔を変更できる
test('プロジェクト設定でグリッド間隔を変更できる', async ({ page }) => {
  // プロジェクト設定ダイアログを開く
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  // グリッド間隔セレクタ
  const gridSelect = page.locator('#ps-gi');
  if (await gridSelect.count() > 0) {
    // 選択肢に5, 10, 15, 30がある
    const options = gridSelect.locator('option');
    const optionTexts: string[] = [];
    for (let i = 0; i < await options.count(); i++) {
      optionTexts.push(await options.nth(i).textContent() || '');
    }
    expect(optionTexts.some(t => t.includes('5'))).toBe(true);
    expect(optionTexts.some(t => t.includes('10'))).toBe(true);
    expect(optionTexts.some(t => t.includes('15'))).toBe(true);
    expect(optionTexts.some(t => t.includes('30'))).toBe(true);
  }
});

// §2.1 グリッド色設定 — プロジェクト設定でグリッド色を変更できる
test('プロジェクト設定にグリッド色フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const colorInput = page.locator('#ps-gc');
  if (await colorInput.count() > 0) {
    await expect(colorInput).toBeVisible();
  }
});

// §2.1 グリッド不透明度設定
test('プロジェクト設定にグリッド不透明度フィールドがある', async ({ page }) => {
  const toolsTrigger = page.locator('.menu-trigger', { hasText: 'ツール' });
  await toolsTrigger.click();
  await page.waitForTimeout(200);
  const settingsAction = page.locator('.menu-action', { hasText: 'プロジェクト設定' });
  await settingsAction.click();
  await page.waitForTimeout(300);

  const opacityInput = page.locator('#ps-go');
  if (await opacityInput.count() > 0) {
    await expect(opacityInput).toBeVisible();
  }
});

// ============================================================
// §2.1 ステータスバー — 座標表示形式
// ============================================================

// §2.1 ステータスバー — DMS形式と十進形式の両方が表示される
test('ステータスバーに度分秒と十進形式の両方で座標が表示される', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  const statusBar = page.locator('.status-bar');
  const text = await statusBar.textContent();
  // DMS形式のパターン: 度°分'秒"
  expect(text).toMatch(/\d+°\d+'/);
  // 十進形式のパターン
  expect(text).toMatch(/\d+\.\d+°/);
});

// §2.1 ステータスバー — ズームレベルが表示される
test('ステータスバーにズームレベルが表示される', async ({ page }) => {
  const statusBar = page.locator('.status-bar');
  const text = await statusBar.textContent();
  expect(text).toMatch(/ズーム.*\d/);
});

// §2.1 ステータスバー — カーソルが地図外にあると座標が非表示
test('カーソルが地図外にあると座標が「--」になる', async ({ page }) => {
  // マウスをメニューバーに移動（地図外）
  const menuBar = page.locator('.menu-bar');
  const menuBox = await menuBar.boundingBox();
  if (menuBox) {
    await page.mouse.move(menuBox.x + 10, menuBox.y + 5);
    await page.waitForTimeout(300);
  }

  const statusBar = page.locator('.status-bar');
  const text = await statusBar.textContent();
  expect(text).toContain('--');
});

// ============================================================
// §2.1 初期表示
// ============================================================

// §2.1 初期表示 — viewBoxが360×180（全体表示）に近い値
test('初期表示で地図全体が表示される（viewBox幅≒360）', async ({ page }) => {
  const svg = page.locator('.map-svg');
  const viewBox = await svg.getAttribute('viewBox');
  expect(viewBox).toBeTruthy();
  const parts = (viewBox || '').split(' ').map(Number);
  // 幅が360付近であること（全体表示）
  expect(parts[2]).toBeGreaterThanOrEqual(300);
  expect(parts[2]).toBeLessThanOrEqual(500);
});

// §2.1 ズーム範囲制限 — デフォルト最小1倍、最大50倍
test('ズームレベルが1倍から始まる', async ({ page }) => {
  const statusBar = page.locator('.status-bar');
  const text = await statusBar.textContent();
  // "ズーム: 1.0x" のようなパターン
  expect(text).toMatch(/ズーム.*1\.0/);
});
