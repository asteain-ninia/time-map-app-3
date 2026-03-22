/**
 * 共有頂点ドメインサービス
 *
 * §2.1: 面情報の排他性 — 共有頂点システム
 *
 * 複数の面情報・線情報が同じ頂点を持つことで境界を連動させる。
 * - スクリーン座標ベースの近接判定（デフォルト50px）
 * - SharedVertexGroup による頂点のグループ管理
 * - 共有頂点の連動移動
 * - 共有解除と自動共有化抑制
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';

/** スナップ候補 */
export interface SnapCandidate {
  readonly vertexId: string;
  readonly distance: number;
  readonly coordinate: Coordinate;
}

/** マージ結果 */
export interface MergeResult {
  /** 新規作成または更新されたグループ */
  readonly updatedGroups: readonly SharedVertexGroup[];
  /** 削除すべきグループID（グループ統合時） */
  readonly removedGroupIds: readonly string[];
  /** スナップ先の代表座標 */
  readonly snapCoordinate: Coordinate;
}

/** アンマージ結果 */
export interface UnmergeResult {
  /** 更新後のグループ（削除すべき場合は null） */
  readonly updatedGroup: SharedVertexGroup | null;
  /** 影響を受けたグループID */
  readonly groupId: string;
}

/**
 * スクリーンピクセルのスナップ距離をワールド座標距離に変換する
 *
 * §2.1: スナップ距離の仕様 — スクリーン座標（絶対座標ではない）
 * viewBox幅 = 360 / zoom なので、1ピクセル = (360 / zoom) / viewWidthPx ワールド単位
 *
 * @param snapDistancePx スナップ距離（ピクセル）
 * @param viewWidthPx 表示領域の幅（ピクセル）
 * @param zoom 現在のズーム倍率
 */
export function screenToWorldSnapDistance(
  snapDistancePx: number,
  viewWidthPx: number,
  zoom: number
): number {
  if (viewWidthPx <= 0 || zoom <= 0) return 0;
  return snapDistancePx * (360 / zoom) / viewWidthPx;
}

/**
 * 指定座標の近傍にある頂点（スナップ候補）を検索する
 *
 * §2.1: 近接判定True → スナップ
 *
 * @param targetX 対象X座標（地理座標）
 * @param targetY 対象Y座標（地理座標）
 * @param vertices 全頂点マップ
 * @param excludeIds 検索から除外する頂点ID群
 * @param snapDistanceWorld ワールド座標でのスナップ距離
 * @returns スナップ候補（距離昇順）
 */
export function findSnapCandidates(
  targetX: number,
  targetY: number,
  vertices: ReadonlyMap<string, Vertex>,
  excludeIds: ReadonlySet<string>,
  snapDistanceWorld: number
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const snapDistSq = snapDistanceWorld * snapDistanceWorld;

  for (const [id, vertex] of vertices) {
    if (excludeIds.has(id)) continue;

    const dx = vertex.x - targetX;
    const dy = vertex.y - targetY;
    const distSq = dx * dx + dy * dy;

    if (distSq <= snapDistSq) {
      candidates.push({
        vertexId: id,
        distance: Math.sqrt(distSq),
        coordinate: vertex.coordinate,
      });
    }
  }

  // 距離昇順でソート
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates;
}

/**
 * 指定した頂点が属する SharedVertexGroup を検索する
 *
 * @param vertexId 検索対象の頂点ID
 * @param groups 全グループマップ
 * @returns 見つかったグループ、またはundefined
 */
export function findGroupForVertex(
  vertexId: string,
  groups: ReadonlyMap<string, SharedVertexGroup>
): SharedVertexGroup | undefined {
  for (const group of groups.values()) {
    if (group.vertexIds.includes(vertexId)) {
      return group;
    }
  }
  return undefined;
}

/**
 * 指定した頂点と共有関係にある全頂点IDを取得する
 *
 * @param vertexId 対象の頂点ID
 * @param groups 全グループマップ
 * @returns 共有関係にある頂点ID群（自分自身を含む）。共有関係がなければ空配列
 */
export function getLinkedVertexIds(
  vertexId: string,
  groups: ReadonlyMap<string, SharedVertexGroup>
): string[] {
  const group = findGroupForVertex(vertexId, groups);
  if (!group) return [];
  return [...group.vertexIds];
}

/**
 * 2つの頂点を共有頂点としてマージする
 *
 * §2.1: 共有化確定時の挙動 — ドラッグしていない側の頂点座標を保持
 *
 * ケース:
 * 1. どちらもグループに属さない → 新規グループ作成
 * 2. 片方がグループに属する → そのグループに追加
 * 3. 両方が別グループに属する → グループを統合
 * 4. 同じグループに属する → 何もしない（既に共有済み）
 *
 * @param draggedVertexId ドラッグ中の頂点ID
 * @param targetVertexId スナップ先の頂点ID
 * @param targetCoordinate スナップ先の座標（ドラッグしていない側を保持）
 * @param groups 現在の全グループマップ
 * @param newGroupId 新規グループ作成時に使用するID
 * @returns マージ結果
 */
export function mergeVertices(
  draggedVertexId: string,
  targetVertexId: string,
  targetCoordinate: Coordinate,
  groups: ReadonlyMap<string, SharedVertexGroup>,
  newGroupId: string
): MergeResult {
  const groupA = findGroupForVertex(draggedVertexId, groups);
  const groupB = findGroupForVertex(targetVertexId, groups);

  // Case 4: 同じグループに既に属している
  if (groupA && groupB && groupA.id === groupB.id) {
    return {
      updatedGroups: [groupA.withRepresentativeCoordinate(targetCoordinate)],
      removedGroupIds: [],
      snapCoordinate: targetCoordinate,
    };
  }

  // Case 3: 両方が別グループに属する → 統合
  if (groupA && groupB) {
    const mergedIds = [...new Set([...groupA.vertexIds, ...groupB.vertexIds])];
    const mergedGroup = new SharedVertexGroup(
      groupA.id,
      mergedIds,
      targetCoordinate
    );
    return {
      updatedGroups: [mergedGroup],
      removedGroupIds: [groupB.id],
      snapCoordinate: targetCoordinate,
    };
  }

  // Case 2a: draggedVertex がグループに属する → targetVertex を追加
  if (groupA) {
    const updatedIds = [...groupA.vertexIds, targetVertexId];
    const updatedGroup = groupA
      .withVertexIds(updatedIds)
      .withRepresentativeCoordinate(targetCoordinate);
    return {
      updatedGroups: [updatedGroup],
      removedGroupIds: [],
      snapCoordinate: targetCoordinate,
    };
  }

  // Case 2b: targetVertex がグループに属する → draggedVertex を追加
  if (groupB) {
    const updatedIds = [...groupB.vertexIds, draggedVertexId];
    const updatedGroup = groupB
      .withVertexIds(updatedIds)
      .withRepresentativeCoordinate(targetCoordinate);
    return {
      updatedGroups: [updatedGroup],
      removedGroupIds: [],
      snapCoordinate: targetCoordinate,
    };
  }

  // Case 1: どちらもグループに属さない → 新規グループ作成
  const newGroup = new SharedVertexGroup(
    newGroupId,
    [draggedVertexId, targetVertexId],
    targetCoordinate
  );
  return {
    updatedGroups: [newGroup],
    removedGroupIds: [],
    snapCoordinate: targetCoordinate,
  };
}

/**
 * 頂点を共有グループから解除する
 *
 * §2.1: コンテキストメニューに「共有解除」オプション
 * 実行後、同じ座標に複数の独立した頂点が存在する
 *
 * @param vertexId 解除する頂点ID
 * @param groups 現在の全グループマップ
 * @returns アンマージ結果。グループに属していなければ null
 */
export function unmergeVertex(
  vertexId: string,
  groups: ReadonlyMap<string, SharedVertexGroup>
): UnmergeResult | null {
  const group = findGroupForVertex(vertexId, groups);
  if (!group) return null;

  const newVertexIds = group.vertexIds.filter(id => id !== vertexId);
  const updatedGroup = group.withVertexIds(newVertexIds);

  return {
    updatedGroup: updatedGroup.shouldBeRemoved() ? null : updatedGroup,
    groupId: group.id,
  };
}

/**
 * 共有頂点グループの全メンバーの座標を更新する
 *
 * §2.1: 共有頂点の移動時 — すべての共有ポリゴンが同時移動
 *
 * @param groupId 対象グループID
 * @param newCoordinate 移動先座標
 * @param groups 全グループマップ
 * @param vertices 全頂点マップ
 * @returns 更新された頂点マップのエントリ（[vertexId, updatedVertex]の配列）とグループ
 */
export function moveSharedVertices(
  groupId: string,
  newCoordinate: Coordinate,
  groups: ReadonlyMap<string, SharedVertexGroup>,
  vertices: ReadonlyMap<string, Vertex>
): {
  readonly updatedVertices: readonly [string, Vertex][];
  readonly updatedGroup: SharedVertexGroup;
} {
  const group = groups.get(groupId);
  if (!group) {
    return { updatedVertices: [], updatedGroup: new SharedVertexGroup(groupId, [], newCoordinate) };
  }

  const normalizedCoord = newCoordinate.normalize();
  const updatedVertices: [string, Vertex][] = [];

  for (const vid of group.vertexIds) {
    const vertex = vertices.get(vid);
    if (vertex) {
      updatedVertices.push([vid, vertex.withCoordinate(normalizedCoord)]);
    }
  }

  const updatedGroup = group.withRepresentativeCoordinate(normalizedCoord);
  return { updatedVertices, updatedGroup };
}

/**
 * 自動共有化抑制の管理
 *
 * §2.1: 誤操作防止 — 移動前の距離が一定以下の二点は
 * ドラッグ開始直後の自動共有化を抑制する。
 * 一度スナップ距離より外へ離れるとこの抑制解除。
 */
export class UnmergeSuppression {
  /** 抑制中の頂点ペア: key = "vertexId1:vertexId2" (sorted) */
  private suppressedPairs = new Set<string>();

  /** 抑制ペアを登録する */
  suppress(vertexIdA: string, vertexIdB: string): void {
    this.suppressedPairs.add(this.makeKey(vertexIdA, vertexIdB));
  }

  /** 抑制を解除する */
  release(vertexIdA: string, vertexIdB: string): void {
    this.suppressedPairs.delete(this.makeKey(vertexIdA, vertexIdB));
  }

  /** 特定頂点に関する全抑制を解除する */
  releaseAll(vertexId: string): void {
    for (const key of [...this.suppressedPairs]) {
      if (key.includes(vertexId)) {
        this.suppressedPairs.delete(key);
      }
    }
  }

  /** 頂点ペアが抑制中か判定する */
  isSuppressed(vertexIdA: string, vertexIdB: string): boolean {
    return this.suppressedPairs.has(this.makeKey(vertexIdA, vertexIdB));
  }

  /** 抑制中のペア数を取得する */
  get size(): number {
    return this.suppressedPairs.size;
  }

  /** 全抑制をクリアする */
  clear(): void {
    this.suppressedPairs.clear();
  }

  private makeKey(a: string, b: string): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }
}
