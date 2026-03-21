/**
 * 時間点の値オブジェクト
 * year: 年（必須）、month: 月（1-12、省略可）、day: 日（1-31、省略可）
 */
export class TimePoint {
  readonly year: number;
  readonly month: number | undefined;
  readonly day: number | undefined;

  constructor(year: number, month?: number, day?: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  equals(other: TimePoint): boolean {
    return this.year === other.year
      && this.month === other.month
      && this.day === other.day;
  }

  /**
   * 時間点の比較（-1: this < other, 0: 同一, 1: this > other）
   * 月・日が未指定の場合は年初（1月1日）として扱う
   */
  compareTo(other: TimePoint): number {
    if (this.year !== other.year) return this.year < other.year ? -1 : 1;

    const thisMonth = this.month ?? 1;
    const otherMonth = other.month ?? 1;
    if (thisMonth !== otherMonth) return thisMonth < otherMonth ? -1 : 1;

    const thisDay = this.day ?? 1;
    const otherDay = other.day ?? 1;
    if (thisDay !== otherDay) return thisDay < otherDay ? -1 : 1;

    return 0;
  }

  /** この時間点が他方より前か */
  isBefore(other: TimePoint): boolean {
    return this.compareTo(other) < 0;
  }

  /** この時間点が他方と同じか後か */
  isAtOrAfter(other: TimePoint): boolean {
    return this.compareTo(other) >= 0;
  }

  toString(): string {
    let s = `${this.year}年`;
    if (this.month !== undefined) s += `${this.month}月`;
    if (this.day !== undefined) s += `${this.day}日`;
    return s;
  }
}
