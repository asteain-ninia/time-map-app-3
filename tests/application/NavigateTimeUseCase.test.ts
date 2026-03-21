import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { eventBus } from '@application/EventBus';
import { TimePoint } from '@domain/value-objects';

describe('NavigateTimeUseCase', () => {
  let useCase: NavigateTimeUseCase;
  let unsub: () => void;

  afterEach(() => {
    if (unsub) unsub();
    eventBus.clear();
  });

  describe('初期化', () => {
    it('デフォルトで年1000の TimePoint を持つ', () => {
      useCase = new NavigateTimeUseCase();
      const time = useCase.getCurrentTime();
      expect(time.year).toBe(1000);
      expect(time.month).toBeUndefined();
      expect(time.day).toBeUndefined();
    });

    it('初期時刻を指定できる', () => {
      useCase = new NavigateTimeUseCase(new TimePoint(500, 3, 15));
      const time = useCase.getCurrentTime();
      expect(time.year).toBe(500);
      expect(time.month).toBe(3);
      expect(time.day).toBe(15);
    });
  });

  describe('navigateTo', () => {
    beforeEach(() => {
      useCase = new NavigateTimeUseCase();
    });

    it('時刻を変更し time:changed イベントを発行する', () => {
      const listener = vi.fn();
      unsub = eventBus.on('time:changed', listener);

      const target = new TimePoint(2000);
      useCase.navigateTo(target);

      expect(useCase.getCurrentTime().year).toBe(2000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].time.year).toBe(2000);
    });

    it('同じ時刻への移動ではイベントを発行しない', () => {
      const listener = vi.fn();
      unsub = eventBus.on('time:changed', listener);

      useCase.navigateTo(new TimePoint(1000));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('navigateToYear', () => {
    it('年だけを変更し、月・日は保持する', () => {
      useCase = new NavigateTimeUseCase(new TimePoint(1000, 6, 15));
      useCase.navigateToYear(2000);

      const time = useCase.getCurrentTime();
      expect(time.year).toBe(2000);
      expect(time.month).toBe(6);
      expect(time.day).toBe(15);
    });
  });

  describe('stepYear', () => {
    beforeEach(() => {
      useCase = new NavigateTimeUseCase(new TimePoint(1000));
    });

    it('正の値で年を進める', () => {
      useCase.stepYear(1);
      expect(useCase.getCurrentTime().year).toBe(1001);
    });

    it('負の値で年を戻す', () => {
      useCase.stepYear(-1);
      expect(useCase.getCurrentTime().year).toBe(999);
    });

    it('ステップごとにイベントが発行される', () => {
      const listener = vi.fn();
      unsub = eventBus.on('time:changed', listener);

      useCase.stepYear(1);
      useCase.stepYear(1);

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
