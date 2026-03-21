import { Coordinate } from '../value-objects/Coordinate';

/**
 * 頂点エンティティ
 * 地物の形状を定義する点。座標はイミュータブル。
 */
export class Vertex {
  readonly id: string;
  readonly coordinate: Coordinate;

  constructor(id: string, coordinate: Coordinate) {
    this.id = id;
    this.coordinate = coordinate;
  }

  get x(): number {
    return this.coordinate.x;
  }

  get y(): number {
    return this.coordinate.y;
  }

  withCoordinate(coordinate: Coordinate): Vertex {
    return new Vertex(this.id, coordinate);
  }

  equals(other: Vertex): boolean {
    return this.id === other.id;
  }
}
