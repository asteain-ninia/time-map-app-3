/**
 * 座標値オブジェクト
 * x = 経度（-180.0 〜 180.0）、y = 緯度（-90.0 〜 90.0）
 */
export class Coordinate {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  equals(other: Coordinate): boolean {
    return this.x === other.x && this.y === other.y;
  }

  /** 経度を正規化値域（-180〜180）に収める */
  normalize(): Coordinate {
    let nx = this.x;
    while (nx > 180) nx -= 360;
    while (nx < -180) nx += 360;
    const ny = Math.max(-90, Math.min(90, this.y));
    return new Coordinate(nx, ny);
  }
}
