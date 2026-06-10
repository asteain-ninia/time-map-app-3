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
  parentId: string | null,
  childIds: readonly string[]
): AnchorPlacement {
  return {
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
 * 特定時間範囲における地物の完全状態スナップショット。
 * 形状（`shape`）は末端地物（リーフ）のみが保持する。集約地物（コンテナ）は
 * `shape === undefined` で表現し、形状は下位領域の和として実行時に導出する。
 */
export class FeatureAnchor {
  readonly id: string;
  readonly timeRange: TimeRange;
  readonly property: AnchorProperty;
  readonly shape: FeatureShape | undefined;
  readonly placement: AnchorPlacement;

  constructor(
    id: string,
    timeRange: TimeRange,
    property: AnchorProperty,
    shape: FeatureShape | undefined,
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

  withShape(shape: FeatureShape | undefined): FeatureAnchor {
    return new FeatureAnchor(this.id, this.timeRange, this.property, shape, this.placement);
  }

  withPlacement(placement: AnchorPlacement): FeatureAnchor {
    return new FeatureAnchor(this.id, this.timeRange, this.property, this.shape, placement);
  }
}

/**
 * リーフ前提の関数で `FeatureAnchor.shape` を取り出すヘルパー。
 * `shape === undefined`（集約地物）のときは Error を投げる。
 * リーフ専用パスでの誤呼び出しを runtime で検知するための防御。
 */
export function requireLeafShape(anchor: FeatureAnchor): FeatureShape {
  if (anchor.shape === undefined) {
    throw new Error(
      `FeatureAnchor "${anchor.id}" has no shape (container anchor); leaf shape is required here`
    );
  }
  return anchor.shape;
}

/** 末端ポリゴン錨を絞り込んだ型: shape が必ず存在し Polygon として narrow 済み。 */
export type LeafPolygonAnchor = FeatureAnchor & {
  readonly shape: Extract<FeatureShape, { type: 'Polygon' }>;
};

/**
 * 末端ポリゴン地物の錨判定。
 * 要件定義書 §2.1「排他検証は末端地物同士のみ」「集約地物ペアに直接の非重複検証を実装しない」、
 * 開発ガイド §6.6.8「リーフ判定: shape を保持し childIds.length === 0 であることを必要十分条件とする」、
 * 現状.md §6.4「リーフ判定は『shape を保持し、子を持たない』を必要十分条件とする」に従う。
 *
 * 移行期間ノード（shape あり + childIds 非空）も false を返すため、
 * 排他検証 (`ConflictDetectionService`) や末端前提のバリデーション (`PolygonValidationService`)
 * から確実に除外できる。判定を1ヘルパーに集約することで検証経路間のドリフトを防ぐ。
 */
export function isLeafPolygonAnchor(anchor: FeatureAnchor): anchor is LeafPolygonAnchor {
  return anchor.shape?.type === 'Polygon' && anchor.placement.childIds.length === 0;
}

/**
 * 空コンテナ錨（shape なし + childIds 空）の判定。
 *
 * 不変条件「shape なし ⟹ childIds 非空」（要件定義書 §4.1 / 開発ガイド §6.6.8）に違反する
 * 一時状態であり、変異経路はこの錨を剪定して不変条件を変異後に再保証する。
 * 剪定述語を 1 ヘルパーへ集約し、所属変更経路（`ReassignFeatureParentUseCase` の
 * `pruneEmptyContainerAnchors`）と削除経路（`HierarchyService.sweepReferencesToDeleted`）の
 * 判定ドリフトを防ぐ（§6.6.9 の応用: 同じ結果状態の判定は同じ実装を共有する）。
 */
export function isEmptyContainerAnchor(anchor: FeatureAnchor): boolean {
  return anchor.shape === undefined && anchor.placement.childIds.length === 0;
}
