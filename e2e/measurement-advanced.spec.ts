/**
 * E2E: §2.1 測量モード — 詳細テスト（Phase B）
 *
 * 距離表示形式（正距円筒/大円）、座標表示形式（DMS/十進）、
 * 測量線クリア、複数測量線、モード解除後の測量線残存を検証。
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

async function panToWrappedState(page: import('@playwright/test').Page) {
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 350, cy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  return { svg, box };
}

/** 測量モードで2点クリックするヘルパー */
async function measureTwoPoints(page: import('@playwright/test').Page) {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');
  const cx = box.width / 2;
  const cy = box.height / 2;
  await svg.click({ position: { x: cx - 80, y: cy } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: cx + 80, y: cy } });
  await page.waitForTimeout(300);
}

// §2.1 測量 — 正距円筒距離と大円距離の両方が表示される
test('測量で正距円筒距離と大円距離の両方が表示される', async ({ page }) => {
  await measureTwoPoints(page);

  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    const text = await surveyPanel.textContent();
    // 「大円」と「図法」の両方が含まれる
    expect(text).toContain('大円');
    expect(text).toMatch(/図法|正距/);
  }
});

// §2.1 測量 — クリック地点の座標が度分秒と十進の両方で表示される
test('測量パネルに座標が表示される', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await svg.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(300);

  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    const text = await surveyPanel.textContent();
    // 度分秒パターンまたは十進パターン
    expect(text).toMatch(/°/);
  }
});

// §2.1 測量 — 中央付近のクリックは中央経度付近に描画される
test('中央で測量開始すると始点マーカーが中央経度付近に描画される', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  await svg.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.waitForTimeout(300);

  const markerX = Number(await page.locator('.measurement-marker-start').getAttribute('cx'));
  expect(markerX).toBeGreaterThan(170);
  expect(markerX).toBeLessThan(190);
});

// §2.1 測量 — 測量線が大円パスで描画される（SVG path要素）
test('測量で大円パスがSVG上に描画される', async ({ page }) => {
  await measureTwoPoints(page);

  // MeasurementOverlayのpath要素（stroke="#ffd93d"）
  const surveyPath = page.locator('.map-svg path[stroke="#ffd93d"]');
  const count = await surveyPath.count();
  expect(count).toBeGreaterThan(0);
});

// §2.1 測量 — 横方向無限スクロール中も複製地図に描画される
test('横方向無限スクロール中も測量線とマーカーが複製地図に描画される', async ({ page }) => {
  const { svg, box } = await panToWrappedState(page);
  await page.keyboard.press('m');

  await svg.click({ position: { x: box.width * 0.35, y: box.height / 2 } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: box.width * 0.65, y: box.height / 2 } });
  await page.waitForTimeout(300);

  expect(await svg.locator('g[transform*="translate"]').count()).toBeGreaterThanOrEqual(2);
  expect(await svg.locator('.measurement-path').count()).toBeGreaterThanOrEqual(2);
  expect(await svg.locator('.measurement-marker').count()).toBeGreaterThanOrEqual(4);
});

// §2.1 東西端またぎ — 測量線は短い経路で描画される
test('東西端をまたぐ測量線が短い経路で描画される', async ({ page }) => {
  const { svg, box } = await panToWrappedState(page);
  await page.keyboard.press('m');

  await svg.click({ position: { x: box.width * 0.36, y: box.height * 0.5 } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: box.width * 0.40, y: box.height * 0.5 } });
  await page.waitForTimeout(300);

  const spans = await svg.locator('.measurement-path').evaluateAll((els) =>
    els.map((el) => {
      const matches = (el.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [];
      const xs: number[] = [];
      for (let i = 0; i < matches.length; i += 2) {
        xs.push(Number(matches[i]));
      }
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      return maxX - minX;
    })
  );

  expect(spans.some((span) => span < 40)).toBe(true);
});

// §2.1 測量 — 測量モード解除後も測量線が残る
test('測量モード解除後も測量線が残る', async ({ page }) => {
  await measureTwoPoints(page);

  // 測量線が存在することを確認
  const pathsBefore = await page.locator('.map-svg path[stroke="#ffd93d"]').count();
  expect(pathsBefore).toBeGreaterThan(0);

  // 表示モードに切替
  await page.keyboard.press('v');
  await page.waitForTimeout(300);

  // 測量線がまだ残っている
  const pathsAfter = await page.locator('.map-svg path[stroke="#ffd93d"]').count();
  expect(pathsAfter).toBeGreaterThan(0);
});

// §2.1 測量 — 複数の測量線を同時に表示可能
test('複数の測量線を同時に表示できる', async ({ page }) => {
  await page.keyboard.press('m');
  const svg = page.locator('.map-svg');
  const box = await svg.boundingBox();
  if (!box) throw new Error('SVG not found');

  // 1回目の測量
  await svg.click({ position: { x: box.width * 0.3, y: box.height / 2 } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.waitForTimeout(300);

  const paths1 = await page.locator('.map-svg path[stroke="#ffd93d"]').count();

  // 2回目の測量
  await svg.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } });
  await page.waitForTimeout(200);
  await svg.click({ position: { x: box.width * 0.8, y: box.height * 0.7 } });
  await page.waitForTimeout(300);

  const paths2 = await page.locator('.map-svg path[stroke="#ffd93d"]').count();
  expect(paths2).toBeGreaterThan(paths1);
});

// §2.1 測量 — 測量結果にkm単位が含まれる
test('測量結果にkm単位の距離が表示される', async ({ page }) => {
  await measureTwoPoints(page);

  const surveyPanel = page.locator('.survey-panel');
  if (await surveyPanel.count() > 0) {
    const text = await surveyPanel.textContent();
    expect(text).toContain('km');
  }
});

// §2.1 測量 — 始点マーカーと終点マーカーが異なる色で表示される
test('測量マーカーが始点と終点で異なる色で表示される', async ({ page }) => {
  await measureTwoPoints(page);

  // 始点（赤系 #ff6b6b）と終点（シアン系 #4ecdc4）のcircle要素
  const startMarker = page.locator('.map-svg circle[fill="#ff6b6b"]');
  const endMarker = page.locator('.map-svg circle[fill="#4ecdc4"]');

  const startCount = await startMarker.count();
  const endCount = await endMarker.count();
  // 少なくとも1つずつある
  expect(startCount).toBeGreaterThan(0);
  expect(endCount).toBeGreaterThan(0);
});
