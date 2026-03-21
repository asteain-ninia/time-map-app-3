import { Coordinate } from '../value-objects/Coordinate';

/**
 * 共有頂点グループエンティティ
 * 複数の頂点が同じ座標を共有する関係を管理する。
 */
export class SharedVertexGroup {
  readonly id: string;
  readonly vertexIds: readonly string[];
  readonly representativeCoordinate: Coordinate;

  constructor(
    id: string,
    vertexIds: readonly string[],
    representativeCoordinate: Coordinate
  ) {
    this.id = id;
    this.vertexIds = vertexIds;
    this.representativeCoordinate = representativeCoordinate;
  }

  withVertexIds(vertexIds: readonly string[]): SharedVertexGroup {
    return new SharedVertexGroup(this.id, vertexIds, this.representativeCoordinate);
  }

  withRepresentativeCoordinate(coord: Coordinate): SharedVertexGroup {
    return new SharedVertexGroup(this.id, this.vertexIds, coord);
  }

  /** メンバーが1つ以下になったか（削除対象） */
  shouldBeRemoved(): boolean {
    return this.vertexIds.length <= 1;
  }
}
