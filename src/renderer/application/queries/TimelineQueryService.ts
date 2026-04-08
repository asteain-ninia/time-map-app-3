import type { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import type { TimePoint } from '@domain/value-objects/TimePoint';

/**
 * 時間軸関連の読み取り専用クエリ。
 */
export class TimelineQueryService {
  constructor(private readonly navigateTime: NavigateTimeUseCase) {}

  getCurrentTime(): TimePoint {
    return this.navigateTime.getCurrentTime();
  }
}
