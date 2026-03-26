# Sidebar選択状態の同期不整合 調査メモ

作成日: 2026-03-26
対象branch: main（未コミットの作業中変更あり）

## 環境
- Svelte 5.54.0
- @sveltejs/vite-plugin-svelte 5.1.1
- electron-vite 5.0.0 / Vite 6.4.1
- Electron 41 + Playwright 1.58
- テストは `http://localhost:5173`（Vite dev server）経由で実行

## 問題
App.svelte（親, 約1300行）から Sidebar.svelte（子）への prop 変更が、テンプレートの DOM に反映されない。

## 現在の実装（最小構成）

### App.svelte（抜粋）
```svelte
let selectedFeatureId = $state<string | null>(null);

<Sidebar
  {currentTime}
  {features}
  {selectedFeatureId}
  onFeatureSelect={(id) => { selectedFeatureId = id; }}
  {onPropertyChange}
/>
```

### Sidebar.svelte（抜粋）
```svelte
let {
  selectedFeatureId = null as string | null,
  onFeatureSelect,
  ...
} = $props();

<!-- テンプレート -->
<p>DEBUG: {selectedFeatureId}</p>

{#each features as f (f.id)}
  <div class:selected={selectedFeatureId === f.id}
       onclick={() => onFeatureSelect?.(f.id)}>
    ...
  </div>
{/each}
```

## 決定的な観測結果

### E2E テストのコンソールログ（Playwright経由）

```
--- item[0] をクリック ---
[BROWSER] SIDEBAR_CLICK f-1 prop: null          ← onclick内でpropを読むと初期値null
[BROWSER] APP_onFeatureSelect f-1 prev: null     ← callbackが親に到達
[BROWSER] APP_after: f-1                         ← 親のstateがf-1に更新
  DEBUG段落: "DEBUG: "                           ← テンプレートは空のまま！
  item[0]: class="feature-item s-..."            ← selectedなし

--- item[1] をクリック ---
[BROWSER] SIDEBAR_CLICK f-2 prop: f-1            ← onclick内でpropを読むとf-1！propは届いている！
[BROWSER] APP_onFeatureSelect f-2 prev: f-1
[BROWSER] APP_after: f-2
  DEBUG段落: "DEBUG: "                           ← テンプレートはまだ空！
  item[1]: class="feature-item s-..."            ← selectedなし

--- item[0] を再クリック ---
[BROWSER] SIDEBAR_CLICK f-1 prop: f-2            ← propはf-2に更新されている！
```

### 解釈
1. **prop は正しく伝搬している** — onclickハンドラ内で `selectedFeatureId` を読むと、前回のクリックで設定された正しい値が返る
2. **callback は正しく動作** — 親の `$state` が更新される
3. **しかしテンプレートに反映されない** — `{selectedFeatureId}` のテキスト表示も、`class:selected` も更新されない

つまり、**propの値はJS実行コンテキストでは正しいが、Svelteのテンプレートバインディング（DOMへの反映）が動作していない**。

## 追加の確認済み事実

### ローカル `$state` は完璧に動作する
同じ Sidebar.svelte 内で、propを使わずローカル `$state` だけで組むと正常に動く：
```svelte
let selectedId = $state<string | null>(null);
class:selected={selectedId === f.id}
onclick={() => { selectedId = f.id; }}
```
→ `class:selected` が正しく切り替わり、`$effect` も毎回発火する。

### `activeTab`（ローカル `$state`）は正常
同じコンポーネント内の別のローカル `$state` によるタブ切り替え `class:active` は正常動作。

### `{#each}` 固有の問題ではない
`{#each}` の外に置いた `<p>DEBUG: {selectedFeatureId}</p>` も更新されない。

## 試行済みの他のアプローチ（参考）

| 手法 | 結果 | 備考 |
|------|------|------|
| Context API (getter/setter) | NG | $derived が追跡しない |
| .svelte.ts $state クラス | NG | シグナル追跡が機能しない |
| writable store + $store構文 | NG | $effect が再発火しない |
| 手動 .subscribe() + ローカル $state | NG | callback内での $state 書き込みが反映されない |

## 質問
1. Svelte 5 で、親の `$state` 変更が子の `$props()` 経由でテンプレートに反映されない既知のバグはあるか？
2. prop の値が JS（onclick handler）では正しいがテンプレートで更新されない、という症状の原因として何が考えられるか？
3. 親コンポーネントが大きい（1300行）ことが prop 伝搬に影響する可能性はあるか？
4. Vite dev server 固有の問題（HMR、モジュールキャッシュ等）の可能性はあるか？
5. Svelte 5.54.0 にこの種のリグレッションがないか？

## ファイル構成
```
src/renderer/
├── App.svelte                    (約1300行, 親)
├── presentation/
│   ├── components/
│   │   ├── Sidebar.svelte        (問題の子コンポーネント)
│   │   ├── PropertyPanel.svelte
│   │   └── LayerPanel.svelte
│   └── state/
│       ├── selectionState.svelte.ts
│       └── selectionStore.ts
```
