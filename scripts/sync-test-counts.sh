#!/usr/bin/env bash
# sync-test-counts.sh — vitest の実行結果からテスト数を集計し、
# 現状.md と 実装済み.md の記載を自動更新する。
# pre-commit フックから呼び出される。

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# --- ユニットテスト集計（vitest JSON reporter で正確なカウント） ---
vitest_json=$(npx vitest run --reporter=json 2>/dev/null || true)
if [ -n "$vitest_json" ]; then
  unit_total=$(echo "$vitest_json" | grep -o '"numPassedTests":[0-9]*' | grep -o '[0-9]*$' | head -1)
  # numPassedTestSuites は describe ブロック数なのでファイル数には使えない
  # testResults 配列の要素数がファイル数に対応する
  unit_files=$(echo "$vitest_json" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).testResults.length)}catch{console.log('')}})" 2>/dev/null)
  # フォールバック: JSON解析失敗時は grep カウント
  if [ -z "$unit_total" ] || [ -z "$unit_files" ]; then
    unit_total=0
    unit_files=0
    while IFS= read -r f; do
      count=$(grep -cE '^\s+it(\.each)?\(' "$f" 2>/dev/null || true)
      if [ "$count" -gt 0 ]; then
        unit_total=$((unit_total + count))
        unit_files=$((unit_files + 1))
      fi
    done < <(find tests -name '*.test.ts' -type f)
  fi
else
  # vitest 実行失敗時はファイルから概算
  unit_total=0
  unit_files=0
  while IFS= read -r f; do
    count=$(grep -cE '^\s+it(\.each)?\(' "$f" 2>/dev/null || true)
    if [ "$count" -gt 0 ]; then
      unit_total=$((unit_total + count))
      unit_files=$((unit_files + 1))
    fi
  done < <(find tests -name '*.test.ts' -type f)
fi

# --- E2Eテスト集計 ---
e2e_total=0
e2e_files=0
declare -A e2e_counts
for f in e2e/*.spec.ts; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  count=$(grep -cE '^test\(' "$f" 2>/dev/null || true)
  if [ "$count" -gt 0 ]; then
    e2e_total=$((e2e_total + count))
    e2e_files=$((e2e_files + 1))
    e2e_counts["$base"]=$count
  fi
done

changed=0

# --- 現状.md 更新 ---
if [ -f "現状.md" ]; then
  # ユニットテスト総数
  sed -i -E "s/ユニットテスト: [0-9]+件（[0-9]+ファイル/ユニットテスト: ${unit_total}件（${unit_files}ファイル/" "現状.md"
  # E2Eテスト総数
  sed -i -E "s/E2Eテスト: [0-9]+件（[0-9]+合格）/E2Eテスト: ${e2e_total}件（${e2e_total}合格）/" "現状.md"
fi

# --- 実装済み.md 更新 ---
if [ -f "実装済み.md" ]; then
  # 概要の総数
  sed -i -E "s/全[0-9]+ユニットテスト＋[0-9]+ E2Eテスト/全${unit_total}ユニットテスト＋${e2e_total} E2Eテスト/" "実装済み.md"
  # E2Eセクションヘッダ
  sed -i -E "s/^[0-9]+ファイル、[0-9]+テスト。devサーバー/${e2e_files}ファイル、${e2e_total}テスト。devサーバー/" "実装済み.md"
  # E2Eテーブルの各行
  for base in "${!e2e_counts[@]}"; do
    count=${e2e_counts[$base]}
    # | `filename.spec.ts` | N | ... | のパターンを更新
    escaped=$(echo "$base" | sed 's/\./\\./g')
    sed -i -E "s/(\| \`${escaped}\` \| )[0-9]+( \|)/\1${count}\2/" "実装済み.md"
  done
fi

# 変更があったら staging に追加
if ! git diff --quiet "現状.md" 2>/dev/null; then
  git add "現状.md"
  changed=1
fi
if ! git diff --quiet "実装済み.md" 2>/dev/null; then
  git add "実装済み.md"
  changed=1
fi

if [ "$changed" -eq 1 ]; then
  echo "[sync-test-counts] テスト数を自動更新しました"
fi
