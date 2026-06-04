/**
 * ロード時のドメインオブジェクト検証
 *
 * `jsonSerializerValidation` が JSON 段階（デシリアライズ前）で行う構造的検証に対し、
 * 本モジュールはデシリアライズ後の `World`（ドメインオブジェクト）に対して行う
 * 幾何的整合性検証を担う。ドメインの形状導出サービス（`HierarchyService`）を
 * verbatim 再利用するため、JSON 段階ではなくこの段階で実行する。
 *
 * 要件定義書 §2.5.2「データ読み込み時の詳細な挙動」line 939
 * 「親領域の形状と下位領域の和の不一致」を検証する（現状.md §6.10 Phase 3-4）。
 */

import type { World } from '@domain/entities/World';
import type { Feature } from '@domain/entities/Feature';
import { TimePoint } from '@domain/value-objects/TimePoint';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import { deriveParentPolygons } from '@domain/services/HierarchyService';
import { multiPolygonsEquivalent } from '@domain/services/BooleanOperationService';
import { resolveOccupiedTerritories } from '@domain/services/ConflictDetectionService';

/**
 * 「親領域の形状 ≡ 下位領域の和（厳密一致）」をロード時に検証する。
 *
 * 要件定義書 §2.5.2 line 939 / §6.4「親 ≡ 子の和（厳密一致）。コンテナ内部の隙間は許容しない」。
 *
 * 検証対象は **移行期間ノード**（`shape` が Polygon かつ `childIds` 非空）のみ。
 *   - 純粋な集約地物（`shape` なし + `childIds` 非空）: 形状自体を保持せず子の和として
 *     導出されるため、親 ≡ 子の和は定義上常に成立する（検証不要）。
 *   - 末端地物（`shape` あり + `childIds` 空）: 子が無く比較対象が存在しない。
 * 移行期間ノードのみが「自身の保持形状」と「子の和」を同時に持ち、両者がずれ得る
 * （開発ガイド §6.6.8: リーフ判定の不変条件と整合）。
 *
 * placement / shape は錨ごとに時間依存のため（現状.md §6.2 / §6.3）、検証は単一時刻ではなく
 * 「全錨の境界時刻（start / end）で区切られた各時間スライス」で評価する
 * （`jsonSerializerValidation` の `validateHierarchyConsistency` / `validateLeafExclusivity` と同方式）。
 *
 * 子の和の算出は `HierarchyService.deriveParentPolygons` を再利用し、描画・ヒットテスト・
 * 派生サービスと同一の shape 解決経路を共有する（開発ガイド §6.6.9）。親自身の保持形状は
 * `ConflictDetectionService.resolveOccupiedTerritories` で「territory + 直下 hole」単位の
 * 占有ポリゴンへ解決し（§6.6.2）、`multiPolygonsEquivalent`（対称差が空か）で厳密比較する。
 *
 * 入れ子の移行期間ノードについての注意（推移的正しさ）:
 *   直接子もまた移行期間ノード（shape あり + childIds 非空）の場合、`deriveParentPolygons` は
 *   その直接子の寄与として「子自身の保持形状」ではなく「孫の和」を採用する
 *   （`HierarchyService.resolveChildPolygonsForUnion`: 派生優先・派生空時のみ shape へ fallback）。
 *   仕様「親 ≡ 直接の下位領域の和」とは文言上ずれて見えるが、当該直接子も別途このループで
 *   独立に検証され `子.shape ≡ 孫の和` が保証されるため、本検証の accept/reject の結論は
 *   推移的に正しい（違反時にどのノードのエラーとして報告されるかが変わるだけで、ロード拒否の
 *   結論は不変）。これは子の和の算出経路を `deriveParentShape` と1つに揃えた（§6.6.9）結果として
 *   自然に得られる性質。
 */
export function validateParentChildUnion(world: World): string[] {
  const errors: string[] = [];
  const features = [...world.features.values()];
  const vertexCoordinates = new Map<string, Coordinate>(
    [...world.vertices.values()].map((vertex) => [vertex.id, vertex.coordinate])
  );
  const resolveVertex = (vertexId: string): { x: number; y: number } | undefined => {
    const coordinate = vertexCoordinates.get(vertexId);
    return coordinate ? { x: coordinate.x, y: coordinate.y } : undefined;
  };

  const seen = new Set<string>();
  for (const time of collectBoundaryTimes(features)) {
    for (const feature of features) {
      if (feature.featureType !== 'Polygon') continue;

      const anchor = feature.getActiveAnchor(time);
      if (!anchor) continue;

      // 移行期間ノードのみが対象（shape あり Polygon + childIds 非空）。
      if (anchor.shape?.type !== 'Polygon') continue;
      if (anchor.placement.childIds.length === 0) continue;

      const childrenUnion = deriveParentPolygons(feature, features, vertexCoordinates, time);
      const ownTerritories = resolveOccupiedTerritories(anchor.shape.rings, resolveVertex);

      if (!multiPolygonsEquivalent(childrenUnion, ownTerritories)) {
        const message = `Feature "${feature.id}" anchor "${anchor.id}" stored shape does not equal the union of its children (parent ≡ children union violated)`;
        if (!seen.has(message)) {
          seen.add(message);
          errors.push(message);
        }
      }
    }
  }

  return errors;
}

/** 全錨の境界時刻（start / end）を時間スライスの breakpoint として収集する（compareTo で重複排除）。 */
function collectBoundaryTimes(features: readonly Feature[]): TimePoint[] {
  const times: TimePoint[] = [];
  const pushDistinct = (time: TimePoint): void => {
    if (!times.some((existing) => existing.compareTo(time) === 0)) {
      times.push(time);
    }
  };
  for (const feature of features) {
    for (const anchor of feature.anchors) {
      pushDistinct(anchor.timeRange.start);
      if (anchor.timeRange.end) {
        pushDistinct(anchor.timeRange.end);
      }
    }
  }
  return times;
}
