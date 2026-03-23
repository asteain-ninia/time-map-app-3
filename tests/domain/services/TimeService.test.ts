import { describe, it, expect } from 'vitest';
import {
  findAnchorsInRange,
  findPreviousAnchor,
  findNextAnchor,
  getFirstAndLastAnchors,
  validateAnchorTimeline,
  detectTimeGaps,
  sortAnchorsByStartTime,
  getEffectiveEnd,
  timeRangesOverlap,
  getFeatureTimeSpan,
  stepForward,
  stepBackward,
} from '@domain/services/TimeService';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Feature } from '@domain/entities/Feature';

// --- ヘルパー ---

function makeAnchor(
  id: string,
  startYear: number,
  endYear?: number
): FeatureAnchor {
  return new FeatureAnchor(
    id,
    {
      start: new TimePoint(startYear),
      end: endYear !== undefined ? new TimePoint(endYear) : undefined,
    },
    { name: id, description: '' },
    { type: 'Point', vertexId: 'v1' },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
}

// --- テスト ---

describe('TimeService', () => {
  // 連続する3つの錨: [100-200], [200-300], [300-∞]
  const a1 = makeAnchor('a1', 100, 200);
  const a2 = makeAnchor('a2', 200, 300);
  const a3 = makeAnchor('a3', 300);
  const anchors = [a1, a2, a3];

  describe('findAnchorsInRange', () => {
    it('範囲内の錨をすべて返す', () => {
      const result = findAnchorsInRange(anchors, new TimePoint(150), new TimePoint(250));
      expect(result.map(a => a.id)).toEqual(['a1', 'a2']);
    });

    it('範囲がちょうど1つの錨に収まる場合', () => {
      const result = findAnchorsInRange(anchors, new TimePoint(210), new TimePoint(250));
      expect(result.map(a => a.id)).toEqual(['a2']);
    });

    it('終了未定義の錨は範囲と重なる', () => {
      const result = findAnchorsInRange(anchors, new TimePoint(500), new TimePoint(600));
      expect(result.map(a => a.id)).toEqual(['a3']);
    });

    it('範囲外の場合は空配列', () => {
      const result = findAnchorsInRange(anchors, new TimePoint(50), new TimePoint(100));
      expect(result).toHaveLength(0);
    });

    it('全錨を含む広い範囲', () => {
      const result = findAnchorsInRange(anchors, new TimePoint(0), new TimePoint(1000));
      expect(result).toHaveLength(3);
    });
  });

  describe('findPreviousAnchor / findNextAnchor', () => {
    it('前の錨を取得できる', () => {
      expect(findPreviousAnchor(anchors, 'a2')?.id).toBe('a1');
    });

    it('最初の錨には前がない', () => {
      expect(findPreviousAnchor(anchors, 'a1')).toBeUndefined();
    });

    it('次の錨を取得できる', () => {
      expect(findNextAnchor(anchors, 'a1')?.id).toBe('a2');
    });

    it('最後の錨には次がない', () => {
      expect(findNextAnchor(anchors, 'a3')).toBeUndefined();
    });

    it('存在しないIDの場合はundefined', () => {
      expect(findPreviousAnchor(anchors, 'none')).toBeUndefined();
      expect(findNextAnchor(anchors, 'none')).toBeUndefined();
    });
  });

  describe('getFirstAndLastAnchors', () => {
    it('最初と最後の錨を返す', () => {
      const result = getFirstAndLastAnchors(anchors);
      expect(result?.first.id).toBe('a1');
      expect(result?.last.id).toBe('a3');
    });

    it('1つの場合は同じ錨', () => {
      const result = getFirstAndLastAnchors([a2]);
      expect(result?.first.id).toBe('a2');
      expect(result?.last.id).toBe('a2');
    });

    it('空の場合はundefined', () => {
      expect(getFirstAndLastAnchors([])).toBeUndefined();
    });

    it('ソートされていなくても正しく動作する', () => {
      const result = getFirstAndLastAnchors([a3, a1, a2]);
      expect(result?.first.id).toBe('a1');
      expect(result?.last.id).toBe('a3');
    });
  });

  describe('validateAnchorTimeline', () => {
    it('正常な錨リストはエラーなし', () => {
      expect(validateAnchorTimeline(anchors)).toHaveLength(0);
    });

    it('空リストはエラーなし', () => {
      expect(validateAnchorTimeline([])).toHaveLength(0);
    });

    it('start >= end を検出する', () => {
      const bad = makeAnchor('bad', 200, 100);
      const errors = validateAnchorTimeline([bad]);
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('invalid_range');
    });

    it('start == end を検出する', () => {
      const bad = makeAnchor('bad', 200, 200);
      const errors = validateAnchorTimeline([bad]);
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe('invalid_range');
    });

    it('時間範囲の重複を検出する', () => {
      const overlapping = [
        makeAnchor('o1', 100, 250),
        makeAnchor('o2', 200, 300),
      ];
      const errors = validateAnchorTimeline(overlapping);
      expect(errors.some(e => e.type === 'overlap')).toBe(true);
    });

    it('隣接する範囲（境界が一致）は重複ではない', () => {
      const adjacent = [
        makeAnchor('a1', 100, 200),
        makeAnchor('a2', 200, 300),
      ];
      const errors = validateAnchorTimeline(adjacent);
      expect(errors).toHaveLength(0);
    });
  });

  describe('detectTimeGaps', () => {
    it('連続する錨にはギャップなし', () => {
      expect(detectTimeGaps(anchors)).toHaveLength(0);
    });

    it('ギャップを検出する', () => {
      const withGap = [
        makeAnchor('g1', 100, 200),
        makeAnchor('g2', 300, 400),
      ];
      const gaps = detectTimeGaps(withGap);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].start.year).toBe(200);
      expect(gaps[0].end.year).toBe(300);
    });

    it('1つの錨ではギャップなし', () => {
      expect(detectTimeGaps([a1])).toHaveLength(0);
    });

    it('endが未定義の場合はギャップなし', () => {
      const noEnd = [
        makeAnchor('n1', 100),
        makeAnchor('n2', 300, 400),
      ];
      expect(detectTimeGaps(noEnd)).toHaveLength(0);
    });
  });

  describe('sortAnchorsByStartTime', () => {
    it('開始時刻の昇順でソートする', () => {
      const sorted = sortAnchorsByStartTime([a3, a1, a2]);
      expect(sorted.map(a => a.id)).toEqual(['a1', 'a2', 'a3']);
    });

    it('元の配列を変更しない', () => {
      const original = [a3, a1, a2];
      sortAnchorsByStartTime(original);
      expect(original.map(a => a.id)).toEqual(['a3', 'a1', 'a2']);
    });
  });

  describe('getEffectiveEnd', () => {
    it('endが定義されていればそれを返す', () => {
      const end = getEffectiveEnd(a1, anchors);
      expect(end?.year).toBe(200);
    });

    it('endが未定義なら次の錨の開始を返す', () => {
      const withoutEnd = [
        makeAnchor('x1', 100),
        makeAnchor('x2', 200, 300),
      ];
      const end = getEffectiveEnd(withoutEnd[0], withoutEnd);
      expect(end?.year).toBe(200);
    });

    it('最後の錨でendが未定義ならundefined', () => {
      const end = getEffectiveEnd(a3, anchors);
      expect(end).toBeUndefined();
    });
  });

  describe('timeRangesOverlap', () => {
    it('重なる範囲を検出する', () => {
      expect(timeRangesOverlap(
        { start: new TimePoint(100), end: new TimePoint(200) },
        { start: new TimePoint(150), end: new TimePoint(250) }
      )).toBe(true);
    });

    it('隣接する範囲は重ならない', () => {
      expect(timeRangesOverlap(
        { start: new TimePoint(100), end: new TimePoint(200) },
        { start: new TimePoint(200), end: new TimePoint(300) }
      )).toBe(false);
    });

    it('片方にendがない場合は無限と扱う', () => {
      expect(timeRangesOverlap(
        { start: new TimePoint(100) },
        { start: new TimePoint(500), end: new TimePoint(600) }
      )).toBe(true);
    });

    it('両方にendがない場合は重なる', () => {
      expect(timeRangesOverlap(
        { start: new TimePoint(100) },
        { start: new TimePoint(200) }
      )).toBe(true);
    });

    it('完全に離れた範囲は重ならない', () => {
      expect(timeRangesOverlap(
        { start: new TimePoint(100), end: new TimePoint(200) },
        { start: new TimePoint(300), end: new TimePoint(400) }
      )).toBe(false);
    });
  });

  describe('getFeatureTimeSpan', () => {
    it('地物の存在期間を返す', () => {
      const feature = new Feature('f1', 'Point', anchors);
      const span = getFeatureTimeSpan(feature);
      expect(span?.start.year).toBe(100);
      expect(span?.end).toBeUndefined(); // 最後の錨にendなし
    });

    it('endが定義された地物', () => {
      const feature = new Feature('f2', 'Point', [a1, a2]);
      const span = getFeatureTimeSpan(feature);
      expect(span?.start.year).toBe(100);
      expect(span?.end?.year).toBe(300);
    });

    it('錨なしの地物はundefined', () => {
      const feature = new Feature('f3', 'Point', []);
      expect(getFeatureTimeSpan(feature)).toBeUndefined();
    });
  });

  describe('stepForward / stepBackward', () => {
    describe('年ステップ', () => {
      it('1年前進', () => {
        const result = stepForward(new TimePoint(2000), 'year');
        expect(result.year).toBe(2001);
      });

      it('5年前進', () => {
        const result = stepForward(new TimePoint(2000), 'year', 5);
        expect(result.year).toBe(2005);
      });

      it('1年後退', () => {
        const result = stepBackward(new TimePoint(2000), 'year');
        expect(result.year).toBe(1999);
      });

      it('月・日が保持される', () => {
        const result = stepForward(new TimePoint(2000, 6, 15), 'year');
        expect(result.year).toBe(2001);
        expect(result.month).toBe(6);
        expect(result.day).toBe(15);
      });
    });

    describe('月ステップ', () => {
      it('1ヶ月前進', () => {
        const result = stepForward(new TimePoint(2000, 3), 'month');
        expect(result.year).toBe(2000);
        expect(result.month).toBe(4);
      });

      it('年をまたぐ前進', () => {
        const result = stepForward(new TimePoint(2000, 11), 'month', 3);
        expect(result.year).toBe(2001);
        expect(result.month).toBe(2);
      });

      it('1ヶ月後退', () => {
        const result = stepBackward(new TimePoint(2000, 3), 'month');
        expect(result.year).toBe(2000);
        expect(result.month).toBe(2);
      });

      it('年をまたぐ後退', () => {
        const result = stepBackward(new TimePoint(2000, 1), 'month');
        expect(result.year).toBe(1999);
        expect(result.month).toBe(12);
      });

      it('月未指定は1月として扱う', () => {
        const result = stepForward(new TimePoint(2000), 'month', 2);
        expect(result.month).toBe(3);
      });
    });

    describe('日ステップ', () => {
      it('1日前進', () => {
        const result = stepForward(new TimePoint(2000, 1, 15), 'day');
        expect(result.day).toBe(16);
      });

      it('月をまたぐ前進（30日/月）', () => {
        const result = stepForward(new TimePoint(2000, 1, 30), 'day');
        expect(result.month).toBe(2);
        expect(result.day).toBe(1);
      });

      it('1日後退', () => {
        const result = stepBackward(new TimePoint(2000, 1, 15), 'day');
        expect(result.day).toBe(14);
      });
    });
  });
});
