# gimoza

架空世界の地理と歴史を、時間軸に沿って視覚化・編纂するデスクトップアプリです。

## 使い方

```bash
npm install
npm run build
npm run dev
```

開発中は Electron のウィンドウが起動します。地物の追加、編集、測量、レイヤー表示設定、プロジェクト保存と読み込みを利用できます。

## 保存形式

- `.gimoza`: 標準のプロジェクト形式です。実体は無圧縮ZIPで、`project.json` と `assets/base-map.svg` を含みます。
- `.json`: 従来互換のJSON形式です。地物・頂点・レイヤー・タイムライン設定を保存します。

`.gimoza` はZIPとして展開できますが、通常はアプリから開いてください。

## 開発コマンド

```bash
npm run check
npm run test
npm run test:e2e
npm run build
```

## ライセンス

MIT License
