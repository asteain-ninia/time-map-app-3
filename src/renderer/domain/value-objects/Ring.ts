/**
 * ポリゴンリングの値オブジェクト
 * リング種別: territory（領土）または hole（穴）
 */
export type RingType = 'territory' | 'hole';

export class Ring {
  readonly id: string;
  readonly vertexIds: readonly string[];
  readonly ringType: RingType;
  readonly parentId: string | null;

  constructor(
    id: string,
    vertexIds: readonly string[],
    ringType: RingType,
    parentId: string | null
  ) {
    this.id = id;
    this.vertexIds = vertexIds;
    this.ringType = ringType;
    this.parentId = parentId;
  }

  withVertexIds(vertexIds: readonly string[]): Ring {
    return new Ring(this.id, vertexIds, this.ringType, this.parentId);
  }

  withParentId(parentId: string | null): Ring {
    return new Ring(this.id, this.vertexIds, this.ringType, parentId);
  }

  equals(other: Ring): boolean {
    return this.id === other.id;
  }
}
