import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export interface AnchorTimelineSegment {
  readonly anchorId: string;
  readonly leftPercent: number;
  readonly widthPercent: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function toTimelineScalar(time: TimePoint): number {
  const month = (time.month ?? 1) - 1;
  const day = (time.day ?? 1) - 1;
  return time.year + month / 12 + day / 365;
}

export function sortAnchorsByStart(
  anchors: readonly FeatureAnchor[]
): readonly FeatureAnchor[] {
  return [...anchors].sort((left, right) => left.timeRange.start.compareTo(right.timeRange.start));
}

export function formatAnchorRange(anchor: FeatureAnchor): string {
  return `${anchor.timeRange.start.toString()} — ${anchor.timeRange.end?.toString() ?? '∞'}`;
}

export function buildAnchorTimelineSegments(
  anchors: readonly FeatureAnchor[],
  timelineMin: number,
  timelineMax: number
): readonly AnchorTimelineSegment[] {
  const safeMax = timelineMax > timelineMin ? timelineMax : timelineMin + 1;
  const span = safeMax - timelineMin;

  return anchors.map((anchor) => {
    const start = toTimelineScalar(anchor.timeRange.start);
    const end = anchor.timeRange.end ? toTimelineScalar(anchor.timeRange.end) : safeMax;
    const clampedStart = Math.max(timelineMin, Math.min(start, safeMax));
    const clampedEnd = Math.max(clampedStart, Math.min(end, safeMax));

    return {
      anchorId: anchor.id,
      leftPercent: clampPercent(((clampedStart - timelineMin) / span) * 100),
      widthPercent: Math.max(
        1.5,
        clampPercent(((clampedEnd - clampedStart) / span) * 100)
      ),
    };
  });
}

export function getCurrentTimePercent(
  currentTime: TimePoint,
  timelineMin: number,
  timelineMax: number
): number {
  const safeMax = timelineMax > timelineMin ? timelineMax : timelineMin + 1;
  return clampPercent(
    ((toTimelineScalar(currentTime) - timelineMin) / (safeMax - timelineMin)) * 100
  );
}
