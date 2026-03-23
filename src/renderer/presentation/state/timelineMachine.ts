/**
 * タイムライン状態マシン定義
 *
 * 要件定義書 §5.5: 再生・停止・ステップ操作・速度変更の状態遷移
 * 要件定義書 §2.2.4.2: ステップ操作の単位（年/月/日）
 * 要件定義書 §2.2.4.3: 再生制御（100ms間隔タイマー、速度セレクタ）
 *
 * 状態フロー:
 *   stopped ⇄ playing
 *   stopped → stepping → stopped
 *
 * 再生速度: 1倍 = 1年/秒。100msティックごとに日数増分を換算。
 * 速度オプション: 0.1倍 / 0.5倍 / 1倍 / 2倍 / 5倍 / 10倍
 */

import { setup, assign } from 'xstate';
import { TimePoint } from '@domain/value-objects/TimePoint';

// --- 型定義 ---

/** 再生速度の選択肢 */
export type PlaybackSpeed = 0.1 | 0.5 | 1 | 2 | 5 | 10;

/** ステップ操作の単位 */
export type StepUnit = 'year' | 'month' | 'day';

/** 1年あたりの日数（グレゴリオ暦近似） */
const DAYS_PER_YEAR = 365;

/** タイマー間隔（ミリ秒） */
export const TICK_INTERVAL_MS = 100;

/** 利用可能な再生速度一覧 */
export const AVAILABLE_SPEEDS: readonly PlaybackSpeed[] = [0.1, 0.5, 1, 2, 5, 10];

export interface TimelineContext {
  /** 現在時刻 */
  currentTime: TimePoint;
  /** 再生速度 */
  speed: PlaybackSpeed;
  /** ステップ単位 */
  stepUnit: StepUnit;
  /** 時間範囲の最小値 */
  minTime: number;
  /** 時間範囲の最大値 */
  maxTime: number;
}

// --- イベント型定義 ---

export type TimelineEvent =
  | { type: 'PLAY' }
  | { type: 'STOP' }
  | { type: 'STEP_FORWARD' }
  | { type: 'STEP_BACKWARD' }
  | { type: 'SET_SPEED'; speed: PlaybackSpeed }
  | { type: 'SET_STEP_UNIT'; unit: StepUnit }
  | { type: 'SET_TIME'; time: TimePoint }
  | { type: 'SET_RANGE'; min: number; max: number }
  | { type: 'TICK' };

// --- 時間計算ヘルパー ---

/**
 * 月・日が未指定の場合にデフォルト値（1月1日）で補完する
 * §2.2.4.2: 月または日を選択した状態で月・日が未指定のときは既定値で自動補完
 */
export function ensureMonthDay(time: TimePoint): TimePoint {
  const month = time.month ?? 1;
  const day = time.day ?? 1;
  if (month === time.month && day === time.day) return time;
  return new TimePoint(time.year, month, day);
}

/**
 * 指定した月の日数を返す（グレゴリオ暦）
 */
function daysInMonth(year: number, month: number): number {
  const thirtyDays = [4, 6, 9, 11];
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return thirtyDays.includes(month) ? 30 : 31;
}

/**
 * 日数を加算した新しいTimePointを返す（負の値で減算）
 */
export function addDays(time: TimePoint, days: number): TimePoint {
  const t = ensureMonthDay(time);
  let year = t.year;
  let month = t.month!;
  let day = t.day! + days;

  // 日数の正規化（前進方向）
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  // 日数の正規化（後退方向）
  while (day < 1) {
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
    day += daysInMonth(year, month);
  }

  return new TimePoint(year, month, day);
}

/**
 * ステップ操作：指定単位で1ステップ進める/戻す
 */
export function stepTime(time: TimePoint, unit: StepUnit, direction: 1 | -1): TimePoint {
  switch (unit) {
    case 'year':
      return new TimePoint(time.year + direction, time.month, time.day);
    case 'month': {
      const t = ensureMonthDay(time);
      let month = t.month! + direction;
      let year = t.year;
      if (month > 12) { month = 1; year++; }
      if (month < 1) { month = 12; year--; }
      const day = Math.min(t.day!, daysInMonth(year, month));
      return new TimePoint(year, month, day);
    }
    case 'day': {
      const t = ensureMonthDay(time);
      return addDays(t, direction);
    }
  }
}

/**
 * ティックごとの日数増分を計算する
 * §2.2.4.3: 1倍 = 1年/秒、100msティック → 1ティック = speed × DAYS_PER_YEAR / 10
 */
export function tickDaysIncrement(speed: PlaybackSpeed): number {
  return speed * DAYS_PER_YEAR / 10;
}

/**
 * 時間が範囲内かを検証する
 */
function isInRange(time: TimePoint, minTime: number, maxTime: number): boolean {
  const t = ensureMonthDay(time);
  return t.compareTo(new TimePoint(minTime, 1, 1)) >= 0
    && t.compareTo(new TimePoint(maxTime, 12, 31)) <= 0;
}

/**
 * 時間を範囲内にクランプする
 */
function clampTime(time: TimePoint, minTime: number, maxTime: number): TimePoint {
  const t = ensureMonthDay(time);
  const min = new TimePoint(minTime, 1, 1);
  const max = new TimePoint(maxTime, 12, 31);
  if (t.compareTo(min) < 0) return min;
  if (t.compareTo(max) > 0) return max;
  return t;
}

// --- マシン定義 ---

export const timelineMachine = setup({
  types: {
    context: {} as TimelineContext,
    events: {} as TimelineEvent,
  },
  guards: {
    /** 再生が可能か（範囲内にいる） */
    canPlay: ({ context }) => isInRange(context.currentTime, context.minTime, context.maxTime),
    /** 前方にステップ可能か */
    canStepForward: ({ context }) => {
      const next = stepTime(context.currentTime, context.stepUnit, 1);
      return next.compareTo(new TimePoint(context.maxTime, 12, 31)) <= 0;
    },
    /** 後方にステップ可能か */
    canStepBackward: ({ context }) => {
      const next = stepTime(context.currentTime, context.stepUnit, -1);
      return next.compareTo(new TimePoint(context.minTime, 1, 1)) >= 0;
    },
    /** ティック後に範囲外になるか */
    tickReachedBoundary: ({ context }) => {
      const days = tickDaysIncrement(context.speed);
      const next = addDays(context.currentTime, days);
      return next.compareTo(new TimePoint(context.maxTime, 12, 31)) > 0;
    },
  },
  actions: {
    setSpeed: assign({
      speed: ({ event }) => {
        if (event.type === 'SET_SPEED') return event.speed;
        return 1 as PlaybackSpeed;
      },
    }),
    setStepUnit: assign({
      stepUnit: ({ event }) => {
        if (event.type === 'SET_STEP_UNIT') return event.unit;
        return 'year' as StepUnit;
      },
    }),
    setTime: assign({
      currentTime: ({ event, context }) => {
        if (event.type === 'SET_TIME') {
          return clampTime(event.time, context.minTime, context.maxTime);
        }
        return context.currentTime;
      },
    }),
    setRange: assign({
      minTime: ({ event }) => (event.type === 'SET_RANGE' ? event.min : 0),
      maxTime: ({ event }) => (event.type === 'SET_RANGE' ? event.max : 10000),
    }),
    stepForward: assign({
      currentTime: ({ context }) =>
        clampTime(
          stepTime(context.currentTime, context.stepUnit, 1),
          context.minTime, context.maxTime
        ),
    }),
    stepBackward: assign({
      currentTime: ({ context }) =>
        clampTime(
          stepTime(context.currentTime, context.stepUnit, -1),
          context.minTime, context.maxTime
        ),
    }),
    /** 再生開始時に月・日を補完する */
    ensurePlaybackTime: assign({
      currentTime: ({ context }) => ensureMonthDay(context.currentTime),
    }),
    /** ティックで時間を進める */
    applyTick: assign({
      currentTime: ({ context }) => {
        const days = tickDaysIncrement(context.speed);
        const next = addDays(context.currentTime, days);
        return clampTime(next, context.minTime, context.maxTime);
      },
    }),
    /** 境界到達時：時間をクランプして停止準備 */
    clampToBoundary: assign({
      currentTime: ({ context }) =>
        clampTime(context.currentTime, context.minTime, context.maxTime),
    }),
  },
}).createMachine({
  id: 'timeline',
  initial: 'stopped',
  context: {
    currentTime: new TimePoint(1000),
    speed: 1 as PlaybackSpeed,
    stepUnit: 'year' as StepUnit,
    minTime: 0,
    maxTime: 10000,
  },
  states: {
    // --- 停止状態 ---
    stopped: {
      on: {
        PLAY: {
          target: 'playing',
          guard: 'canPlay',
          actions: 'ensurePlaybackTime',
        },
        STEP_FORWARD: {
          guard: 'canStepForward',
          actions: 'stepForward',
        },
        STEP_BACKWARD: {
          guard: 'canStepBackward',
          actions: 'stepBackward',
        },
        SET_TIME: {
          actions: 'setTime',
        },
        SET_SPEED: {
          actions: 'setSpeed',
        },
        SET_STEP_UNIT: {
          actions: 'setStepUnit',
        },
        SET_RANGE: {
          actions: 'setRange',
        },
      },
    },

    // --- 再生状態 ---
    playing: {
      on: {
        STOP: 'stopped',
        TICK: [
          {
            target: 'stopped',
            guard: 'tickReachedBoundary',
            actions: 'clampToBoundary',
          },
          {
            actions: 'applyTick',
          },
        ],
        SET_SPEED: {
          actions: 'setSpeed',
        },
        SET_TIME: {
          actions: 'setTime',
        },
        SET_RANGE: {
          actions: 'setRange',
        },
      },
    },
  },
});
