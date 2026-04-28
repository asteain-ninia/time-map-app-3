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
  /**
   * 種別ラベル（国 / 州 / 郡 / 町 / 連邦 / 植民地 など）。
   * 表示専用で整合性検証には関与しない。錨ごとに保持することで
   * 時間軸上の階級変動（同一地物が時刻ごとに別種別をとる）を表現できる。
   */
  readonly kind?: string;
}

/**
 * 所属と階層情報。
 * 不変条件: 同一錨内で `isTopLevel === (parentId === null)`。
 * 最上位フラグは錨ごとに保持することで時間軸上の位相変化（独立 / 帰属 / 連邦化）を表現できる。
 */
export interface AnchorPlacement {
  readonly layerId: string;
  readonly parentId: string | null;
  readonly childIds: readonly string[];
  readonly isTopLevel: boolean;
}

/**
 * AnchorPlacement の生成ヘルパー。
 * `isTopLevel` を `parentId === null` から派生し、不変条件「同一錨内で
 * `isTopLevel === (parentId === null)`」を生成側で必ず満たす。
 * 呼び出し側は明示的に最上位フラグを指定せず、`parentId` の有無で位相を表現する。
 */
export function createAnchorPlacement(
  layerId: string,
  parentId: string | null,
  childIds: readonly string[]
): AnchorPlacement {
  return {
    layerId,
    parentId,
    childIds,
    isTopLevel: parentId === null,
  };
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
