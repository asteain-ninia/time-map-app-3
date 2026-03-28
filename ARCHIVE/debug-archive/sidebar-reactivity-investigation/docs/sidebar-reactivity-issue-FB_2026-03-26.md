# Sidebarリアクティビティ問題 文書FB

作成日: 2026-03-26
対象リポジトリ: `time-map-app-3`
対象文書: `sidebar-reactivity-issue.md`

---

## 1. 結論

この文書は、観測した症状の量は十分あります。しかし、現行リポジトリに照らすと、結論が早すぎます。

最重要の指摘は次の1点です。

**現時点の実装では、`App.svelte` から `Sidebar.svelte` へ `selectedFeatureId` が渡されていません。**

したがって、まず疑うべきは Svelte 5 のリアクティビティ不具合ではなく、**親子コンポーネント間の配線漏れ**です。

この前提を崩さない限り、

- props が伝搬しない
- `$effect` が動かない
- `class:selected` が更新されない

という観測結果は、かなりの部分が自然に説明できます。

短く言えば、この文書の最大の弱点は、

**framework bug の調査メモとしては詳しいが、現在のコードに対する最初の契約確認が抜けている**

ことです。

---

## 2. 最重要の事実

`App.svelte` 側の `Sidebar` 呼び出しは次のとおりです。

```svelte
<Sidebar
  {currentTime}
  {features}
  {onPropertyChange}
/>
```

つまり、`Sidebar` には

- `selectedFeatureId`
- `onFeatureSelect`

のどちらも渡されていません。

一方で `Sidebar.svelte` 側は、これらが来る前提の設計になっています。

```svelte
let {
  currentTime = undefined as TimePoint | undefined,
  features = [] as readonly Feature[],
  selectedFeatureId = null as string | null,
  onFeatureSelect,
  onPropertyChange,
} = $props();
```

さらに、選択表示は次のローカル state に依存しています。

```svelte
let selectedId = $state<string | null>(null);

$effect(() => {
  console.log('EFFECT_prop_sync:', selectedFeatureId);
  selectedId = selectedFeatureId;
});
```

この状態では、親から `selectedFeatureId` が来なければ `selectedId` は常に `null` 同期になります。

したがって、文書中の

> 初期値は届くが、App側で `selectedFeatureId` を変更してもSidebarに伝搬しない。

という整理は、少なくとも**現行リポジトリそのものの記述としては成立していません**。  
現在のコードでは、そもそも `Sidebar` にその prop が接続されていないからです。

---

## 3. この文書の良い点

この文書にも価値はあります。特に良いのは以下です。

### 3.1 症状の観測範囲が広い

- props
- `$bindable`
- Context
- `.svelte.ts`
- writable store
- 手動 `.subscribe()`

まで試しており、「いくつかの案を試したが同じだった」という観測自体は残っています。

### 3.2 ビルド出力まで見ている

単なる印象論ではなく、コンパイル後の `get()` / `set()` まで確認しようとしている姿勢は良いです。

### 3.3 仮説を言い切りにせず、仮説として置いている

`Vite dev server のモジュール境界問題` や `外部コールバック書き込みコンテキスト問題` を、断定ではなく仮説として整理している点は妥当です。

---

## 4. この文書の主要な問題点

## 4.1 最初に確認すべき「親子契約」が未確認

リアクティビティ不具合を疑う前に、まず確認すべきだったのは次です。

1. 親は本当に prop を渡しているか
2. 子はその prop を本当に受け取っているか
3. 子から親への更新経路は本当に接続されているか

今回の現行実装では、1 と 3 が未接続です。

`Sidebar` 内のクリック処理は次です。

```svelte
onclick={() => { selectedId = f.id; onFeatureSelect?.(f.id); }}
```

しかし `onFeatureSelect` は親から渡っていません。  
そのため、クリックしても親状態は更新されず、`Sidebar` ローカルだけが一時的に変わる設計です。

この時点で、Svelte のバグより先に

- prop 未配線
- callback 未配線
- source of truth の分裂

を疑うべきです。

## 4.2 ローカル state が「原因切り分け」ではなく「症状の隠蔽」になっている

文書では、次が「動くもの」として挙げられています。

```svelte
let selectedId = $state<string | null>(null);
class:selected={selectedId === f.id}
onclick={() => { selectedId = f.id; }}
```

これは確かに動きます。  
ただし、動く理由は「Svelte の reactivity が正常だから」だけではありません。

もっと本質的には、**親コンポーネントとの同期を完全に捨てているから**です。

つまりこの観測から言えるのは、

- `Sidebar` 単体のローカル state 更新は動く

だけです。

ここからすぐに

- 親から子への伝搬だけが壊れている
- runes mode の props が壊れている

とは言えません。

## 4.3 文書の前提コードと現行リポジトリが一致していない

文書には次の記述があります。

```md
// App.svelte
let selectedFeatureId = $state<string | null>(null);
<Sidebar {selectedFeatureId} />
```

しかし現行の `App.svelte` はそうなっていません。

実際には、

```ts
let selectedFeatureId = $derived($selectedFeatureId$);
```

であり、`Sidebar` にその値は渡されていません。

つまり、この文書は

- 以前のリビジョンの観測メモ
- 途中で書き換えられた実装の混在記録
- 現行コードとずれた状態の報告

のいずれかです。

この状態だと、読んだ人は「どの revision の話か」を判別できません。

## 4.4 デバッグテストが「観測ログ収集」で止まっており、契約を固定できていない

`e2e/debug-sidebar-reactivity.spec.ts` などでは多数のログを出していますが、最後は次です。

```ts
expect(true).toBe(true);
```

これでは、

- 選択クラスが付かなかった
- prop が伝搬しなかった
- property panel が更新されなかった

としても、テストは失敗しません。

したがって、これらは「デバッグメモ」としては使えても、「回帰防止資産」にはなっていません。

---

## 5. 実装者へのアドバイス

もし私がこの文書を作成した実装者に返すなら、次のように言います。

## 5.1 まず framework を疑うのを止めて、配線を確認してください

今回の順番は逆です。

やるべき順番は次です。

1. 親が `Sidebar` に何を渡しているか確認する
2. `Sidebar` が何を必須入力としているか確認する
3. 親から子、子から親の両方向が接続されているか確認する
4. それでも壊れるなら初めて Svelte 側を疑う

今の状態で Svelte 5 の既知不具合を追い始めるのは、調査コストに対して精度が低いです。

## 5.2 選択状態の source of truth を1つに固定してください

現在の `Sidebar` は、

- prop の `selectedFeatureId`
- ローカルの `selectedId`

の2つを持っています。

この構成は、デバッグ時に誤認を生みやすいです。

選択状態は UI の一時 state ではなくアプリケーション state なので、原則として owner を1箇所に固定すべきです。

今回なら素直に次です。

- `App` が `selectedFeatureId` を持つ
- `Sidebar` はそれを受けて描画するだけ
- `Sidebar` は選択イベントだけを親へ返す

## 5.3 `Sidebar` の prop を optional にしすぎないでください

今の `Sidebar` は次のように未接続でも動けてしまいます。

```svelte
selectedFeatureId = null as string | null,
onFeatureSelect,
```

これにより、

- prop を渡し忘れてもビルドが通る
- callback を渡し忘れても画面は一応動く
- しかし state 同期だけ壊れる

という、最も検出しにくい壊れ方になります。

`Sidebar` が selection を扱うなら、少なくとも

- `selectedFeatureId`
- `onFeatureSelect`

は必須契約として扱う方が安全です。

## 5.4 デバッグ用 E2E は「失敗する assertion」を持たせてください

たとえば確認すべき契約は次です。

1. 地図クリックで `selectedFeatureId` が変わる
2. その結果、地物一覧の該当行に `selected` class が付く
3. プロパティタブで該当 feature が解決される

この3点を assertion にすれば、今回のような配線漏れはかなり早く検出できます。

ログは補助です。主役は assertion です。

## 5.5 文書には必ず対象 revision を書いてください

今回の文書は、現行 repo と前提コードが一致していません。

最低でも次を入れるべきです。

- 対象 branch
- commit hash
- 観測日時
- 試行した実装パターンが存在した revision

これがないと、後から読む人が

- 現在の話なのか
- 途中実装の話なのか
- 既に消えた検証コードの話なのか

を判断できません。

---

## 6. 推奨する最小修正

まずは大きな調査を続けず、以下の最小修正で事実を揃えるべきです。

```svelte
<Sidebar
  {currentTime}
  {features}
  {selectedFeatureId}
  onFeatureSelect={(id) => selectedFeatureId$.set(id)}
  {onPropertyChange}
/>
```

そのうえで `Sidebar` 側は、ローカル `selectedId` をやめて、まず次のように直接描画すべきです。

```svelte
class:selected={selectedFeatureId === f.id}
onclick={() => onFeatureSelect?.(f.id)}
```

この最小構成でまだ壊れるなら、その時点で初めて

- prop 伝搬
- runes mode
- writable store
- dev server 挙動

を疑えば十分です。

---

## 7. この文書をどう直すべきか

`sidebar-reactivity-issue.md` 自体を活かすなら、次のように書き換えるのがよいです。

### 7.1 タイトルを修正する

現状のタイトルは「Svelte 5 Sidebar リアクティビティ問題」ですが、現時点では断定が強すぎます。

より適切なのは、たとえば次です。

- `Sidebar選択状態の同期不整合 調査メモ`
- `Sidebar選択表示不具合の切り分けメモ`

### 7.2 最初に「現時点で確認できた事実」を置く

最初に置くべきは仮説ではなく、次の事実です。

- `Sidebar` に `selectedFeatureId` が渡っていない
- `Sidebar` に `onFeatureSelect` が渡っていない
- `Sidebar` はローカル state を持っている

### 7.3 仮説は後段に下げる

`Vite dev server` や `Svelte internal runtime` の議論は、配線が正しい状態を再現してからで十分です。

今の文書では、仮説の粒度が事実確認より大きくなっています。

### 7.4 「試行済み一覧」には前提条件を書く

各試行について、

- その時点の `App.svelte`
- `Sidebar.svelte`
- 値の owner
- 単方向か双方向か

を付けておかないと、比較可能な試行記録になりません。

---

## 8. 最終評価

この文書は、切り分けの熱量と観測量はあります。そこは評価できます。

ただし、レビューとしては次の一点が決定的です。

**現行コードに対する一次確認より先に、Svelte 側の問題へ仮説を進めてしまっている。**

そのため、実装者への助言はシンプルです。

- まず親子配線を確認する
- state owner を1つに絞る
- optional prop/callback による「壊れても動く状態」をやめる
- assertion を持つ E2E に置き換える
- revision 情報を文書に残す

この順で整理すれば、この問題はかなり短く収束するはずです。
