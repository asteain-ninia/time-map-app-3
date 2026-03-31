import { TimePoint } from '@domain/value-objects/TimePoint';
import type { PlaybackSpeed, StepUnit } from '@presentation/state/timelineMachine';
import {
  addDays,
  ensureMonthDay,
  stepTime,
  tickDaysIncrement,
} from '@presentation/state/timelineMachine';

export interface TimelineDisplayState {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function createTimelineTime(year: number, month: number, day: number): TimePoint {
  return new TimePoint(year, month, day);
}

export function toTimelineDisplayState(time: TimePoint): TimelineDisplayState {
  return {
    year: time.year,
    month: time.month ?? 1,
    day: time.day ?? 1,
  };
}

export function clampTimelineTime(
  time: TimePoint,
  minYear: number,
  maxYear: number
): TimePoint {
  const minTime = new TimePoint(minYear, 1, 1);
  const maxTime = new TimePoint(maxYear, 12, 31);

  if (time.compareTo(minTime) < 0) {
    return minTime;
  }
  if (time.compareTo(maxTime) > 0) {
    return maxTime;
  }
  return time;
}

export function applyTimelineStep(
  currentTime: TimePoint,
  stepUnit: StepUnit,
  direction: 1 | -1,
  minYear: number,
  maxYear: number
): TimePoint {
  return clampTimelineTime(
    stepTime(currentTime, stepUnit, direction),
    minYear,
    maxYear
  );
}

export function prepareTimelinePlaybackStart(
  currentTime: TimePoint,
  minYear: number,
  maxYear: number
): TimePoint {
  return clampTimelineTime(ensureMonthDay(currentTime), minYear, maxYear);
}

export function applyTimelineTick(
  currentTime: TimePoint,
  speed: PlaybackSpeed,
  minYear: number,
  maxYear: number
): TimePoint {
  return clampTimelineTime(
    addDays(currentTime, tickDaysIncrement(speed)),
    minYear,
    maxYear
  );
}

export function hasReachedTimelineMax(time: TimePoint, maxYear: number): boolean {
  return time.compareTo(new TimePoint(maxYear, 12, 31)) >= 0;
}
