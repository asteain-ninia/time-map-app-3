# Sidebar リアクティビティ不具合 調査記録

**調査日**: 2026-03-26 〜 2026-03-27
**対象Issue**: #20 (プロパティタブが選択地物変更で更新されない問題) の延長
**状態**: 未解決

---

## 症状

Sidebar の地物一覧でアイテムをクリックしても、`class:selected` が付与されない。
`selectedFeatureId` のテンプレート表示 (`{selectedFeatureId}`) も更新されない。

## 調査で判明した事実

### 1. コールバックは正常に動作する
- Sidebar の `onclick` → `onFeatureSelect?.(f.id)` → App の `handleFeatureSelect(id)` は正しく呼ばれる
- `console.log` で確認済み

### 2. JS代入は成功している
- `handleFeatureSelect` 内の `selectedFeatureId = id` は実行される
- 次のクリック時に Sidebar の `$props()` 経由で `prop: f-1` と正しく読み取れる
- つまりシグナルの内部値は更新されている

### 3. しかし $effect が発火しない
- App.svelte に追加した `$effect(() => { console.log('EFFECT_selectedFeatureId:', selectedFeatureId); })` は：
  - **初期レンダリング時**: 発火する（`null` を出力）
  - **Sidebar クリック時**: 発火しない
  - **MinimalChild ボタンクリック時**: 発火する

### 4. MinimalChild との比較で問題を切り分け
- MinimalChild.svelte（最小の子コンポーネント）を作成し、同じ `selectedFeatureId` を prop + callback で接続
- MinimalChild のボタンクリック → `selectedFeatureId = v` → **DOM更新される、$effect発火する**
- Sidebar のアイテムクリック → `selectedFeatureId = id` → **DOM更新されない、$effect発火しない**

### 5. コンパイル出力は同一
Vite dev server のコンパイル出力を確認：
- `handleFeatureSelect` 内: `$.set(selectedFeatureId, id, true)`
- MinimalChild のインラインコールバック内: `$.set(selectedFeatureId, v, true)`
- 同じ `$.set()` 呼び出し、同じシグナル参照

### 6. 親のDOM自体も更新されない
- `<p id="app-debug">APP: {selectedFeatureId}</p>` を App.svelte に追加
- Sidebar クリック後: `APP: ` のまま（空）
- MinimalChild クリック後: `APP: hello` に正しく更新
- → 問題は Sidebar → App の prop 伝播ではなく、**App.svelte 自体のリアクティビティ**

## 試したアプローチと結果

| # | アプローチ | 結果 |
|---|-----------|------|
| 1 | Context API (`setContext`/`getContext`) | NG: Svelte 5 の Context はシグナルを伝播しない |
| 2 | `.svelte.ts` モジュールストア (`$state` in module) | NG: `$derived` がトラッキングしない（dev server） |
| 3 | `writable` ストア | NG: `.set()` は動くが `$effect`/テンプレートが反応しない |
| 4 | Props + Callback（標準パターン） | 部分的: コールバックは動くがDOMが更新されない |
| 5 | インライン → 名前付き関数 | NG: 結果変わらず |
| 6 | `console.log` 除去（副作用排除） | NG: 結果変わらず |
| 7 | `$effect` 監視追加 | 診断用: Sidebar経由の `$.set()` で発火しないことを確認 |

## 未検証の仮説

### A. HMR (Hot Module Replacement) によるシグナル参照の不整合
- dev server の HMR がモジュールを再実行すると、新旧のシグナルオブジェクトが混在する可能性
- **検証方法**: プロダクションビルドで同じテストを実行

### B. Svelte 5 のイベントデリゲーションとコンポーネント境界の問題
- Svelte 5 はクリックイベントをルート要素にデリゲートする
- コンポーネント境界をまたぐイベントハンドラでシグナル購読が正しく動かない可能性
- **検証方法**: Sidebar の onclick に `stopPropagation` を追加 / `onmouseup` に変更

### C. App.svelte のサイズ（~1300行）による問題
- 大きなコンポーネントでコンパイラのリアクティビティトラッキングが壊れる可能性
- **検証方法**: App.svelte を分割して小さなコンポーネントにする

### D. Svelte 5.54.0 のバグ
- バージョン固有の問題
- **検証方法**: Svelte のバージョンを変更（5.53.x や 5.55.x など）

## 環境情報

- Svelte 5.54.0
- @sveltejs/vite-plugin-svelte 5.1.1
- Vite 6.4.1
- electron-vite 5.0.0
- Electron 41
- Playwright 1.58
- Windows 11

## このディレクトリのファイル

- `e2e/` — デバッグ用E2Eテスト
- `components/` — デバッグ用コンポーネント (MinimalChild.svelte)
- `state/` — 試行した状態管理モジュール
- `docs/` — 外部AIへの相談文書とフィードバック
- `diffs/` — 変更されていた本体ファイルの差分
