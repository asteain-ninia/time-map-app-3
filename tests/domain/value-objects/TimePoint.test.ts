import { describe, it, expect } from 'vitest';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('TimePoint', () => {
  describe('constructor', () => {
    it('年のみで生成できる', () => {
      const tp = new TimePoint(1000);
      expect(tp.year).toBe(1000);
      expect(tp.month).toBeUndefined();
      expect(tp.day).toBeUndefined();
    });

    it('年月日で生成できる', () => {
      const tp = new TimePoint(2000, 6, 15);
      expect(tp.year).toBe(2000);
      expect(tp.month).toBe(6);
      expect(tp.day).toBe(15);
    });
  });

  describe('equals', () => {
    it('年月日がすべて一致すれば true', () => {
      expect(new TimePoint(1000, 3, 5).equals(new TimePoint(1000, 3, 5))).toBe(true);
    });

    it('月が未指定同士でも true', () => {
      expect(new TimePoint(1000).equals(new TimePoint(1000))).toBe(true);
    });

    it('年が異なれば false', () => {
      expect(new TimePoint(1000).equals(new TimePoint(1001))).toBe(false);
    });

    it('月の有無が異なれば false', () => {
      expect(new TimePoint(1000, 3).equals(new TimePoint(1000))).toBe(false);
    });
  });

  describe('compareTo', () => {
    it('年が小さいほうが前（-1）', () => {
      expect(new TimePoint(999).compareTo(new TimePoint(1000))).toBe(-1);
    });

    it('年が大きいほうが後（1）', () => {
      expect(new TimePoint(1001).compareTo(new TimePoint(1000))).toBe(1);
    });

    it('年が同じなら月で比較する', () => {
      expect(new TimePoint(1000, 3).compareTo(new TimePoint(1000, 6))).toBe(-1);
    });

    it('月が同じなら日で比較する', () => {
      expect(new TimePoint(1000, 3, 10).compareTo(new TimePoint(1000, 3, 20))).toBe(-1);
    });

    it('年月日が同じなら 0', () => {
      expect(new TimePoint(1000, 3, 5).compareTo(new TimePoint(1000, 3, 5))).toBe(0);
    });

    it('月が未指定の場合は1月として扱う', () => {
      expect(new TimePoint(1000).compareTo(new TimePoint(1000, 1))).toBe(0);
    });

    it('日が未指定の場合は1日として扱う', () => {
      expect(new TimePoint(1000, 3).compareTo(new TimePoint(1000, 3, 1))).toBe(0);
    });
  });

  describe('isBefore', () => {
    it('前の時間点なら true', () => {
      expect(new TimePoint(999).isBefore(new TimePoint(1000))).toBe(true);
    });

    it('同じ時間点なら false', () => {
      expect(new TimePoint(1000).isBefore(new TimePoint(1000))).toBe(false);
    });

    it('後の時間点なら false', () => {
      expect(new TimePoint(1001).isBefore(new TimePoint(1000))).toBe(false);
    });
  });

  describe('isAtOrAfter', () => {
    it('後の時間点なら true', () => {
      expect(new TimePoint(1001).isAtOrAfter(new TimePoint(1000))).toBe(true);
    });

    it('同じ時間点なら true', () => {
      expect(new TimePoint(1000).isAtOrAfter(new TimePoint(1000))).toBe(true);
    });

    it('前の時間点なら false', () => {
      expect(new TimePoint(999).isAtOrAfter(new TimePoint(1000))).toBe(false);
    });
  });

  describe('toString', () => {
    it('年のみ', () => {
      expect(new TimePoint(1000).toString()).toBe('1000年');
    });

    it('年月', () => {
      expect(new TimePoint(1000, 6).toString()).toBe('1000年6月');
    });

    it('年月日', () => {
      expect(new TimePoint(1000, 6, 15).toString()).toBe('1000年6月15日');
    });
  });
});
