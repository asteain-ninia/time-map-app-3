import { TimePoint } from './TimePoint';
import type { Ring } from './Ring';

/** 地物の形状定義 */
export type FeatureShape =
  | { readonly type: 'Point'; readonly vertexId: string }
  | { readonly type: 'LineString'; readonly vertexIds: readonly string[] }
  | { readonly type: 'Polygon'; readonly rings: readonly Ring[] };

/** 面スタイル定義 */
export interface PolygonStyle {
  readonly fillColor: string;
  readonly selectedFillColor: string;
  readonly autoColor: boolean;
  readonly palette: string;
}

/** ラベル表示条件 */
export interface LabelVisibility {
  readonly minZoom?: number;
  readonly minDisplayLength?: number;
}

/** 歴史の錨の属性情報 */
export interface AnchorProperty {
  readonly name: string;
  readonly description: string;
  readonly labelVisibility?: LabelVisibility;
  readonly style?: PolygonStyle;
  readonly attributes?: Record<string, unknown>;
}

/** 所属と階層情報 */
export interface AnchorPlacement {
  readonly layerId: string;
  readonly parentId: string | null;
  readonly childIds: readonly string[];
}

/** 歴史の錨の有効期間 */
export interface TimeRange {
  readonly start: TimePoint;
  readonly end?: TimePoint;
}

/**
 * 歴史の錨（FeatureAnchor）値オブジェクト
 * 特定時間範囲における地物の完全状態スナップショット
 */
export class FeatureAnchor {
  readonly id: string;
  readonly timeRange: TimeRange;
  readonly property: AnchorProperty;
  readonly shape: FeatureShape;
  readonly placement: AnchorPlacement;

  constructor(
    id: string,
    timeRange: TimeRange,
    property: AnchorProperty,
    shape: FeatureShape,
    placement: AnchorPlacement
  ) {
    this.id = id;
    this.timeRange = timeRange;
    this.property = property;
    this.shape = shape;
    this.placement = placement;
  }

  /** 指定時間点でこの錨が有効かどうか */
  isActiveAt(time: TimePoint): boolean {
    if (time.isBefore(this.timeRange.start)) return false;
    if (this.timeRange.end && time.isAtOrAfter(this.timeRange.end)) return false;
    return true;
  }

  withTimeRange(timeRange: TimeRange): FeatureAnchor {
    return new FeatureAnchor(this.id, timeRange, this.property, this.shape, this.placement);
  }

  withProperty(property: AnchorProperty): FeatureAnchor {
    return new FeatureAnchor(this.id, this.timeRange, property, this.shape, this.placement);
  }

  withShape(shape: FeatureShape): FeatureAnchor {
    return new FeatureAnchor(this.id, this.timeRange, this.property, shape, this.placement);
  }

  withPlacement(placement: AnchorPlacement): FeatureAnchor {
    return new FeatureAnchor(this.id, this.timeRange, this.property, this.shape, placement);
  }
}
