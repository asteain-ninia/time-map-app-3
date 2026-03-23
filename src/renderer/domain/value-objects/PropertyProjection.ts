/**
 * PropertyProjection（読み取り専用投影）
 *
 * §4.1: FeatureAnchor から算出される表示専用ビュー。
 * 編集・保存・履歴記録の書き込み元として使用してはならない。
 * anchors から都度算出される保存対象外のデータ。
 *
 * UI層がFeatureAnchorの内部構造に依存せず、表示に必要な情報だけを
 * 扱えるようにするための投影。
 */

import type { TimePoint } from './TimePoint';
import type { FeatureAnchor, AnchorProperty, FeatureShape, AnchorPlacement, PolygonStyle } from './FeatureAnchor';
import type { Feature } from '@domain/entities/Feature';

/** 表示用の読み取り専用投影 */
export class PropertyProjection {
  /** 元の錨ID */
  readonly anchorId: string;
  /** 地物ID */
  readonly featureId: string;
  /** 表示名 */
  readonly name: string;
  /** 説明 */
  readonly description: string;
  /** 開始時刻 */
  readonly start: TimePoint;
  /** 終了時刻（undefined = 永続） */
  readonly end: TimePoint | undefined;
  /** 地物種別 */
  readonly featureType: string;
  /** 所属レイヤーID */
  readonly layerId: string;
  /** 親地物ID */
  readonly parentId: string | null;
  /** 子地物ID群 */
  readonly childIds: readonly string[];
  /** 面スタイル（ポリゴンの場合） */
  readonly style: PolygonStyle | undefined;
  /** カスタム属性 */
  readonly attributes: Record<string, unknown>;

  constructor(params: {
    anchorId: string;
    featureId: string;
    name: string;
    description: string;
    start: TimePoint;
    end: TimePoint | undefined;
    featureType: string;
    layerId: string;
    parentId: string | null;
    childIds: readonly string[];
    style: PolygonStyle | undefined;
    attributes: Record<string, unknown>;
  }) {
    this.anchorId = params.anchorId;
    this.featureId = params.featureId;
    this.name = params.name;
    this.description = params.description;
    this.start = params.start;
    this.end = params.end;
    this.featureType = params.featureType;
    this.layerId = params.layerId;
    this.parentId = params.parentId;
    this.childIds = params.childIds;
    this.style = params.style;
    this.attributes = params.attributes;
  }
}

/**
 * FeatureAnchor から PropertyProjection を生成する
 */
export function projectFromAnchor(
  anchor: FeatureAnchor,
  featureId: string,
  featureType: string
): PropertyProjection {
  return new PropertyProjection({
    anchorId: anchor.id,
    featureId,
    name: anchor.property.name,
    description: anchor.property.description,
    start: anchor.timeRange.start,
    end: anchor.timeRange.end,
    featureType,
    layerId: anchor.placement.layerId,
    parentId: anchor.placement.parentId,
    childIds: anchor.placement.childIds,
    style: anchor.property.style,
    attributes: anchor.property.attributes ?? {},
  });
}

/**
 * Feature の全錨から PropertyProjection 配列を生成する
 */
export function projectFromFeature(feature: Feature): PropertyProjection[] {
  return feature.anchors.map(anchor =>
    projectFromAnchor(anchor, feature.id, feature.featureType)
  );
}

/**
 * 指定時間点での PropertyProjection を取得する
 */
export function projectAtTime(
  feature: Feature,
  time: TimePoint
): PropertyProjection | undefined {
  const anchor = feature.getActiveAnchor(time);
  if (!anchor) return undefined;
  return projectFromAnchor(anchor, feature.id, feature.featureType);
}
