/**
 * タイムラインマーカー エンティティ
 *
 * §4.1: TimelineMarker — タイムライン上のブックマーク的な時刻マーカー
 *
 * ユーザーが重要な時間点に付けるラベル付きマーカー。
 */

import type { TimePoint } from '@domain/value-objects/TimePoint';

export class TimelineMarker {
  readonly id: string;
  readonly time: TimePoint;
  readonly label: string;
  readonly description: string;

  constructor(
    id: string,
    time: TimePoint,
    label: string,
    description: string = ''
  ) {
    this.id = id;
    this.time = time;
    this.label = label;
    this.description = description;
  }

  withTime(time: TimePoint): TimelineMarker {
    return new TimelineMarker(this.id, time, this.label, this.description);
  }

  withLabel(label: string): TimelineMarker {
    return new TimelineMarker(this.id, this.time, label, this.description);
  }

  withDescription(description: string): TimelineMarker {
    return new TimelineMarker(this.id, this.time, this.label, description);
  }

  equals(other: TimelineMarker): boolean {
    return this.id === other.id;
  }
}
