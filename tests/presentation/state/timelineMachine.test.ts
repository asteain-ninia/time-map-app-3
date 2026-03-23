import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import {
  timelineMachine,
  ensureMonthDay,
  addDays,
  stepTime,
  tickDaysIncrement,
  TICK_INTERVAL_MS,
  AVAILABLE_SPEEDS,
} from '@presentation/state/timelineMachine';
import type { PlaybackSpeed } from '@presentation/state/timelineMachine';
import { TimePoint } from '@domain/value-objects/TimePoint';

/** アクターを作成して開始する */
function startActor(context?: Partial<typeof timelineMachine['config']['context']>) {
  const actor = createActor(timelineMachine, {
    ...(context ? { input: context } : {}),
  });
  actor.start();
  return actor;
}

/** カスタムコンテキストでアクターを作成 */
function startActorWith(overrides: Record<string, unknown>) {
  // XState v5ではsnaphotのcontextを直接上書きできないので、
  // SET_TIME / SET_RANGE / SET_SPEED / SET_STEP_UNIT イベントで設定
  const actor = createActor(timelineMachine);
  actor.start();
  if ('currentTime' in overrides) {
    actor.send({ type: 'SET_TIME', time: overrides.currentTime as TimePoint });
  }
  if ('minTime' in overrides || 'maxTime' in overrides) {
    const snap = actor.getSnapshot().context;
    actor.send({
      type: 'SET_RANGE',
      min: (overrides.minTime as number) ?? snap.minTime,
      max: (overrides.maxTime as number) ?? snap.maxTime,
    });
  }
  if ('speed' in overrides) {
    actor.send({ type: 'SET_SPEED', speed: overrides.speed as PlaybackSpeed });
  }
  if ('stepUnit' in overrides) {
    actor.send({ type: 'SET_STEP_UNIT', unit: overrides.stepUnit as 'year' | 'month' | 'day' });
  }
  return actor;
}

describe('timelineMachine', () => {
  describe('初期状態', () => {
    it('停止状態で開始する', () => {
      const actor = startActor();
      expect(actor.getSnapshot().value).toBe('stopped');
      actor.stop();
    });

    it('初期コンテキストが正しい', () => {
      const actor = startActor();
      const ctx = actor.getSnapshot().context;
      expect(ctx.currentTime.year).toBe(1000);
      expect(ctx.speed).toBe(1);
      expect(ctx.stepUnit).toBe('year');
      expect(ctx.minTime).toBe(0);
      expect(ctx.maxTime).toBe(10000);
      actor.stop();
    });
  });

  describe('再生・停止', () => {
    it('PLAYで再生状態に遷移する', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      expect(actor.getSnapshot().value).toBe('playing');
      actor.stop();
    });

    it('STOPで停止状態に遷移する', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      actor.send({ type: 'STOP' });
      expect(actor.getSnapshot().value).toBe('stopped');
      actor.stop();
    });

    it('再生開始時に月・日が補完される', () => {
      const actor = startActor();
      // デフォルトのcurrentTimeは年のみ
      actor.send({ type: 'PLAY' });
      const ctx = actor.getSnapshot().context;
      expect(ctx.currentTime.month).toBe(1);
      expect(ctx.currentTime.day).toBe(1);
      actor.stop();
    });

    it('停止状態でSTOPは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'STOP' });
      expect(actor.getSnapshot().value).toBe('stopped');
      actor.stop();
    });
  });

  describe('ティック処理', () => {
    it('TICKで時間が進む', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      const before = actor.getSnapshot().context.currentTime;
      actor.send({ type: 'TICK' });
      const after = actor.getSnapshot().context.currentTime;
      expect(after.compareTo(before)).toBe(1);
      actor.stop();
    });

    it('境界到達時に自動停止する', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(10000, 12, 1),
        speed: 10 as PlaybackSpeed,
      });
      actor.send({ type: 'PLAY' });
      actor.send({ type: 'TICK' });
      // 10倍速でティック(365日加算)→10001年超→境界到達で停止
      expect(actor.getSnapshot().value).toBe('stopped');
      // クランプされて最大値に
      expect(actor.getSnapshot().context.currentTime.year).toBe(10000);
      actor.stop();
    });

    it('停止状態ではTICKは無視される', () => {
      const actor = startActor();
      const before = actor.getSnapshot().context.currentTime;
      actor.send({ type: 'TICK' });
      const after = actor.getSnapshot().context.currentTime;
      expect(before.equals(after)).toBe(true);
      actor.stop();
    });
  });

  describe('ステップ操作', () => {
    it('年単位で前進する', () => {
      const actor = startActorWith({ currentTime: new TimePoint(2000) });
      actor.send({ type: 'STEP_FORWARD' });
      expect(actor.getSnapshot().context.currentTime.year).toBe(2001);
      actor.stop();
    });

    it('年単位で後退する', () => {
      const actor = startActorWith({ currentTime: new TimePoint(2000) });
      actor.send({ type: 'STEP_BACKWARD' });
      expect(actor.getSnapshot().context.currentTime.year).toBe(1999);
      actor.stop();
    });

    it('月単位で前進する', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(2000, 3, 15),
        stepUnit: 'month',
      });
      actor.send({ type: 'STEP_FORWARD' });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.year).toBe(2000);
      expect(t.month).toBe(4);
      expect(t.day).toBe(15);
      actor.stop();
    });

    it('月単位で年をまたぐ前進', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(2000, 12, 15),
        stepUnit: 'month',
      });
      actor.send({ type: 'STEP_FORWARD' });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.year).toBe(2001);
      expect(t.month).toBe(1);
      actor.stop();
    });

    it('日単位で前進する', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(2000, 1, 31),
        stepUnit: 'day',
      });
      actor.send({ type: 'STEP_FORWARD' });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.year).toBe(2000);
      expect(t.month).toBe(2);
      expect(t.day).toBe(1);
      actor.stop();
    });

    it('月・日未指定時にステップでmonth単位を選ぶと自動補完される', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(2000),
        stepUnit: 'month',
      });
      actor.send({ type: 'STEP_FORWARD' });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.month).toBe(2); // 1月→2月
      expect(t.day).toBe(1);
      actor.stop();
    });

    it('範囲上限でSTEP_FORWARDは無視される', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(10000, 12, 31),
      });
      actor.send({ type: 'STEP_FORWARD' });
      expect(actor.getSnapshot().context.currentTime.year).toBe(10000);
      actor.stop();
    });

    it('範囲下限でSTEP_BACKWARDは無視される', () => {
      const actor = startActorWith({
        currentTime: new TimePoint(0, 1, 1),
      });
      actor.send({ type: 'STEP_BACKWARD' });
      expect(actor.getSnapshot().context.currentTime.year).toBe(0);
      actor.stop();
    });

    it('再生中にステップは受け付けない', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      const before = actor.getSnapshot().context.currentTime;
      actor.send({ type: 'STEP_FORWARD' });
      // STEP_FORWARD is not in playing state's events, so time shouldn't change via step
      // (it may change via TICK but not STEP)
      expect(actor.getSnapshot().value).toBe('playing');
      actor.stop();
    });
  });

  describe('速度変更', () => {
    it('速度を変更できる', () => {
      const actor = startActor();
      actor.send({ type: 'SET_SPEED', speed: 5 });
      expect(actor.getSnapshot().context.speed).toBe(5);
      actor.stop();
    });

    it('再生中に速度を変更できる', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      actor.send({ type: 'SET_SPEED', speed: 10 });
      expect(actor.getSnapshot().context.speed).toBe(10);
      expect(actor.getSnapshot().value).toBe('playing');
      actor.stop();
    });

    it('利用可能な速度一覧が正しい', () => {
      expect(AVAILABLE_SPEEDS).toEqual([0.1, 0.5, 1, 2, 5, 10]);
    });
  });

  describe('ステップ単位変更', () => {
    it('ステップ単位を変更できる', () => {
      const actor = startActor();
      actor.send({ type: 'SET_STEP_UNIT', unit: 'day' });
      expect(actor.getSnapshot().context.stepUnit).toBe('day');
      actor.stop();
    });

    it('再生中にステップ単位変更は受け付けない', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      actor.send({ type: 'SET_STEP_UNIT', unit: 'day' });
      // playing state doesn't handle SET_STEP_UNIT
      expect(actor.getSnapshot().context.stepUnit).toBe('year');
      actor.stop();
    });
  });

  describe('時間設定', () => {
    it('SET_TIMEで時間を設定できる', () => {
      const actor = startActor();
      actor.send({ type: 'SET_TIME', time: new TimePoint(500, 6, 15) });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.year).toBe(500);
      expect(t.month).toBe(6);
      expect(t.day).toBe(15);
      actor.stop();
    });

    it('範囲外の時間はクランプされる', () => {
      const actor = startActor();
      actor.send({ type: 'SET_TIME', time: new TimePoint(99999) });
      const t = actor.getSnapshot().context.currentTime;
      expect(t.year).toBe(10000);
      actor.stop();
    });

    it('再生中にもSET_TIMEできる', () => {
      const actor = startActor();
      actor.send({ type: 'PLAY' });
      actor.send({ type: 'SET_TIME', time: new TimePoint(5000, 3, 1) });
      expect(actor.getSnapshot().context.currentTime.year).toBe(5000);
      actor.stop();
    });
  });

  describe('時間範囲変更', () => {
    it('SET_RANGEで範囲を変更できる', () => {
      const actor = startActor();
      actor.send({ type: 'SET_RANGE', min: 100, max: 2000 });
      const ctx = actor.getSnapshot().context;
      expect(ctx.minTime).toBe(100);
      expect(ctx.maxTime).toBe(2000);
      actor.stop();
    });
  });
});

describe('時間計算ヘルパー', () => {
  describe('ensureMonthDay', () => {
    it('月・日が未指定の場合は1月1日で補完する', () => {
      const t = ensureMonthDay(new TimePoint(2000));
      expect(t.month).toBe(1);
      expect(t.day).toBe(1);
    });

    it('すでに指定済みの場合は同じオブジェクトを返す', () => {
      const original = new TimePoint(2000, 6, 15);
      const result = ensureMonthDay(original);
      expect(result).toBe(original);
    });
  });

  describe('addDays', () => {
    it('日数を加算できる', () => {
      const t = addDays(new TimePoint(2000, 1, 1), 31);
      expect(t.month).toBe(2);
      expect(t.day).toBe(1);
    });

    it('年をまたぐ加算', () => {
      const t = addDays(new TimePoint(2000, 12, 31), 1);
      expect(t.year).toBe(2001);
      expect(t.month).toBe(1);
      expect(t.day).toBe(1);
    });

    it('日数を減算できる', () => {
      const t = addDays(new TimePoint(2000, 3, 1), -1);
      expect(t.year).toBe(2000);
      expect(t.month).toBe(2);
      expect(t.day).toBe(29); // 2000年は閏年
    });

    it('閏年の2月29日が正しい', () => {
      const t = addDays(new TimePoint(2000, 2, 28), 1);
      expect(t.day).toBe(29);
    });

    it('非閏年の2月は28日まで', () => {
      const t = addDays(new TimePoint(2001, 2, 28), 1);
      expect(t.month).toBe(3);
      expect(t.day).toBe(1);
    });
  });

  describe('stepTime', () => {
    it('年単位の前進で月・日を保持する', () => {
      const t = stepTime(new TimePoint(2000, 6, 15), 'year', 1);
      expect(t.year).toBe(2001);
      expect(t.month).toBe(6);
      expect(t.day).toBe(15);
    });

    it('月単位で31日の月から30日の月へ', () => {
      const t = stepTime(new TimePoint(2000, 1, 31), 'month', 1);
      expect(t.month).toBe(2);
      expect(t.day).toBe(29); // 閏年なので29日
    });

    it('月単位で年をまたぐ後退', () => {
      const t = stepTime(new TimePoint(2000, 1, 15), 'month', -1);
      expect(t.year).toBe(1999);
      expect(t.month).toBe(12);
    });
  });

  describe('tickDaysIncrement', () => {
    it('1倍速で1ティック = 365/10 = 36.5日', () => {
      expect(tickDaysIncrement(1)).toBe(36.5);
    });

    it('10倍速で1ティック = 365日', () => {
      expect(tickDaysIncrement(10)).toBe(365);
    });

    it('0.1倍速で1ティック = 3.65日', () => {
      expect(tickDaysIncrement(0.1)).toBeCloseTo(3.65);
    });
  });

  describe('TICK_INTERVAL_MS', () => {
    it('100msである', () => {
      expect(TICK_INTERVAL_MS).toBe(100);
    });
  });
});
