/**
 * 空間的競合検出ドメインサービス
 *
 * §2.2.3: 整合性維持プロセス — 空間的競合検出
 * §2.1: 面情報の排他性 — 同一レイヤー内ポリゴンの重なり禁止
 *
 * 同一レイヤー・同一時間範囲で面情報が空間的に重なる場合を「競合」として検出する。
 * 境界の接触（共有頂点/共有辺）は競合に含めない。
 */

import type { Feature } from '@domain/entities/Feature';
import type { Vertex } from '@domain/entities/Vertex';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { RingCoords } from './GeometryService';
import { polygonIntersection } from './BooleanOperationService';

/** 空間的競合 */
export interface SpatialConflict {
  /** 競合の一意ID */
  readonly id: string;
  /** 競合する地物A */
  readonly featureIdA: string;
  /** 競合する地物B */
  readonly featureIdB: string;
  /** 競合が検出されたレイヤーID */
  readonly layerId: string;
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
 * 指定時点での同一レイヤー内ポリゴン重なりを検出する
 *
 * §2.1: 同一レイヤー内のポリゴン同士は空間的に重なってはならない
 *
 * @param features 全地物リスト
 * @param vertices 全頂点マップ
 * @param time 検査時刻
 * @param targetLayerIds 検査対象レイヤーID群（省略時は全レイヤー）
 * @returns 競合検出結果
 */
export function detectSpatialConflicts(
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint,
  targetLayerIds?: ReadonlySet<string>
): ConflictDetectionResult {
  // 時刻でアクティブなポリゴン地物をレイヤー別にグループ化
  const layerPolygons = groupPolygonsByLayer(features, time, targetLayerIds);

  const conflicts: SpatialConflict[] = [];
  let conflictIndex = 0;

  // 各レイヤー内でペアワイズに重なりチェック
  for (const [layerId, polygonInfos] of layerPolygons) {
    for (let i = 0; i < polygonInfos.length; i++) {
      for (let j = i + 1; j < polygonInfos.length; j++) {
        const a = polygonInfos[i];
        const b = polygonInfos[j];

        const ringsA = resolveOccupiedPolygons(a.anchor, vertices);
        const ringsB = resolveOccupiedPolygons(b.anchor, vertices);

        if (ringsA.length === 0 || ringsB.length === 0) continue;

        if (territorySetsOverlap(ringsA, ringsB)) {
          conflicts.push({
            id: `conflict-${conflictIndex++}`,
            featureIdA: a.featureId,
            featureIdB: b.featureId,
            layerId,
            atTime: time,
          });
        }
      }
    }
  }

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
  };
}

/**
 * 特定の地物が他のポリゴンと競合するかチェックする
 *
 * 編集後の即時検証に使用。
 *
 * @param targetFeatureId チェック対象の地物ID
 * @param features 全地物リスト
 * @param vertices 全頂点マップ
 * @param time 検査時刻
 * @returns 対象地物に関する競合リスト
 */
export function detectConflictsForFeature(
  targetFeatureId: string,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint
): readonly SpatialConflict[];
export function detectConflictsForFeature(
  targetFeature: Feature,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint,
  explicitLayerId?: string
): readonly SpatialConflict[];
export function detectConflictsForFeature(
  target: string | Feature,
  features: readonly Feature[],
  vertices: ReadonlyMap<string, Vertex>,
  time: TimePoint,
  explicitLayerId?: string
): readonly SpatialConflict[] {
  const targetFeature =
    typeof target === 'string'
      ? features.find((feature) => feature.id === target)
      : target;
  if (!targetFeature || targetFeature.featureType !== 'Polygon') return [];

  const targetAnchor = targetFeature.getActiveAnchor(time);
  if (!targetAnchor || targetAnchor.shape.type !== 'Polygon') return [];

  const targetRings = resolveOccupiedPolygons(targetAnchor, vertices);
  if (targetRings.length === 0) return [];

  const targetLayerId = explicitLayerId ?? targetAnchor.placement.layerId;
  const conflicts: SpatialConflict[] = [];
  let conflictIndex = 0;

  for (const other of features) {
    if (other.id === targetFeature.id) continue;
    if (other.featureType !== 'Polygon') continue;

    const otherAnchor = other.getActiveAnchor(time);
    if (!otherAnchor || otherAnchor.shape.type !== 'Polygon') continue;
    if (otherAnchor.placement.layerId !== targetLayerId) continue;

    const otherRings = resolveOccupiedPolygons(otherAnchor, vertices);
    if (otherRings.length === 0) continue;

    if (territorySetsOverlap(targetRings, otherRings)) {
      conflicts.push({
        id: `conflict-${conflictIndex++}`,
        featureIdA: targetFeature.id,
        featureIdB: other.id,
        layerId: targetLayerId,
        atTime: time,
      });
    }
  }

  return conflicts;
}

/** 時刻でアクティブなポリゴン地物をレイヤー別にグループ化する */
function groupPolygonsByLayer(
  features: readonly Feature[],
  time: TimePoint,
  targetLayerIds?: ReadonlySet<string>
): Map<string, { featureId: string; anchor: FeatureAnchor }[]> {
  const result = new Map<string, { featureId: string; anchor: FeatureAnchor }[]>();

  for (const feature of features) {
    if (feature.featureType !== 'Polygon') continue;

    const anchor = feature.getActiveAnchor(time);
    if (!anchor || anchor.shape.type !== 'Polygon') continue;

    const layerId = anchor.placement.layerId;
    if (targetLayerIds && !targetLayerIds.has(layerId)) continue;

    if (!result.has(layerId)) {
      result.set(layerId, []);
    }
    result.get(layerId)!.push({ featureId: feature.id, anchor });
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
  if (anchor.shape.type !== 'Polygon') return [];

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
      if (!polygonIntersection(ringA, ringB).isEmpty) {
        return true;
      }
    }
  }
  return false;
}
