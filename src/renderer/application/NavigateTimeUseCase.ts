/**
 * 時間移動ユースケース
 *
 * 要件定義書 §5.3.0: NavigateTimeUseCase — 時間移動の処理
 * 要件定義書 §2.2.4.1: 確定時に現在時刻が更新され、
 * すべてのタイムライン関連表示へ即時反映される。
 */

import { TimePoint } from '@domain/value-objects';
import { eventBus } from './EventBus';

/**
 * アプリケーション全体の現在時刻を管理し、
 * 変更時にイベントバスで通知するユースケース。
 */
export class NavigateTimeUseCase {
  private currentTime: TimePoint;

  constructor(initialTime?: TimePoint) {
    this.currentTime = initialTime ?? new TimePoint(1000);
  }

  /** 現在時刻を取得する */
  getCurrentTime(): TimePoint {
    return this.currentTime;
  }

  /** 現在時刻を設定し、変更を通知する */
  navigateTo(time: TimePoint): void {
    if (this.currentTime.equals(time)) return;
    this.currentTime = time;
    eventBus.emit('time:changed', { time: this.currentTime });
  }

  /** 年を指定して移動する（月・日は保持） */
  navigateToYear(year: number): void {
    this.navigateTo(
      new TimePoint(year, this.currentTime.month, this.currentTime.day)
    );
  }

  /** 年をステップ数だけ進める/戻す */
  stepYear(delta: number): void {
    this.navigateToYear(this.currentTime.year + delta);
  }
}
