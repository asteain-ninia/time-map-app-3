/**
 * 階層ナビゲーション・形状導出ドメインサービス
 *
 * §2.1: 階層構造（上位領域・下位領域）に関する制約 — 親子関係ナビゲーション、形状導出、バリデーション
 * §5.2: HierarchyService — ツリー階層の管理。親子参照の整合性検証、最上位フラグ判定、
 *       階層深度の派生算出、末端地物・集約地物の判定。
 *
 * 面情報の親子関係（上位領域・下位領域）に関するドメインロジックを提供する。
 * ステートレスなユーティリティ関数群。
 *
 * ※ 旧モデルの「グローバル `Layer` 概念」は廃止されており、階層はツリー位置から派生する
 *    depth で表現する（詳細は現状.md §6）。
 */

import type { Feature } from '@domain/entities/Feature';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { createAnchorPlacement, isEmptyContainerAnchor } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from './GeometryService';
import { polygonUnionAll } from './BooleanOperationService';
import type { Coordinate } from '@domain/value-objects/Coordinate';

// ──────────────────────────────────────────
// 親子関係ナビゲーション
// ──────────────────────────────────────────

/**
 * 指定時間点での親地物を取得する
 *
 * §2.1: 面情報は同一時点で高々1つの上位面情報にのみ属する
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
 *
 * §6.4.14: 親子グラフを辿る再帰サービスは visited セットで cycle guard を入れる。
 * 壊れたデータ（循環親子参照）でもスタックオーバーフローせず有限結果を返す
 * （`validateJsonWorld` の循環検出を通らない手作りフィクスチャ等への二重防御）。
 */
export function getDescendants(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature[] {
  return getDescendantsInternal(feature, allFeatures, time, new Set([feature.id]));
}

/**
 * `getDescendants` の内部実装。visited セットで子方向連鎖の循環を遮断する（§6.4.14）。
 */
function getDescendantsInternal(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint,
  visited: ReadonlySet<string>
): Feature[] {
  const result: Feature[] = [];
  for (const child of getChildFeatures(feature, allFeatures, time)) {
    if (visited.has(child.id)) continue;
    result.push(child);
    result.push(
      ...getDescendantsInternal(child, allFeatures, time, new Set(visited).add(child.id))
    );
  }
  return result;
}

/**
 * 地物の全祖先を取得する（直接の親から順に上位へ）
 *
 * §6.4.14: 親子グラフを辿るので visited セットで cycle guard を入れる。
 * 壊れたデータ（循環親子参照）でも無限ループせず有限結果を返す
 * （`validateJsonWorld` の循環検出を通らない手作りフィクスチャ等への二重防御）。
 */
export function getAncestors(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): Feature[] {
  const result: Feature[] = [];
  const visited = new Set<string>([feature.id]);
  let current: Feature | undefined = feature;
  while (current) {
    const parent = getParentFeature(current, allFeatures, time);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    result.push(parent);
    current = parent;
  }
  return result;
}

/**
 * 指定時間点での階層深度（depth）を派生算出する
 *
 * §2.1 / 現状.md §6.3: depth は対象時刻における当該地物の有効錨のツリー位置から派生する派生値。
 * 地物自身に保持しない。
 *   - ルート（有効錨の `placement.parentId === null`）は depth = 0
 *   - 子は親地物の同時刻有効錨から導出した depth + 1
 *   - 用語: depth = 0 が最上位（国側、上）、depth 大が下位（基礎自治体側、下）
 *
 * §6.4.14: 親子グラフを辿る再帰サービスは visited セットで cycle guard を入れる。
 * 循環親子参照でも無限ループせず undefined を返す。
 *
 * 走査方向は子 → 親（`placement.parentId` を辿る片方向）。親側 `childIds` への
 * 双方向整合（親の `childIds` が当該地物を含むか）は `validateHierarchy` の責務であり、
 * 本関数はそれを前提とせず、`parentId` 連鎖のみで depth を算出する。
 *
 * @returns 派生 depth（0 以上の整数）。次のいずれかなら undefined:
 *   - 当該地物に対象時刻の有効錨がない（時間軸上で存在しない）
 *   - parentId が指す親地物が allFeatures に存在しない、または親の有効錨がない
 *   - 親方向の連鎖中に循環親子参照を検出（visited で再入遮断）
 */
export function deriveDepth(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint
): number | undefined {
  return deriveDepthInternal(feature, allFeatures, time, new Set());
}

/**
 * `deriveDepth` の内部実装。visited セットで親方向連鎖の循環を遮断する（§6.4.14）。
 */
function deriveDepthInternal(
  feature: Feature,
  allFeatures: readonly Feature[],
  time: TimePoint,
  visited: ReadonlySet<string>
): number | undefined {
  if (visited.has(feature.id)) {
    return undefined;
  }
  const anchor = feature.getActiveAnchor(time);
  if (!anchor) {
    return undefined;
  }
  if (anchor.placement.parentId === null) {
    return 0;
  }
  const parent = allFeatures.find((f) => f.id === anchor.placement.parentId);
  if (!parent) {
    return undefined;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(feature.id);

  const parentDepth = deriveDepthInternal(parent, allFeatures, time, nextVisited);
  if (parentDepth === undefined) {
    return undefined;
  }
  return parentDepth + 1;
}

// ──────────────────────────────────────────
// 形状導出
// ──────────────────────────────────────────

/**
 * 子地物の形状和（ユニオン）を計算する
 *
 * §2.1: 下位領域を持つ面情報の形状は下位領域の和として計算される
 * §6.6.9: 描画・ヒットテスト・派生サービスは同じ shape 解決経路を共有する
 *
 * 解決規則:
 * - 子地物が Polygon でない（Point / Line）ならスキップ
 * - 子が末端地物（`childIds` 空 + `shape` あり）: 自身の `shape.rings` を採用
 * - 子が `childIds` 非空（集約地物 / 移行期間ノード）: 再帰下降で孫の和を取得し、
 *   派生が空かつ自身の `shape` ありの移行期間ノードは fallback として `shape.rings` を採用
 * - 複数子の和は `polygonUnionAll` で算出し、離れた領土（MultiPolygon）を保持する（§6.6.5）
 * - 循環親子参照は visited セットで早期 return し無限再帰を防ぐ（§6.4.14）
 *
 * 戻り値の `rings` は polygon-clipping の MultiPolygon 結果を territory/hole の順で
 * フラット化したリング列。呼び出し側は evenodd 判定で複数領土を描画・hitTest できる。
 *
 * トップレベル呼び出しで派生が空（解決可能な子が無い）の場合、呼び出し側が
 * 「親自身の shape を fallback として使う（移行期間ノードの保険）」かどうかを判断する。
 * 本関数自身は子由来の純粋な和のみを返す（§6.6.9 の原則 = 親 ≡ 子の和）。
 *
 * @param vertices 頂点IDから座標を解決するマップ
 */
export function deriveParentShape(
  feature: Feature,
  allFeatures: readonly Feature[],
  vertices: ReadonlyMap<string, Coordinate>,
  time: TimePoint
): DerivedShapeResult {
  const polygons = deriveParentPolygonsInternal(feature, allFeatures, vertices, time, new Set());
  if (polygons.length === 0) {
    return { rings: [], isEmpty: true };
  }

  // MultiPolygon を territory/hole の順でフラット化（呼び出し側の evenodd 判定で扱う）
  const flatRings: RingCoords[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      flatRings.push(ring);
    }
  }

  return {
    rings: flatRings,
    isEmpty: flatRings.length === 0,
  };
}

/**
 * 子地物の形状和を MultiPolygon 構造（`RingCoords[][]`）のまま導出する。
 *
 * `deriveParentShape` がトップレベルでフラット化する前の結果を公開する版。
 * フラット化すると territory/hole の polygon 境界が失われ、polygon-clipping での
 * 厳密な集合演算（対称差による「親 ≡ 子の和」検証など）が正しく行えないため、
 * MultiPolygon 構造を保ったまま受け取りたい呼び出し側（ロード時の親 ≡ 子の和検証）が使う。
 *
 * `deriveParentShape` と同一の内部再帰 `deriveParentPolygonsInternal` を共有するため、
 * 子の和の解決規則（リーフ / 集約地物 / 移行期間ノードの fallback・cycle guard）は
 * 両者で完全に一致する（開発ガイド §6.6.9: 派生サービスは同じ shape 解決経路を共有する）。
 */
export function deriveParentPolygons(
  feature: Feature,
  allFeatures: readonly Feature[],
  vertices: ReadonlyMap<string, Coordinate>,
  time: TimePoint
): readonly RingCoords[][] {
  return deriveParentPolygonsInternal(feature, allFeatures, vertices, time, new Set());
}

/**
 * `deriveParentShape` の内部実装。MultiPolygon 構造（`RingCoords[][]`）を保持したまま再帰し、
 * 子の polygon 集合を集約地物に持ち上げる。visited セットで循環親子参照に対する cycle guard を
 * 行い、既訪問の地物を辿ろうとした場合は空配列で早期 return し無限再帰を防ぐ（§6.4.14）。
 *
 * 再帰中に rings をフラット化すると孫の MultiPolygon を再度親 polygon の hole として
 * 誤解釈してしまうため、トップレベルの公開 API でのみフラット化する。
 */
function deriveParentPolygonsInternal(
  feature: Feature,
  allFeatures: readonly Feature[],
  vertices: ReadonlyMap<string, Coordinate>,
  time: TimePoint,
  visited: ReadonlySet<string>
): readonly RingCoords[][] {
  if (visited.has(feature.id)) {
    return [];
  }
  const nextVisited = new Set(visited);
  nextVisited.add(feature.id);

  const children = getChildFeatures(feature, allFeatures, time);
  if (children.length === 0) {
    return [];
  }

  // 各子について解決済み polygon 群を収集。MultiPolygon を持つ子は polygon 単位で広げる。
  const childPolygons: RingCoords[][] = [];
  for (const child of children) {
    if (child.featureType !== 'Polygon') continue;
    const childAnchor = child.getActiveAnchor(time);
    if (!childAnchor) continue;

    const polygons = resolveChildPolygonsForUnion(
      child,
      childAnchor,
      allFeatures,
      vertices,
      time,
      nextVisited
    );
    for (const polygon of polygons) {
      if (polygon.length > 0) childPolygons.push(polygon);
    }
  }

  if (childPolygons.length === 0) {
    return [];
  }

  const union = polygonUnionAll(childPolygons);
  if (union.isEmpty) {
    return [];
  }
  return union.polygons.map((polygon) => polygon.map((ring) => [...ring]));
}

/**
 * 子地物 1 個分の polygon 群を解決する。MultiPolygon 構造（`RingCoords[][]`）を保持する。
 * `childIds` 非空（集約地物 / 移行期間ノード）は再帰下降を優先し、派生空かつ
 * 自身に `shape` を持つ移行期間ノードは `shape.rings` を fallback として返す（§6.6.9）。
 */
function resolveChildPolygonsForUnion(
  child: Feature,
  childAnchor: FeatureAnchor,
  allFeatures: readonly Feature[],
  vertices: ReadonlyMap<string, Coordinate>,
  time: TimePoint,
  visited: ReadonlySet<string>
): readonly RingCoords[][] {
  if (childAnchor.placement.childIds.length > 0) {
    const derived = deriveParentPolygonsInternal(child, allFeatures, vertices, time, visited);
    if (derived.length > 0) {
      return derived;
    }
    if (childAnchor.shape && childAnchor.shape.type === 'Polygon') {
      return resolvePolygonAnchorPolygons(childAnchor, vertices);
    }
    return [];
  }

  if (!childAnchor.shape || childAnchor.shape.type !== 'Polygon') {
    return [];
  }
  return resolvePolygonAnchorPolygons(childAnchor, vertices);
}

/** 形状導出結果 */
export interface DerivedShapeResult {
  readonly rings: readonly RingCoords[];
  readonly isEmpty: boolean;
}

/**
 * ポリゴン錨の rings を polygon-clipping 互換の「1 territory + 直下の holes」単位へ
 * 解決する（§6.6.2: 複数領土リングを平坦化しない）。
 *
 * 飛び地など territory が複数ある錨を `polygonUnionAll` へ渡す際、フラットな
 * `RingCoords[]` として渡すと polygon-clipping が 2 本目以降の territory を hole として
 * 誤解釈する。各 territory ごとに `[territory, ...holes]` の polygon を作って分離する。
 * holes は `parentId` で territory に紐付け、所属が無い hole（不正データ）は捨てる。
 * 欠落頂点・3 頂点未満の退化リングは除外する（解決不能な ring を結果へ混入させない）。
 *
 * export する理由（§6.6.9）: 末端→集約遷移の直轄領差分（`ReassignFeatureParentUseCase`）で
 * 旧形状（subject）と子の和（clip = `deriveParentPolygons`）を同一の解決規則で揃えるため、
 * subject 側も本関数で解決する。subject/clip で別解決器を使うと退化データで非対称が生じる。
 *
 * @internal 上記の subject/clip 統一のための限定 export（バレル `services/index.ts` には
 * 再エクスポートしない運用）。新規 consumer は本関数を直接 import する前に、
 * `deriveParentShape` / `deriveParentPolygons` など経路統合済みの公開 API で
 * 賄えないかを先に検討すること（§6.6.9: shape 解決経路の分散はドリフトの温床）。
 */
export function resolvePolygonAnchorPolygons(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Coordinate>
): RingCoords[][] {
  if (!anchor.shape || anchor.shape.type !== 'Polygon') return [];

  const resolved = anchor.shape.rings.map((ring) => ({
    id: ring.id,
    ringType: ring.ringType,
    parentId: ring.parentId,
    coords: ring.vertexIds
      .map((vid) => {
        const coord = vertices.get(vid);
        return coord ? { x: coord.x, y: coord.y } : null;
      })
      .filter((p): p is { x: number; y: number } => p !== null),
  }));

  const holesByParentId = new Map<string, RingCoords[]>();
  for (const ring of resolved) {
    if (ring.ringType !== 'hole' || ring.parentId === null) continue;
    if (ring.coords.length < 3) continue;
    if (!holesByParentId.has(ring.parentId)) {
      holesByParentId.set(ring.parentId, []);
    }
    holesByParentId.get(ring.parentId)!.push(ring.coords);
  }

  return resolved
    .filter((ring) => ring.ringType === 'territory' && ring.coords.length >= 3)
    .map((ring) => [ring.coords, ...(holesByParentId.get(ring.id) ?? [])]);
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

/**
 * 末端地物 → 集約地物の遷移で自動生成される直轄領のデフォルト名称を構築する
 * （要件定義書 §2.1 line 228「直轄領のデフォルト名称は『`<元の末端地物名> 直轄領`』」）。
 *
 * この命名規則はドメインのルールであり、application 層（`ReassignFeatureParentUseCase`
 * の直轄領生成）と presentation 層（`parentTransferDialogUtils.resolveDirectlyGovernedDefault`
 * の上書き UI プレフィル）の双方が同じ既定値を必要とする。文字列表現を 2 箇所に独立ハードコード
 * すると両者がドリフトし得るため、ドメイン（両層が依存する共有カーネル）の本関数に一元化する
 * （開発ガイド §6.0.1 検出観点2「対概念の同期」のコード版。層をまたぐ型依存は避けつつ、
 * 値生成ロジックはドメインで共有する）。
 *
 * 元名が空（前後空白のみ含む）の場合は先頭空白を避け「直轄領」のみを返す。
 */
export function buildDirectlyGovernedDefaultName(originalName: string): string {
  return originalName.trim() === '' ? '直轄領' : `${originalName} 直轄領`;
}

// ──────────────────────────────────────────
// 階層維持操作
// ──────────────────────────────────────────

/** 地物削除計画（`planFeatureRemoval` の算出結果） */
export interface FeatureRemovalPlan {
  /** 削除すべき地物ID群（削除起点 + 全錨剪定で連鎖消滅する集約地物） */
  readonly deletedFeatureIds: readonly string[];
  /** 参照掃除・錨剪定で更新される残存地物（更新後の状態） */
  readonly modifiedFeatures: readonly Feature[];
}

/**
 * 地物削除に伴う階層参照の掃除計画を算出する（削除 = 全時間軸からの消滅）
 *
 * §2.1: 面情報の削除は、全時刻を通じてその地物の下位領域・上位領域への参照を持つ
 * 他の地物が存在しないか、削除に伴う再編が許容される場合にのみ可能とする。
 * 集約地物が下位領域を全て失った場合は自動的に消滅する。
 *
 * 削除対象への参照（`placement.parentId` / `placement.childIds`）を残存する全地物の
 * **全錨**（特定時刻の有効錨に限定しない）から除去する。参照除去の結果
 * 「shape なし・childIds 空」となったコンテナ錨は剪定し（「shape なし ⟹ childIds 非空」
 * 不変条件の変異後保証）、全錨が剪定された集約地物は連鎖的に削除対象へ加える。
 * shape を保持する錨は childIds が空になっても残る（末端地物へ戻るだけで有効な状態）。
 *
 * 純粋関数であり `features` は変異しない。呼び出し側が計画を live マップへ反映し、
 * touch した全地物へイベントを対称に発火する（§6.4.16。`applyFeatureRemoval` 参照）。
 *
 * @param featureId 削除起点の地物ID
 * @param features 全地物マップ（削除起点を含む現在の状態）
 */
export function planFeatureRemoval(
  featureId: string,
  features: ReadonlyMap<string, Feature>
): FeatureRemovalPlan {
  const working = new Map(features);
  const deletedFeatureIds: string[] = [];
  const queue: string[] = [featureId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!working.delete(id)) continue; // 連鎖で重複キューされた場合は一度だけ処理
    deletedFeatureIds.push(id);

    for (const [otherId, other] of working) {
      const swept = sweepReferencesToDeleted(other, id);
      if (swept === other) continue; // 参照なし
      if (swept === null) {
        // 全錨が空コンテナ化 → 連鎖消滅（dequeue 時に削除し、この地物への参照も掃除する）
        queue.push(otherId);
      } else {
        working.set(otherId, swept);
      }
    }
  }

  // 連鎖消滅した地物が途中で modified 扱いになっていても、最終状態（working 残存 + 変化あり）だけを返す
  const modifiedFeatures = [...working.values()].filter(
    (f) => features.get(f.id) !== f
  );
  return { deletedFeatureIds, modifiedFeatures };
}

/**
 * 1地物の全錨から削除地物への参照を除去し、空化したコンテナ錨を剪定する。
 *
 * @returns 参照が無ければ引数と同一インスタンス、全錨が剪定されたら null（地物ごと消滅）、
 *          それ以外は更新後の地物
 */
function sweepReferencesToDeleted(feature: Feature, deletedId: string): Feature | null {
  let changed = false;
  const sweptAnchors: FeatureAnchor[] = [];
  for (const anchor of feature.anchors) {
    const placement = anchor.placement;
    const referencesAsParent = placement.parentId === deletedId;
    const referencesAsChild = placement.childIds.includes(deletedId);
    if (!referencesAsParent && !referencesAsChild) {
      sweptAnchors.push(anchor);
      continue;
    }
    changed = true;
    sweptAnchors.push(
      anchor.withPlacement(
        createAnchorPlacement(
          referencesAsParent ? null : placement.parentId,
          referencesAsChild
            ? placement.childIds.filter((cid) => cid !== deletedId)
            : placement.childIds
        )
      )
    );
  }
  if (!changed) return feature;

  const pruned = sweptAnchors.filter((anchor) => !isEmptyContainerAnchor(anchor));
  if (pruned.length === 0) return null;
  return feature.withAnchors(pruned);
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
      parentActive.placement.parentId,
      [...parentActive.placement.childIds, childFeature.id]
    )
  );

  const updatedChildAnchor = childActive.withPlacement(
    createAnchorPlacement(
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
      parentActive.placement.parentId,
      parentActive.placement.childIds.filter(id => id !== childFeature.id)
    )
  );

  const updatedChildAnchor = childActive.withPlacement(
    createAnchorPlacement(
      null,
      childActive.placement.childIds
    )
  );

  return {
    parentAnchor: updatedParentAnchor,
    childAnchor: updatedChildAnchor,
  };
}
