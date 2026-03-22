/**
 * リング編集ドメインサービス
 *
 * §2.1: 面情報の排他性 — 穴/飛び地のリング階層管理
 *
 * ポリゴン形状は複数のリングで構成される:
 * - territory（領土）: 外部リングまたは飛び地
 * - hole（穴）: 領土内の穴
 *
 * リング階層は「領土 → 穴 → 領土 → …」と交互に維持する。
 * 削除時は直下の子リングも削除し、孫リングを再接続する。
 */

import { Ring, type RingType } from '@domain/value-objects/Ring';
import {
  isPointInPolygon,
  isRingContainedIn,
  ringsEdgesIntersect,
  ringsOverlap,
  isSelfIntersecting,
  type RingCoords,
} from './GeometryService';
import type { Vertex } from '@domain/entities/Vertex';

/** リング追加結果 */
export interface AddRingResult {
  /** 追加されたリングを含む新しいリング配列 */
  readonly rings: readonly Ring[];
  /** 追加されたリングのID */
  readonly addedRingId: string;
}

/** リング削除結果 */
export interface DeleteRingResult {
  /** 削除後のリング配列 */
  readonly rings: readonly Ring[];
  /** 削除されたリングID群 */
  readonly deletedRingIds: readonly string[];
  /** 地物全体が削除されるべきか */
  readonly shouldDeleteFeature: boolean;
}

/** リングバリデーションエラー */
export interface RingValidationError {
  readonly type: 'self_intersecting' | 'not_contained' | 'boundary_crossing' | 'sibling_overlap';
  readonly message: string;
}

/**
 * 穴リングをポリゴンに追加する
 *
 * §2.1: 穴リングは親の領土リング内に完全に含まれる必要がある
 *
 * @param rings 現在のリング配列
 * @param parentRingId 穴の親となる領土リングID
 * @param newRingId 新しいリングID
 * @param vertexIds 穴の頂点ID配列（3点以上）
 * @returns 追加結果
 */
export function addHoleRing(
  rings: readonly Ring[],
  parentRingId: string,
  newRingId: string,
  vertexIds: readonly string[]
): AddRingResult {
  const parentRing = rings.find(r => r.id === parentRingId);
  if (!parentRing) {
    throw new RingEditError(`Parent ring "${parentRingId}" not found`);
  }
  if (parentRing.ringType !== 'territory') {
    throw new RingEditError(`Parent ring "${parentRingId}" is not a territory ring`);
  }
  if (vertexIds.length < 3) {
    throw new RingEditError('Hole ring requires at least 3 vertices');
  }

  const newRing = new Ring(newRingId, vertexIds, 'hole', parentRingId);
  return {
    rings: [...rings, newRing],
    addedRingId: newRingId,
  };
}

/**
 * 飛び地（領土）リングをポリゴンに追加する
 *
 * §2.1: 飛び地は穴リング内に存在するか、トップレベルの独立領土
 *
 * @param rings 現在のリング配列
 * @param parentRingId 親となる穴リングID（トップレベルの場合null）
 * @param newRingId 新しいリングID
 * @param vertexIds 飛び地の頂点ID配列（3点以上）
 * @returns 追加結果
 */
export function addExclaveRing(
  rings: readonly Ring[],
  parentRingId: string | null,
  newRingId: string,
  vertexIds: readonly string[]
): AddRingResult {
  if (parentRingId !== null) {
    const parentRing = rings.find(r => r.id === parentRingId);
    if (!parentRing) {
      throw new RingEditError(`Parent ring "${parentRingId}" not found`);
    }
    if (parentRing.ringType !== 'hole') {
      throw new RingEditError(`Parent ring "${parentRingId}" is not a hole ring`);
    }
  }
  if (vertexIds.length < 3) {
    throw new RingEditError('Exclave ring requires at least 3 vertices');
  }

  const newRing = new Ring(newRingId, vertexIds, 'territory', parentRingId);
  return {
    rings: [...rings, newRing],
    addedRingId: newRingId,
  };
}

/**
 * リングを削除する（階層再編を含む）
 *
 * §2.1: 穴/飛び地の削除操作
 *
 * 穴リング削除時:
 *   穴自身 + 直下の領土リングを削除
 *   孫リング（削除された領土の穴子リング）を穴の親に再接続
 *
 * 領土リング削除時:
 *   領土自身 + 直下の穴リングを削除
 *   孫リング（削除された穴の領土子リング）を領土の親に再接続
 *   トップレベル領土の場合、孫リングはトップレベルに昇格
 *
 * @param rings 現在のリング配列
 * @param ringId 削除対象のリングID
 * @returns 削除結果
 */
export function deleteRing(
  rings: readonly Ring[],
  ringId: string
): DeleteRingResult {
  const targetRing = rings.find(r => r.id === ringId);
  if (!targetRing) {
    throw new RingEditError(`Ring "${ringId}" not found`);
  }

  // トップレベルの領土リングが削除される場合で、他にトップレベル領土がなければ地物削除
  if (targetRing.ringType === 'territory' && targetRing.parentId === null) {
    const otherTopLevelTerritories = rings.filter(
      r => r.id !== ringId && r.ringType === 'territory' && r.parentId === null
    );
    // 孫リングが昇格する可能性があるのでチェック
    const grandchildren = getGrandchildrenForDeletion(rings, targetRing);
    const promotedTopLevel = grandchildren.filter(r => r.ringType === 'territory');
    if (otherTopLevelTerritories.length === 0 && promotedTopLevel.length === 0) {
      return {
        rings: [],
        deletedRingIds: rings.map(r => r.id),
        shouldDeleteFeature: true,
      };
    }
  }

  // 直下の子リング（交互パターンの次レベル）を取得
  const directChildren = getDirectChildren(rings, ringId);
  const deletedIds = new Set<string>([ringId, ...directChildren.map(c => c.id)]);

  // 孫リング（削除される子リングの子）を再接続
  const grandchildren = getGrandchildrenForDeletion(rings, targetRing);
  const newParentId = targetRing.parentId;

  // 結果リング配列を構築
  const resultRings: Ring[] = [];
  for (const ring of rings) {
    if (deletedIds.has(ring.id)) continue;

    // 孫リングの再接続
    const gc = grandchildren.find(g => g.id === ring.id);
    if (gc) {
      resultRings.push(ring.withParentId(newParentId));
    } else {
      resultRings.push(ring);
    }
  }

  return {
    rings: resultRings,
    deletedRingIds: [...deletedIds],
    shouldDeleteFeature: false,
  };
}

/**
 * リング配置のバリデーション
 *
 * §2.1: リング編集時の空間的制約
 * - 穴リングは親領土内に完全に含まれること
 * - 穴リング境界が親リング境界と交差しないこと
 * - 兄弟リング同士が重ならないこと
 * - リングが自己交差しないこと
 *
 * @param newRingCoords 検証対象リングの座標列
 * @param parentRingCoords 親リングの座標列（トップレベルならnull）
 * @param siblingRingsCoords 兄弟リングの座標列配列
 * @returns エラー配列（空なら有効）
 */
export function validateRingPlacement(
  newRingCoords: RingCoords,
  parentRingCoords: RingCoords | null,
  siblingRingsCoords: readonly RingCoords[]
): RingValidationError[] {
  const errors: RingValidationError[] = [];

  // 自己交差チェック
  if (isSelfIntersecting(newRingCoords)) {
    errors.push({
      type: 'self_intersecting',
      message: 'リングが自己交差しています',
    });
  }

  // 親リング内包含チェック
  if (parentRingCoords) {
    if (!isRingContainedIn(newRingCoords, parentRingCoords)) {
      errors.push({
        type: 'not_contained',
        message: '穴/飛び地が親リングの内部に完全に収まっていません',
      });
    }
    if (ringsEdgesIntersect(newRingCoords, parentRingCoords)) {
      errors.push({
        type: 'boundary_crossing',
        message: 'リング境界が親リング境界と交差しています',
      });
    }
  }

  // 兄弟リング重なりチェック
  for (const siblingCoords of siblingRingsCoords) {
    if (ringsOverlap(newRingCoords, siblingCoords)) {
      errors.push({
        type: 'sibling_overlap',
        message: '兄弟リングと重なっています',
      });
      break;
    }
  }

  return errors;
}

/**
 * リングの頂点座標を解決する
 *
 * @param ring 対象リング
 * @param vertices 頂点マップ
 * @returns リング座標配列
 */
export function resolveRingCoords(
  ring: Ring,
  vertices: ReadonlyMap<string, Vertex>
): RingCoords {
  return ring.vertexIds.map(vid => {
    const v = vertices.get(vid);
    if (!v) throw new RingEditError(`Vertex "${vid}" not found`);
    return { x: v.x, y: v.y };
  });
}

/**
 * 指定リングの直下の子リングを取得する
 */
export function getDirectChildren(
  rings: readonly Ring[],
  parentId: string
): readonly Ring[] {
  return rings.filter(r => r.parentId === parentId);
}

/**
 * 指定リングの全子孫リングを取得する（深さ優先）
 */
export function getDescendants(
  rings: readonly Ring[],
  rootId: string
): readonly Ring[] {
  const result: Ring[] = [];
  const stack = [rootId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = rings.filter(r => r.parentId === current);
    for (const child of children) {
      result.push(child);
      stack.push(child.id);
    }
  }

  return result;
}

/**
 * 削除対象リングの孫リング（再接続対象）を収集する
 *
 * 削除対象: ringId + 直下の子リング
 * 孫: 直下の子リングそれぞれの子リング
 */
function getGrandchildrenForDeletion(
  rings: readonly Ring[],
  targetRing: Ring
): readonly Ring[] {
  const directChildren = getDirectChildren(rings, targetRing.id);
  const grandchildren: Ring[] = [];
  for (const child of directChildren) {
    const childChildren = getDirectChildren(rings, child.id);
    grandchildren.push(...childChildren);
  }
  return grandchildren;
}

/** リング編集エラー */
export class RingEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RingEditError';
  }
}
