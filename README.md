# gimoza

gimoza は、架空世界の地理と歴史を時間軸に沿って視覚化・編纂するデスクトップアプリです。領域、都市、境界線、レイヤー、時間ごとの所属や形状をまとめて管理し、独自の `.gimoza` プロジェクトとして保存できます。

## 主な機能

- 点・線・面の地物作成と編集
- 時間軸に沿った地物プロパティと形状の管理
- レイヤーの追加、表示切替、不透明度調整、フォーカス表示
- 頂点編集、共有頂点、穴・飛び地、分割、結合
- 測量モード、グリッド、経度コンパス、横方向無限スクロール
- `.gimoza` / `.json` の保存と読み込み
- 自動バックアップ、未保存変更の終了確認

## 必要環境

- Node.js 22.12 以上を推奨
- npm
- Windows 配布物を生成する場合は Windows 環境

## セットアップ

```bash
npm install
npm run dev
```

開発中は Electron ウィンドウが起動します。Playwright E2E は renderer の dev server `http://localhost:5173` を利用します。

## 開発コマンド

```bash
npm run check      # Svelte / TypeScript 診断
npm run test       # Vitest
npm run test:e2e   # Playwright E2E
npm run build      # electron-vite build
```

## 配布ビルド

```bash
npm run pack       # インストールせず動作確認できる unpacked build
npm run dist       # 現在のOS向け配布物を生成
npm run dist:win   # Windows x64 の NSIS installer / portable exe を生成
```

Windows ビルドでは `build/icon.ico` をアプリアイコンとして使用し、`.gimoza` ファイルを gimoza プロジェクトとして関連付けます。関連付けされた `.gimoza` を開くと、起動引数または二重起動イベントから渡されたファイルパスを renderer へ通知し、アプリ内でプロジェクトとして読み込みます。

## 保存形式

- `.gimoza`: 標準形式。無圧縮ZIPで、`project.json` と `assets/base-map.svg` を含みます。
- `.json`: 従来互換のJSON形式。地物・頂点・レイヤー・タイムライン設定を保存します。

`.gimoza` はZIPとして展開できますが、通常はアプリから開いてください。

## 関連ドキュメント

- [要件定義書.md](要件定義書.md): 機能要件と仕様
- [技術方針.md](技術方針.md): アーキテクチャと実装方針
- [開発ガイド.md](開発ガイド.md): 開発時のルール、教訓、テスト方針
- [現状.md](現状.md): 未解決課題と残作業
- [実装済み.md](実装済み.md): 実装履歴

## ライセンス

MIT License
