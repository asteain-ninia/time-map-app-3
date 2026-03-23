import { describe, it, expect } from 'vitest';
import { TimelineMarker } from '@domain/entities/TimelineMarker';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('TimelineMarker', () => {
  const time = new TimePoint(2000, 6, 15);
  const marker = new TimelineMarker('m1', time, '建国', '重要な出来事');

  describe('コンストラクタ', () => {
    it('全プロパティを保持する', () => {
      expect(marker.id).toBe('m1');
      expect(marker.time).toBe(time);
      expect(marker.label).toBe('建国');
      expect(marker.description).toBe('重要な出来事');
    });

    it('descriptionはデフォルト空文字', () => {
      const m = new TimelineMarker('m2', time, 'ラベル');
      expect(m.description).toBe('');
    });
  });

  describe('withTime', () => {
    it('時間を変更した新インスタンスを返す', () => {
      const newTime = new TimePoint(2025);
      const updated = marker.withTime(newTime);
      expect(updated.time).toBe(newTime);
      expect(updated.label).toBe('建国');
      expect(updated).not.toBe(marker);
    });
  });

  describe('withLabel', () => {
    it('ラベルを変更した新インスタンスを返す', () => {
      const updated = marker.withLabel('滅亡');
      expect(updated.label).toBe('滅亡');
      expect(updated.time).toBe(time);
    });
  });

  describe('withDescription', () => {
    it('説明を変更した新インスタンスを返す', () => {
      const updated = marker.withDescription('新しい説明');
      expect(updated.description).toBe('新しい説明');
      expect(updated.label).toBe('建国');
    });
  });

  describe('equals', () => {
    it('同じIDなら等価', () => {
      const other = new TimelineMarker('m1', new TimePoint(1900), '別名');
      expect(marker.equals(other)).toBe(true);
    });

    it('異なるIDなら非等価', () => {
      const other = new TimelineMarker('m2', time, '建国');
      expect(marker.equals(other)).toBe(false);
    });
  });
});
