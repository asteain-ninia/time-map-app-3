/**
 * 時間管理ドメインサービス
 *
 * §5.2: TimeService — 時間管理と履歴処理
 * §2.2: 時間管理機能
 *
 * 錨のライフサイクル管理・時間範囲バリデーション・境界編集支援を提供する。
 * ステートレスなユーティリティ関数群。
 */

import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor, type TimeRange } from '@domain/value-objects/FeatureAnchor';
import type { Feature } from '@domain/entities/Feature';

// ──────────────────────────────────────────
// 錨の検索
// ──────────────────────────────────────────

/**
 * 時間範囲内に有効な錨をすべて取得する
 *
 * §2.2.2: 歴史の錨の定義 — 時間範囲でフィルタ
 *
 * 錨の有効期間と指定範囲が重なるものを返す。
 */
export function findAnchorsInRange(
  anchors: readonly FeatureAnchor[],
  rangeStart: TimePoint,
  rangeEnd: TimePoint
): FeatureAnchor[] {
  return anchors.filter(a => {
    // 錨の開始が範囲終了以降 → 範囲外
    if (a.timeRange.start.isAtOrAfter(rangeEnd)) return false;
    // 錨に終了がありそれが範囲開始以前 → 範囲外
    if (a.timeRange.end && rangeStart.isAtOrAfter(a.timeRange.end)) return false;
    return true;
  });
}

/**
 * 指定錨の直前の錨を取得する
 *
 * §2.2.2: 錨境界編集 — 隣接錨の特定
 */
export function findPreviousAnchor(
  anchors: readonly FeatureAnchor[],
  anchorId: string
): FeatureAnchor | undefined {
  const sorted = sortAnchorsByStartTime(anchors);
  const idx = sorted.findIndex(a => a.id === anchorId);
  return idx > 0 ? sorted[idx - 1] : undefined;
}

/**
 * 指定錨の直後の錨を取得する
 */
export function findNextAnchor(
  anchors: readonly FeatureAnchor[],
  anchorId: string
): FeatureAnchor | undefined {
  const sorted = sortAnchorsByStartTime(anchors);
  const idx = sorted.findIndex(a => a.id === anchorId);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined;
}

/**
 * 地物の最初と最後の錨を取得する
 */
export function getFirstAndLastAnchors(
  anchors: readonly FeatureAnchor[]
): { first: FeatureAnchor; last: FeatureAnchor } | undefined {
  if (anchors.length === 0) return undefined;
  const sorted = sortAnchorsByStartTime(anchors);
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

// ──────────────────────────────────────────
// 時間範囲バリデーション
// ──────────────────────────────────────────

/** バリデーションエラーの種類 */
export interface TimeValidationError {
  readonly type: 'unsorted' | 'overlap' | 'invalid_range' | 'gap';
  readonly anchorId: string;
  readonly message: string;
}

/**
 * 錨リストの時間整合性を検証する
 *
 * §2.2.2: 錨の整合性要件
 * - 開始時刻の昇順であること
 * - 時間範囲が重複しないこと
 * - 各錨の start < end であること（endが定義されている場合）
 */
export function validateAnchorTimeline(
  anchors: readonly FeatureAnchor[]
): TimeValidationError[] {
  if (anchors.length === 0) return [];

  const errors: TimeValidationError[] = [];
  const sorted = [...anchors].sort((a, b) =>
    a.timeRange.start.compareTo(b.timeRange.start)
  );

  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];

    // start < end の検証
    if (anchor.timeRange.end &&
        !anchor.timeRange.start.isBefore(anchor.timeRange.end)) {
      errors.push({
        type: 'invalid_range',
        anchorId: anchor.id,
        message: `錨 "${anchor.id}" の開始時刻が終了時刻以降です`,
      });
    }

    // 昇順チェック（元の並びと比較）
    if (i > 0) {
      const prev = sorted[i - 1];
      if (anchor.timeRange.start.isBefore(prev.timeRange.start)) {
        errors.push({
          type: 'unsorted',
          anchorId: anchor.id,
          message: `錨 "${anchor.id}" が前の錨より前の開始時刻です`,
        });
      }

      // 重複チェック: 前の錨の終了が現在の錨の開始より後
      if (prev.timeRange.end &&
          anchor.timeRange.start.isBefore(prev.timeRange.end)) {
        errors.push({
          type: 'overlap',
          anchorId: anchor.id,
          message: `錨 "${anchor.id}" が前の錨 "${prev.id}" と時間範囲が重複しています`,
        });
      }
    }
  }

  return errors;
}

/**
 * 錨間の時間ギャップ（非存在期間）を検出する
 *
 * §2.2.2: 地物の非存在期間の特定
 */
export function detectTimeGaps(
  anchors: readonly FeatureAnchor[]
): { start: TimePoint; end: TimePoint }[] {
  if (anchors.length <= 1) return [];

  const sorted = sortAnchorsByStartTime(anchors);
  const gaps: { start: TimePoint; end: TimePoint }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.timeRange.end &&
        current.timeRange.end.isBefore(next.timeRange.start)) {
      gaps.push({
        start: current.timeRange.end,
        end: next.timeRange.start,
      });
    }
  }

  return gaps;
}

// ──────────────────────────────────────────
// 錨の境界操作支援
// ──────────────────────────────────────────

/**
 * 錨リストを開始時刻の昇順でソートする
 */
export function sortAnchorsByStartTime(
  anchors: readonly FeatureAnchor[]
): FeatureAnchor[] {
  return [...anchors].sort((a, b) =>
    a.timeRange.start.compareTo(b.timeRange.start)
  );
}

/**
 * 錨の有効期間を計算する（隣接錨を考慮）
 *
 * §2.2.2: 錨の有効期間 — endが未定義の場合は次の錨の開始まで
 *
 * @returns 実効的な終了時刻。最後の錨でendが未定義なら undefined（永続）
 */
export function getEffectiveEnd(
  anchor: FeatureAnchor,
  anchors: readonly FeatureAnchor[]
): TimePoint | undefined {
  if (anchor.timeRange.end) return anchor.timeRange.end;

  const next = findNextAnchor(anchors, anchor.id);
  return next?.timeRange.start;
}

/**
 * 2つの時間範囲が重なるか判定する
 *
 * §2.2.3: 整合性維持プロセス — 時間範囲の重なり検出
 */
export function timeRangesOverlap(
  a: TimeRange,
  b: TimeRange
): boolean {
  // aの開始がbの終了以降 → 重ならない
  if (b.end && a.start.isAtOrAfter(b.end)) return false;
  // bの開始がaの終了以降 → 重ならない
  if (a.end && b.start.isAtOrAfter(a.end)) return false;
  return true;
}

/**
 * 地物全体の存在期間を取得する
 *
 * @returns 最初の錨の開始〜最後の錨の終了。空なら undefined
 */
export function getFeatureTimeSpan(
  feature: Feature
): { start: TimePoint; end: TimePoint | undefined } | undefined {
  const bounds = getFirstAndLastAnchors(feature.anchors);
  if (!bounds) return undefined;
  return {
    start: bounds.first.timeRange.start,
    end: bounds.last.timeRange.end,
  };
}

// ──────────────────────────────────────────
// タイムステップ計算
// ──────────────────────────────────────────

/** ステップの粒度 */
export type TimeGranularity = 'year' | 'month' | 'day';

/**
 * 時間点を指定粒度で前進させる
 *
 * §2.2.4.2: ステップ操作 — 単位選択（年・月・日）
 */
export function stepForward(
  time: TimePoint,
  granularity: TimeGranularity,
  amount: number = 1
): TimePoint {
  switch (granularity) {
    case 'year':
      return new TimePoint(time.year + amount, time.month, time.day);
    case 'month': {
      const month = (time.month ?? 1) + amount;
      const yearOffset = Math.floor((month - 1) / 12);
      const newMonth = ((month - 1) % 12 + 12) % 12 + 1;
      return new TimePoint(time.year + yearOffset, newMonth, time.day);
    }
    case 'day': {
      const day = (time.day ?? 1) + amount;
      // 簡易実装: 30日/月で計算（§4.2.2 グレゴリオ暦は将来拡張）
      const month = time.month ?? 1;
      const totalDays = (month - 1) * 30 + day;
      const newMonth = Math.floor((totalDays - 1) / 30) + 1;
      const newDay = ((totalDays - 1) % 30) + 1;
      if (newMonth > 12) {
        const yearOffset = Math.floor((newMonth - 1) / 12);
        const adjustedMonth = ((newMonth - 1) % 12) + 1;
        return new TimePoint(time.year + yearOffset, adjustedMonth, newDay);
      }
      return new TimePoint(time.year, newMonth, newDay);
    }
  }
}

/**
 * 時間点を指定粒度で後退させる
 */
export function stepBackward(
  time: TimePoint,
  granularity: TimeGranularity,
  amount: number = 1
): TimePoint {
  return stepForward(time, granularity, -amount);
}
