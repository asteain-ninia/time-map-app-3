/**
 * レイヤー階層ドメインサービス
 *
 * §2.1: レイヤー間の制約 — 親子関係ナビゲーション、形状導出、バリデーション
 * §5.2: LayerService — parent-child feature navigation, shape derivation
 *
 * 面情報の親子関係（上位領域・下位領域）に関するドメインロジックを提供する。
 * ステートレスなユーティリティ関数群。
 *
 * ※ レイヤーの表示制御（visibility, opacity）は ManageLayersUseCase の責務。
 */

import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import { createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from './GeometryService';
import { polygonUnion } from './BooleanOperationService';
import type { Coordinate } from '@domain/value-objects/Coordinate';

// ──────────────────────────────────────────
// 親子関係ナビゲーション
// ──────────────────────────────────────────

/**
 * 指定時間点での親地物を取得する
 *
 * §2.1: 面情報は同一時点で高々1つの上位レイヤー面情報にのみ属する
 */
export function getParentFeature(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature | undefined {
  const anchor = feature.getActiveAnchor(time);
  if (!anchor || !anchor.placement.parentId) return undefined;
  return allFeatures.find(f => f.id === anchor.placement.parentId);
}

/**
 * 指定時間点での子地物を取得する
 *
 * §2.1: 下位領域を持つ面情報
 */
export function getChildFeatures(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature[] {
  const anchor = feature.getActiveAnchor(time);
  if (!anchor || anchor.placement.childIds.length === 0) return [];

  const childIdSet = new Set(anchor.placement.childIds);
  return allFeatures.filter(f => childIdSet.has(f.id));
}

/**
 * 指定時間点で子地物を持つかどうか
 */
export function hasChildren(
  feature: Feature,
  time: TimePoint
): boolean {
  const anchor = feature.getActiveAnchor(time);
  return anchor !== undefined && anchor.placement.childIds.length > 0;
}

/**
 * 指定時間点で親地物を持つかどうか
 */
export function hasParent(
  feature: Feature,
  time: TimePoint
): boolean {
  const anchor = feature.getActiveAnchor(time);
  return anchor !== undefined && anchor.placement.parentId !== null;
}

/**
 * ルート地物（親を持たない最上位の地物）を取得する
 */
export function getRootFeatures(
  features: readonly Feature[],
  time: TimePoint
): Feature[] {
  return features.filter(f => {
    const anchor = f.getActiveAnchor(time);
    return anchor !== undefined && anchor.placement.parentId === null;
  });
}

/**
 * 地物の全子孫を再帰的に取得する（深さ優先）
 */
export function getDescendants(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature[] {
  const result: Feature[] = [];
  const children = getChildFeatures(feature, allFeatures, time);
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(child, allFeatures, time));
  }
  return result;
}

/**
 * 地物の全祖先を取得する（直接の親から順に上位へ）
 */
export function getAncestors(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature[] {
  const result: Feature[] = [];
  let current: Feature | undefined = feature;
  while (current) {
    const parent = getParentFeature(current, allFeatures, time);
    if (!parent) break;
    result.push(parent);
    current = parent;
  }
  return result;
}

// ──────────────────────────────────────────
// 形状導出
// ──────────────────────────────────────────

/**
 * 子地物の形状和（ユニオン）を計算する
 *
 * §2.1: 下位領域を持つ面情報の形状は下位領域の和として計算される
 *
 * 子地物がポリゴンでない場合はスキップする。
 * 子が0個またはポリゴンが0個の場合は空結果を返す。
 *
 * @param vertices 頂点IDから座標を解決するマップ
 */
export function deriveParentShape(
  feature: Feature,
  allFeatures: readonly Feature[],
  vertices: ReadonlyMap<string, Coordinate>,
  time: TimePoint
): DerivedShapeResult {
  const children = getChildFeatures(feature, allFeatures, time);
  if (children.length === 0) {
    return { rings: [], isEmpty: true };
  }

  let accumulated: RingCoords[] = [];

  for (const child of children) {
    const childAnchor = child.getActiveAnchor(time);
    if (!childAnchor || childAnchor.shape.type !== 'Polygon') continue;

    const childRings = resolvePolygonRings(childAnchor, vertices);
    if (childRings.length === 0) continue;

    if (accumulated.length === 0) {
      accumulated = childRings;
    } else {
      const union = polygonUnion(accumulated, childRings);
      if (!union.isEmpty && union.polygons.length > 0) {
        // 和の結果が複数ポリゴンになる場合は最初のものを使用
        accumulated = [...union.polygons[0]];
      }
    }
  }

  return {
    rings: accumulated,
    isEmpty: accumulated.length === 0,
  };
}

/** 形状導出結果 */
export interface DerivedShapeResult {
  readonly rings: readonly RingCoords[];
  readonly isEmpty: boolean;
}

/**
 * ポリゴン錨のリングを RingCoords に解決する
 */
function resolvePolygonRings(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Coordinate>
): RingCoords[] {
  if (anchor.shape.type !== 'Polygon') return [];
  return anchor.shape.rings.map(ring =>
    ring.vertexIds
      .map(vid => {
        const coord = vertices.get(vid);
        return coord ? { x: coord.x, y: coord.y } : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null)
  ).filter(r => r.length >= 3);
}

// ──────────────────────────────────────────
// バリデーション
// ──────────────────────────────────────────

/** 階層バリデーションエラー */
export interface HierarchyValidationError {
  readonly type:
    | 'multiple_parents'
    | 'circular_reference'
    | 'parent_not_polygon'
    | 'child_not_polygon'
    | 'parent_not_found'
    | 'self_reference';
  readonly featureId: string;
  readonly message: string;
}

/**
 * 階層構造の整合性を検証する
 *
 * §2.1: 面情報は同一時点で高々1つの上位面情報にのみ属する
 * §2.1: 下位領域を持つ面情報は形状を直接編集できない（ポリゴン限定）
 */
export function validateHierarchy(
  features: readonly Feature[],
  time: TimePoint
): HierarchyValidationError[] {
  const errors: HierarchyValidationError[] = [];
  const featureMap = new Map(features.map(f => [f.id, f]));

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) continue;

    // 親が存在しない場合
    if (anchor.placement.parentId !== null) {
      const parent = featureMap.get(anchor.placement.parentId);
      if (!parent || !parent.existsAt(time)) {
        errors.push({
          type: 'parent_not_found',
          featureId: feature.id,
          message: `地物 "${feature.id}" の親 "${anchor.placement.parentId}" が存在しません`,
        });
      }
    }

    // 自己参照チェック
    if (anchor.placement.parentId === feature.id) {
      errors.push({
        type: 'self_reference',
        featureId: feature.id,
        message: `地物 "${feature.id}" が自身を親として参照しています`,
      });
    }

    // 子がポリゴンかどうかチェック
    if (anchor.placement.childIds.length > 0) {
      // 親がポリゴンであること
      if (feature.featureType !== 'Polygon') {
        errors.push({
          type: 'parent_not_polygon',
          featureId: feature.id,
          message: `地物 "${feature.id}" はポリゴンではありませんが子地物を持っています`,
        });
      }

      for (const childId of anchor.placement.childIds) {
        const child = featureMap.get(childId);
        if (child && child.featureType !== 'Polygon') {
          errors.push({
            type: 'child_not_polygon',
            featureId: childId,
            message: `子地物 "${childId}" はポリゴンではありません`,
          });
        }
      }
    }
  }

  // 循環参照チェック
  for (const feature of features) {
    const anchor = feature.getActiveAnchor(time);
    if (!anchor || anchor.placement.parentId === null) continue;

    const visited = new Set<string>();
    let currentId: string | null = feature.id;
    while (currentId !== null) {
      if (visited.has(currentId)) {
        errors.push({
          type: 'circular_reference',
          featureId: feature.id,
          message: `地物 "${feature.id}" を含む循環参照が検出されました`,
        });
        break;
      }
      visited.add(currentId);
      const f = featureMap.get(currentId);
      const a = f?.getActiveAnchor(time);
      currentId = a?.placement.parentId ?? null;
    }
  }

  return errors;
}

// ──────────────────────────────────────────
// 編集制約チェック
// ──────────────────────────────────────────

/**
 * 地物の形状が直接編集可能かどうか判定する
 *
 * §2.1: 下位領域を持つ面情報は形状を直接編集できない
 *       → 子を持つ地物はリーフノードではないため編集不可
 */
export function isShapeEditable(
  feature: Feature,
  time: TimePoint
): boolean {
  return !hasChildren(feature, time);
}

/**
 * 地物が分裂操作の対象にできるか判定する
 *
 * §2.3.3.2: 分裂はリーフノードの面情報のみ対象
 */
export function isSplittable(
  feature: Feature,
  time: TimePoint
): boolean {
  if (feature.featureType !== 'Polygon') return false;
  return !hasChildren(feature, time);
}

// ──────────────────────────────────────────
// 階層維持操作
// ──────────────────────────────────────────

/**
 * 子地物を除去した場合に親が自動消失すべきかどうか判定する
 *
 * §2.1: 下位領域をすべて喪失した場合、上位領域も自動的に消失する
 *
 * @param removedChildId 除去される子のID
 * @returns 親が消失すべきなら true
 */
export function shouldParentDisappear(
  parent: Feature,
  allFeatures: readonly Feature[],
  removedChildId: string,
  time: TimePoint
): boolean {
  const children = getChildFeatures(parent, allFeatures, time);
  // 除去対象を除いた子が0個なら消失
  const remaining = children.filter(c => c.id !== removedChildId);
  return remaining.length === 0;
}

/**
 * 親子関係を設定するための錨更新情報を生成する
 *
 * @returns 更新が必要な錨の [featureId, updatedAnchor] ペアの配列
 */
export function buildParentChildLink(
  parentFeature: Feature,
  childFeature: Feature,
  time: TimePoint
): { parentAnchor: FeatureAnchor; childAnchor: FeatureAnchor } | undefined {
  const parentActive = parentFeature.getActiveAnchor(time);
  const childActive = childFeature.getActiveAnchor(time);
  if (!parentActive || !childActive) return undefined;

  const updatedParentAnchor = parentActive.withPlacement(
    createAnchorPlacement(
      parentActive.placement.layerId,
      parentActive.placement.parentId,
      [...parentActive.placement.childIds, childFeature.id]
    )
  );

  const updatedChildAnchor = childActive.withPlacement(
    createAnchorPlacement(
      childActive.placement.layerId,
      parentFeature.id,
      childActive.placement.childIds
    )
  );

  return {
    parentAnchor: updatedParentAnchor,
    childAnchor: updatedChildAnchor,
  };
}

/**
 * 親子関係を解除するための錨更新情報を生成する
 */
export function buildParentChildUnlink(
  parentFeature: Feature,
  childFeature: Feature,
  time: TimePoint
): { parentAnchor: FeatureAnchor; childAnchor: FeatureAnchor } | undefined {
  const parentActive = parentFeature.getActiveAnchor(time);
  const childActive = childFeature.getActiveAnchor(time);
  if (!parentActive || !childActive) return undefined;

  const updatedParentAnchor = parentActive.withPlacement(
    createAnchorPlacement(
      parentActive.placement.layerId,
      parentActive.placement.parentId,
      parentActive.placement.childIds.filter(id => id !== childFeature.id)
    )
  );

  const updatedChildAnchor = childActive.withPlacement(
    createAnchorPlacement(
      childActive.placement.layerId,
      null,
      childActive.placement.childIds
    )
  );

  return {
    parentAnchor: updatedParentAnchor,
    childAnchor: updatedChildAnchor,
  };
}
