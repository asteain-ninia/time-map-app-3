import { describe, it, expect } from 'vitest';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import {
  buildAnchorTimelineSegments,
  formatAnchorRange,
  getCurrentTimePercent,
  sortAnchorsByStart,
  toTimelineScalar,
} from '@presentation/components/propertyPanelHistoryUtils';

function makeAnchor(
  id: string,
  startYear: number,
  endYear?: number
): FeatureAnchor {
  return new FeatureAnchor(
    id,
    {
      start: new TimePoint(startYear),
      end: endYear === undefined ? undefined : new TimePoint(endYear),
    },
    { name: id, description: '' },
    { type: 'Polygon', rings: [new Ring(`${id}-ring`, ['v1', 'v2', 'v3'], 'territory', null)] },
    { layerId: 'l1', parentId: null, childIds: [] }
  );
}

describe('propertyPanelHistoryUtils', () => {
  it('TimePointを単調増加するスカラーへ変換する', () => {
    expect(toTimelineScalar(new TimePoint(100, 6, 15))).toBeGreaterThan(
      toTimelineScalar(new TimePoint(100, 1, 1))
    );
  });

  it('アンカーを開始時刻順に並べる', () => {
    const anchors = [makeAnchor('late', 300), makeAnchor('early', 100), makeAnchor('mid', 200)];
    expect(sortAnchorsByStart(anchors).map((anchor) => anchor.id)).toEqual(['early', 'mid', 'late']);
  });

  it('アンカーの時間バー位置を計算する', () => {
    const segments = buildAnchorTimelineSegments(
      [makeAnchor('a1', 100, 200), makeAnchor('a2', 250)],
      0,
      500
    );

    expect(segments[0].leftPercent).toBeCloseTo(20);
    expect(segments[0].widthPercent).toBeCloseTo(20);
    expect(segments[1].leftPercent).toBeCloseTo(50);
    expect(segments[1].widthPercent).toBeCloseTo(50);
  });

  it('現在時刻の位置をパーセントで返す', () => {
    expect(getCurrentTimePercent(new TimePoint(250), 0, 500)).toBeCloseTo(50);
  });

  it('アンカー範囲を表示文字列へ整形する', () => {
    expect(formatAnchorRange(makeAnchor('a1', 100, 200))).toBe('100年 — 200年');
    expect(formatAnchorRange(makeAnchor('a2', 300))).toBe('300年 — ∞');
  });
});
