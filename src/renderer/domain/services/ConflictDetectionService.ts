/**
 * 空間的競合検出ドメインサービス
 *
 * §2.2.3: 整合性維持プロセス — 空間的競合検出
 * §2.1: 末端地物の排他性 — 末端地物（リーフ）同士は地図全体で重なり禁止
 *
 * 同一時刻にアクティブな末端地物（リーフ = `shape` を保持し `childIds.length === 0`）が
 * 空間的に重なる場合を「競合」として検出する。境界の接触（共有頂点 / 共有辺）は競合に含めない。
 *
 * 開発ガイド §6.6.8 / 現状.md §6.4 / 要件定義書 §2.1 line 145-153 に従い、
 * - 排他検証は **地図全体** に適用する（同一親への限定はしない）
 * - 排他検証の対象は **末端地物のみ**。集約地物・移行期間ノード（shape あり + childIds 非空）は対象外
 * とする。集約地物同士の重なりは、子の末端地物が末端排他を満たすことで派生的に保証される。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { isLeafPolygonAnchor } from '@domain/value-objects/FeatureAnchor';
import type { RingCoords } from './GeometryService';
import { findOverlappingLongitudeShift } from './BooleanOperationService';

/** 空間的競合 */
export interface SpatialConflict {
  /** 競合の一意ID */
  readonly id: string;
  /** 競合する地物A */
  readonly featureIdA: string;
  /** 競合する地物B */
  readonly featureIdB: string;
  /** 競合が検出された時間点 */
  readonly atTime: TimePoint;
}

/** 競合検出結果 */
export interface ConflictDetectionResult {
  /** 検出された競合リスト */
  readonly conflicts: readonly SpatialConflict[];
  /** 競合があるか */
  readonly hasConflicts: boolean;
}

/**
 * 指定時点での末端地物同士の重なりを地図全体で検出する
 *
 * §2.1: 末端地物（リーフ）同士は地図全体で空間的に重なってはならない
 *
 * @param features 全地物リスト
 * @param vertices 全頂点マップ
 * @param time 検査時刻
 * @returns 競合検出結果
 */
export function detectSpatialConflicts(
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint
): ConflictDetectionResult {
  const leafPolygons = collectLeafPolygons(features, time);

  const conflicts: SpatialConflict[] = [];
  let conflictIndex = 0;

  for (let i = 0; i < leafPolygons.length; i++) {
    for (let j = i + 1; j < leafPolygons.length; j++) {
      const a = leafPolygons[i];
      const b = leafPolygons[j];

      const ringsA = resolveOccupiedPolygons(a.anchor, vertices);
      const ringsB = resolveOccupiedPolygons(b.anchor, vertices);

      if (ringsA.length === 0 || ringsB.length === 0) continue;

      if (territorySetsOverlap(ringsA, ringsB)) {
        conflicts.push({
          id: `conflict-${conflictIndex++}`,
          featureIdA: a.featureId,
          featureIdB: b.featureId,
          atTime: time,
        });
      }
    }
  }

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

/**
 * 特定の地物が他の末端地物と競合するかチェックする
 *
 * 編集後の即時検証に使用。
 *
 * @param target チェック対象の地物 (ID または Feature インスタンス)。
 *               一覧に未登録の仮想地物を Feature として渡しても利用できる。
 * @param features 全地物リスト
 * @param vertices 全頂点マップ
 * @param time 検査時刻
 * @returns 対象地物に関する競合リスト
 */
export function detectConflictsForFeature(
  target: string | Feature,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint
): readonly SpatialConflict[] {
  const targetFeature =
    typeof target === 'string'
      ? features.find((feature) => feature.id === target)
      : target;
  if (!targetFeature || targetFeature.featureType !== 'Polygon') return [];

  const targetAnchor = targetFeature.getActiveAnchor(time);
  // §6.6.8: 末端排他は末端地物同士のみ。集約地物・移行期間ノード（shape あり + childIds 非空）は対象外。
  if (!targetAnchor || !isLeafPolygonAnchor(targetAnchor)) return [];

  const targetRings = resolveOccupiedPolygons(targetAnchor, vertices);
  if (targetRings.length === 0) return [];

  const conflicts: SpatialConflict[] = [];
  let conflictIndex = 0;

  for (const other of features) {
    if (other.id === targetFeature.id) continue;
    if (other.featureType !== 'Polygon') continue;

    const otherAnchor = other.getActiveAnchor(time);
    // §6.6.8: 排他検証対象は末端地物のみに絞る。
    if (!otherAnchor || !isLeafPolygonAnchor(otherAnchor)) continue;

    const otherRings = resolveOccupiedPolygons(otherAnchor, vertices);
    if (otherRings.length === 0) continue;

    if (territorySetsOverlap(targetRings, otherRings)) {
      conflicts.push({
        id: `conflict-${conflictIndex++}`,
        featureIdA: targetFeature.id,
        featureIdB: other.id,
        atTime: time,
      });
    }
  }

  return conflicts;
}

/** 時刻でアクティブな末端ポリゴン地物を地図全体で収集する */
function collectLeafPolygons(
  features: readonly Feature[],
  time: TimePoint
): { featureId: string; anchor: FeatureAnchor }[] {
  const result: { featureId: string; anchor: FeatureAnchor }[] = [];

  for (const feature of features) {
    if (feature.featureType !== 'Polygon') continue;

    const anchor = feature.getActiveAnchor(time);
    // §6.6.8: 排他検証は末端地物のみが対象。集約地物・移行期間ノードは除外する。
    if (!anchor || !isLeafPolygonAnchor(anchor)) continue;

    result.push({ featureId: feature.id, anchor });
  }

  return result;
}

/** FeatureAnchor のポリゴンリング座標を解決する */
interface ResolvedPolygonRing {
  readonly ringId: string;
  readonly ringType: 'territory' | 'hole';
  readonly parentId: string | null;
  readonly coords: RingCoords;
}

function resolveOccupiedPolygons(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): RingCoords[][] {
  if (!anchor.shape || anchor.shape.type !== 'Polygon') return [];

  const rings: ResolvedPolygonRing[] = [];
  for (const ring of anchor.shape.rings) {
    const coords: { x: number; y: number }[] = [];
    let valid = true;
    for (const vid of ring.vertexIds) {
      const v = vertices.get(vid);
      if (!v) { valid = false; break; }
      coords.push({ x: v.x, y: v.y });
    }
    if (valid && coords.length >= 3) {
      rings.push({
        ringId: ring.id,
        ringType: ring.ringType,
        parentId: ring.parentId,
        coords,
      });
    }
  }

  const holesByParentId = new Map<string, RingCoords[]>();
  for (const ring of rings) {
    if (ring.ringType !== 'hole' || ring.parentId === null) continue;

    if (!holesByParentId.has(ring.parentId)) {
      holesByParentId.set(ring.parentId, []);
    }
    holesByParentId.get(ring.parentId)!.push(ring.coords);
  }

  return rings
    .filter((ring) => ring.ringType === 'territory')
    .map((ring) => [ring.coords, ...(holesByParentId.get(ring.ringId) ?? [])]);
}

function territorySetsOverlap(
  ringsA: readonly RingCoords[][],
  ringsB: readonly RingCoords[][]
): boolean {
  for (const ringA of ringsA) {
    for (const ringB of ringsB) {
      if (findOverlappingLongitudeShift(ringA, ringB) !== null) {
        return true;
      }
    }
  }
  return false;
}
