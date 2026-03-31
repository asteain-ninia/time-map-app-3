import { describe, expect, it } from 'vitest';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  applyTimelineStep,
  applyTimelineTick,
  clampTimelineTime,
  hasReachedTimelineMax,
  prepareTimelinePlaybackStart,
  toTimelineDisplayState,
} from '@presentation/components/timelinePanelUtils';

describe('timelinePanelUtils', () => {
  describe('toTimelineDisplayState', () => {
    it('月日未指定の TimePoint を 1月1日で表示用に補完する', () => {
      expect(toTimelineDisplayState(new TimePoint(1000))).toEqual({
        year: 1000,
        month: 1,
        day: 1,
      });
    });
  });

  describe('clampTimelineTime', () => {
    it('範囲外の年を最小値へクランプする', () => {
      const clamped = clampTimelineTime(new TimePoint(-10, 6, 15), 0, 1000);
      expect(clamped.equals(new TimePoint(0, 1, 1))).toBe(true);
    });

    it('範囲外の年を最大値へクランプする', () => {
      const clamped = clampTimelineTime(new TimePoint(2001, 6, 15), 0, 2000);
      expect(clamped.equals(new TimePoint(2000, 12, 31))).toBe(true);
    });
  });

  describe('applyTimelineStep', () => {
    it('月単位ステップで日を保持する', () => {
      const next = applyTimelineStep(new TimePoint(2000, 3, 15), 'month', 1, 0, 3000);
      expect(next.equals(new TimePoint(2000, 4, 15))).toBe(true);
    });

    it('日単位ステップで実際の月末を跨げる', () => {
      const next = applyTimelineStep(new TimePoint(2000, 1, 31), 'day', 1, 0, 3000);
      expect(next.equals(new TimePoint(2000, 2, 1))).toBe(true);
    });
  });

  describe('prepareTimelinePlaybackStart', () => {
    it('再生開始時に月日未指定の時刻を補完する', () => {
      const prepared = prepareTimelinePlaybackStart(new TimePoint(1200), 0, 3000);
      expect(prepared.equals(new TimePoint(1200, 1, 1))).toBe(true);
    });
  });

  describe('applyTimelineTick', () => {
    it('再生ティックはステップ単位ではなく経過日数で進める', () => {
      const next = applyTimelineTick(new TimePoint(1000, 1, 1), 1, 0, 3000);
      expect(next.compareTo(new TimePoint(1000, 2, 1))).toBe(1);
      expect(next.compareTo(new TimePoint(1000, 3, 1))).toBe(-1);
    });

    it('最大年境界でクランプされる', () => {
      const next = applyTimelineTick(new TimePoint(1000, 12, 15), 10, 0, 1000);
      expect(next.equals(new TimePoint(1000, 12, 31))).toBe(true);
      expect(hasReachedTimelineMax(next, 1000)).toBe(true);
    });
  });
});
