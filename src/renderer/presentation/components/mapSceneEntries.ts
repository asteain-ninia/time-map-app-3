import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { RingCoords } from '@domain/services/GeometryService';
import { deriveParentShape } from '@domain/services/HierarchyService';

/**
 * sceneEntries の Polygon entry が持つ解決済み描画用 rings 座標。
 * 描画・hitTest・wrapOffsets・LabelRenderer の 4 経路が共通でこの型を参照することで、
 * 「描画される領域 = 選択できる領域 = ラベル位置の基準形状」を構造的に保証する
 * （開発ガイド §6.6.9）。`RingCoords` のエイリアスとして公開し、消費者は同じ型名で
 * 受け取れるようにする（型表記ぶれによる対概念リスクを抑制）。
 */
export type PolygonRings = ReadonlyArray<RingCoords>;

/**
 * 地図上で同時に「描画される / クリック選択される / 頂点所有者になる / wrapOffsets 算出に
 * 寄与する」地物を表す共通エントリ。
 *
 * 描画・ヒットテスト・頂点選択コンテキスト・wrapOffsets はこの sceneEntry 列のみを
 * 参照する。`features` 配列を直接走査して経路ごとに別フィルタをかけると、
 * 「画面に描画されないがクリック選択できる」「描画はされるが wrapOffsets に
 * 含まれない」等の対概念矛盾が発生するため（開発ガイド §6.1.2 / §6.6.9 / §6.0.1 検出観点2）、
 * 単一の中間表現として集約する。
 *
 * `featureIndex` は表示文脈下の連番（自動配色・Point/LineString のパレット index などの
 * 入力）。`features` 入力順を保持し、含まれた地物に 0 始まりで割り当てる。
 *
 * `polygonRings` は Polygon の場合のみ非 null で、描画・hitTest・wrapOffsets が共通で
 * 使う「解決済み座標列」（territory/hole の階層は配列順で保持。evenodd 判定で扱う）。
 * 開発ガイド §6.6.9: 「描画される領域 = 選択できる領域 = ラベル位置の基準形状」を
 * 保証するため、3 経路すべてがこの解決済み座標列を参照する:
 *   - リーフ (`childIds.length === 0`): 自身の `shape.rings` の vertexIds を vertexCoordinates で解決
 *   - childIds 非空（コンテナ・移行期間ノード）: `deriveParentShape` の派生形状を優先。
 *     派生が空かつ `shape` あり（shape あり + childIds 非空 = 移行期間ノード）は自身の
 *     `shape.rings` 解決を fallback。`shape` なし + 派生空 はコンテナ未充足のため null
 */
export interface MapSceneEntry {
  readonly feature: Feature;
  readonly anchor: FeatureAnchor;
  readonly featureIndex: number;
  readonly polygonRings: PolygonRings | null;
}

/**
 * 現在時刻でアクティブな錨を持ち shape を保持する地物を、地図全体で収集する。
 *
 * 含めない:
 * - 現在時刻でアクティブな錨が無い地物
 * - 錨が shape プロパティを持たない地物（コンテナ）
 *
 * レイヤー可視性によるフィルタは持たない。可視性は今後、深度フォーカス（Phase 5）または
 * 個別 style（Phase 6）で表現する想定。
 *
 * Polygon entry の `polygonRings` は描画・hitTest・wrapOffsets で共通利用するため、
 * 本関数内で `vertexCoordinates` と `deriveParentShape` を用いて解決済みで持たせる。
 */
export function collectMapSceneEntries(
  features: readonly Feature[],
  currentTime: TimePoint | undefined,
  vertexCoordinates: ReadonlyMap<string, Coordinate>
): readonly MapSceneEntry[] {
  if (!currentTime) return [];
  const entries: MapSceneEntry[] = [];
  for (const feature of features) {
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor || !anchor.shape) continue;

    const polygonRings =
      anchor.shape.type === 'Polygon'
        ? resolvePolygonRings(feature, anchor, anchor.shape, features, vertexCoordinates, currentTime)
        : null;

    entries.push({ feature, anchor, featureIndex: entries.length, polygonRings });
  }
  return entries;
}

/**
 * Polygon entry の描画用 rings を解決する。
 * リーフは自身の shape.rings を、childIds 非空は派生形状を優先し空なら shape fallback。
 */
function resolvePolygonRings(
  feature: Feature,
  anchor: FeatureAnchor,
  shape: FeatureShape & { type: 'Polygon' },
  features: readonly Feature[],
  vertexCoordinates: ReadonlyMap<string, Coordinate>,
  currentTime: TimePoint
): PolygonRings | null {
  if (anchor.placement.childIds.length === 0) {
    return resolveAnchorPolygonRings(shape, vertexCoordinates);
  }

  // childIds 非空: 派生形状を優先（コンテナ / 移行期間ノード）
  const derived = deriveParentShape(feature, features, vertexCoordinates, currentTime);
  if (!derived.isEmpty) {
    return derived.rings;
  }

  // 派生が空 + shape あり = 移行期間ノードの fallback（描画は自身の shape を使う）
  return resolveAnchorPolygonRings(shape, vertexCoordinates);
}

/**
 * `shape.rings` の vertexIds を vertexCoordinates で解決し、3 頂点未満のリングを除外する。
 */
function resolveAnchorPolygonRings(
  shape: FeatureShape & { type: 'Polygon' },
  vertexCoordinates: ReadonlyMap<string, Coordinate>
): PolygonRings {
  const result: RingCoords[] = [];
  for (const ring of shape.rings) {
    const coords: { x: number; y: number }[] = [];
    for (const vid of ring.vertexIds) {
      const c = vertexCoordinates.get(vid);
      if (c) coords.push({ x: c.x, y: c.y });
    }
    if (coords.length >= 3) {
      result.push(coords);
    }
  }
  return result;
}
