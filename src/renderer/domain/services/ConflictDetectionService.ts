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
import { ringsOverlap, type RingCoords } from './GeometryService';

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

        const ringsA = resolvePolygonRings(a.anchor, vertices);
        const ringsB = resolvePolygonRings(b.anchor, vertices);

        if (ringsA.length === 0 || ringsB.length === 0) continue;

        // 外部リング同士の重なりチェック
        if (ringsOverlap(ringsA[0], ringsB[0])) {
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
): readonly SpatialConflict[] {
  const targetFeature = features.find(f => f.id === targetFeatureId);
  if (!targetFeature || targetFeature.featureType !== 'Polygon') return [];

  const targetAnchor = targetFeature.getActiveAnchor(time);
  if (!targetAnchor || targetAnchor.shape.type !== 'Polygon') return [];

  const targetRings = resolvePolygonRings(targetAnchor, vertices);
  if (targetRings.length === 0) return [];

  const targetLayerId = targetAnchor.placement.layerId;
  const conflicts: SpatialConflict[] = [];
  let conflictIndex = 0;

  for (const other of features) {
    if (other.id === targetFeatureId) continue;
    if (other.featureType !== 'Polygon') continue;

    const otherAnchor = other.getActiveAnchor(time);
    if (!otherAnchor || otherAnchor.shape.type !== 'Polygon') continue;
    if (otherAnchor.placement.layerId !== targetLayerId) continue;

    const otherRings = resolvePolygonRings(otherAnchor, vertices);
    if (otherRings.length === 0) continue;

    if (ringsOverlap(targetRings[0], otherRings[0])) {
      conflicts.push({
        id: `conflict-${conflictIndex++}`,
        featureIdA: targetFeatureId,
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
function resolvePolygonRings(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): RingCoords[] {
  if (anchor.shape.type !== 'Polygon') return [];

  const rings: RingCoords[] = [];
  for (const ring of anchor.shape.rings) {
    const coords: { x: number; y: number }[] = [];
    let valid = true;
    for (const vid of ring.vertexIds) {
      const v = vertices.get(vid);
      if (!v) { valid = false; break; }
      coords.push({ x: v.x, y: v.y });
    }
    if (valid && coords.length >= 3) {
      rings.push(coords);
    }
  }
  return rings;
}
