/**
 * スナップインジケーターユーティリティ
 *
 * §2.1: 共有頂点スナップ — ドラッグ中に近接頂点を視覚的に示す
 */

import type { SnapCandidate } from '@domain/services/SharedVertexService';
import type { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';

/** スナップ表示情報 */
export interface SnapIndicator {
  /** スナップ先の頂点ID */
  readonly targetVertexId: string;
  /** スナップ先の座標 */
  readonly x: number;
  readonly y: number;
  /** スナップ先が既に共有グループに属しているか */
  readonly isShared: boolean;
}

/**
 * スナップ候補からインジケーター情報を生成する
 * 最も近い候補1つだけを表示対象とする
 */
export function buildSnapIndicator(
  candidates: readonly SnapCandidate[],
  vertices: ReadonlyMap<string, Vertex>,
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>
): SnapIndicator | null {
  if (candidates.length === 0) return null;

  const best = candidates[0];
  const vertex = vertices.get(best.vertexId);
  if (!vertex) return null;

  // 共有グループに属しているか判定
  let isShared = false;
  for (const group of sharedGroups.values()) {
    if (group.vertexIds.includes(best.vertexId)) {
      isShared = true;
      break;
    }
  }

  return {
    targetVertexId: best.vertexId,
    x: vertex.x,
    y: vertex.y,
    isShared,
  };
}

/**
 * 頂点が共有グループに属しているか判定する
 */
export function isVertexShared(
  vertexId: string,
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>
): boolean {
  for (const group of sharedGroups.values()) {
    if (group.vertexIds.includes(vertexId)) {
      return true;
    }
  }
  return false;
}

/**
 * 頂点が属する共有グループの他の頂点IDを取得する
 */
export function getSharedPeerIds(
  vertexId: string,
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>
): string[] {
  for (const group of sharedGroups.values()) {
    if (group.vertexIds.includes(vertexId)) {
      return group.vertexIds.filter((id) => id !== vertexId);
    }
  }
  return [];
}
