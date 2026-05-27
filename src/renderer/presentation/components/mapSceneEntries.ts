import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor, FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import type { RingCoords } from '@domain/services/GeometryService';
import { deriveDepth, deriveParentShape } from '@domain/services/HierarchyService';

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
 * 入力）。depth 昇順（親→子）でソート後に 0 始まりで割り当てる。
 *
 * **規約 (Phase 2.5-B 以降)**: `polygonRings` フィールドは「polygon-like 判定」の唯一の
 * 真実とする（開発ガイド §6.6.9 適用パターン: 判定をデータ側に寄せる）:
 *   - Polygon entry: 必ず `polygonRings !== null`（リーフで vertex 解決失敗時は `[]` 空配列で
 *     non-null。コンテナ・移行期間ノードは派生形状を解決済みで保持。派生空かつ shape なしの
 *     entry は `collectMapSceneEntries` で生成自体されない）
 *   - Point / LineString entry: 必ず `polygonRings === null`
 *
 * この規約により、描画 (`FeatureRenderer`)・ヒットテスト (`hitTestUtils`)・ラベル
 * (`LabelRenderer`)・wrapOffsets (`mapCanvasUtils`) の 4 経路は `entry.polygonRings !== null`
 * で polygon-like か否かを判定でき、判定基準のドリフトを構造的に排除する。
 *
 * `polygonRings` の解決規則は描画・hitTest・wrapOffsets が共通で使う「解決済み座標列」
 * （territory/hole の階層は配列順で保持。evenodd 判定で扱う）:
 *   - リーフ（`shape` あり + `childIds` 空）: 自身の `shape.rings` の vertexIds を vertexCoordinates で解決
 *   - 集約地物（`shape` なし + `childIds` 非空）: `deriveParentShape` の派生形状を採用。
 *     派生が空（子が解決不能）ならエントリ自体を生成しない（描画も hitTest も対象外）。
 *   - 移行期間ノード（`shape` あり + `childIds` 非空）: 派生形状を優先し、派生が空のときのみ
 *     自身の `shape.rings` を fallback として採用。
 */
export interface MapSceneEntry {
  readonly feature: Feature;
  readonly anchor: FeatureAnchor;
  readonly featureIndex: number;
  readonly polygonRings: PolygonRings | null;
}

/**
 * 現在時刻でアクティブな錨を持ち、描画可能な地物を地図全体で収集する。
 *
 * 含めない:
 * - 現在時刻でアクティブな錨が無い地物
 * - Point / LineString で `shape` を持たない地物（仕様上ありえない壊れたデータの保険）
 * - 集約地物で派生形状が空（子が解決不能）の地物
 *
 * 並び順は depth 昇順（親→子）でソートする（開発ガイド §6.6.9 / 現状.md §6.10 Phase 2.5-B）:
 *   - SVG では後ろの要素ほど手前に描画されるため、親（depth 小）が先 → 子（depth 大）が後で
 *     描画される。これにより視覚的に子が親を覆って見える適切な重なり順となる。
 *   - hitTest は sceneEntries を順次走査して最初にヒットした要素を返す。depth 昇順走査では
 *     親が先にヒットするが、子のクリックでも親背景が干渉しないようにする tie-break は
 *     Phase 2.5-C で DOM target ベースに再設計する計画。
 *   - depth が undefined（壊れたデータ）は最後尾へ送る。同一 depth は features 入力順を保持
 *     する（Array.sort は ECMAScript 2019 で stable 化済み）。
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

  // 1. 描画可能な地物を入力順で収集（featureIndex は depth 順ソート後に割り当てる）
  const collected: Array<{ feature: Feature; anchor: FeatureAnchor; polygonRings: PolygonRings | null }> = [];
  for (const feature of features) {
    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) continue;

    if (feature.featureType === 'Polygon') {
      const polygonRings = resolvePolygonRings(feature, anchor, features, vertexCoordinates, currentTime);
      // 集約地物で派生空 / 不正データ → entries に含めない（描画不能・hitTest 対象外）
      if (polygonRings === null) continue;
      // リーフで vertex 解決失敗（polygonRings === []）は entries に含める（旧挙動維持）。
      // 描画パスでは d="" で空描画、hitTest は空リングで非ヒット、wrapOffsets は空。
      collected.push({ feature, anchor, polygonRings });
    } else {
      // Point / LineString は shape 必須（壊れたデータの保険）
      if (!anchor.shape) continue;
      collected.push({ feature, anchor, polygonRings: null });
    }
  }

  // 2. depth 昇順でソート（親→子）。undefined は最後尾へ
  const depthMap = new Map<string, number>();
  for (const { feature } of collected) {
    depthMap.set(feature.id, deriveDepth(feature, features, currentTime) ?? Number.POSITIVE_INFINITY);
  }
  collected.sort((a, b) => {
    const da = depthMap.get(a.feature.id) ?? Number.POSITIVE_INFINITY;
    const db = depthMap.get(b.feature.id) ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  // 3. 連番 featureIndex を割り当てる
  return collected.map((c, idx) => ({
    feature: c.feature,
    anchor: c.anchor,
    featureIndex: idx,
    polygonRings: c.polygonRings,
  }));
}

/**
 * Polygon entry の描画用 rings を解決する。
 * - リーフ（`shape` あり + `childIds` 空）: 自身の `shape.rings` を採用
 * - 集約地物（`shape` なし + `childIds` 非空）: 派生形状を採用。派生空なら null
 * - 移行期間ノード（`shape` あり + `childIds` 非空）: 派生形状を優先し、派生空なら自身の `shape.rings` を fallback
 * - その他（`shape` なし + `childIds` 空 = 不正データ）: null
 */
function resolvePolygonRings(
  feature: Feature,
  anchor: FeatureAnchor,
  features: readonly Feature[],
  vertexCoordinates: ReadonlyMap<string, Coordinate>,
  currentTime: TimePoint
): PolygonRings | null {
  const hasShape = anchor.shape?.type === 'Polygon';
  const hasChildren = anchor.placement.childIds.length > 0;

  if (hasShape && !hasChildren) {
    return resolveAnchorPolygonRings(anchor.shape as FeatureShape & { type: 'Polygon' }, vertexCoordinates);
  }

  if (hasChildren) {
    const derived = deriveParentShape(feature, features, vertexCoordinates, currentTime);
    if (!derived.isEmpty) {
      return derived.rings;
    }
    // 派生空: 移行期間ノードなら shape を fallback、集約地物（shape なし）なら描画不能
    if (hasShape) {
      return resolveAnchorPolygonRings(anchor.shape as FeatureShape & { type: 'Polygon' }, vertexCoordinates);
    }
    return null;
  }

  return null;
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
