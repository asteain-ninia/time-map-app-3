import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { Ring, type RingType } from '@domain/value-objects/Ring';
import { isSelfIntersecting, type RingCoords } from '@domain/services/GeometryService';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import {
  resolveOccupiedTerritories,
  territorySetsOverlap,
} from '@domain/services/ConflictDetectionService';
import type {
  JsonFeature,
  JsonFeatureAnchor,
  JsonRing,
  JsonTimePoint,
  JsonWorld,
} from './jsonSerializerTypes';

const COORDINATE_EPSILON = 1e-9;

function validateOrphanedVertices(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertexIds = new Set(json.vertices.map((vertex) => vertex.id));

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!anchor.shape) continue;
      if (anchor.shape.type === 'Point' && anchor.shape.vertexId) {
        if (!vertexIds.has(anchor.shape.vertexId)) {
          errors.push(`Feature "${feature.id}" references non-existent vertex "${anchor.shape.vertexId}"`);
        }
      }
      if (anchor.shape.type === 'LineString' && anchor.shape.vertexIds) {
        for (const vertexId of anchor.shape.vertexIds) {
          if (!vertexIds.has(vertexId)) {
            errors.push(`Feature "${feature.id}" references non-existent vertex "${vertexId}"`);
          }
        }
      }
      if (anchor.shape.type === 'Polygon' && anchor.shape.rings) {
        for (const ring of anchor.shape.rings) {
          for (const vertexId of ring.vertexIds) {
            if (!vertexIds.has(vertexId)) {
              errors.push(`Feature "${feature.id}" ring "${ring.id}" references non-existent vertex "${vertexId}"`);
            }
          }
        }
      }
    }
  }

  return errors;
}

function validateTimeRanges(json: JsonWorld): string[] {
  const errors: string[] = [];

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!anchor.timeRange.end) {
        continue;
      }

      const start = new TimePoint(
        anchor.timeRange.start.year,
        anchor.timeRange.start.month,
        anchor.timeRange.start.day
      );
      const end = new TimePoint(
        anchor.timeRange.end.year,
        anchor.timeRange.end.month,
        anchor.timeRange.end.day
      );
      if (end.isBefore(start)) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" has end time before start time`
        );
      }
    }
  }

  return errors;
}

function validatePlacementInvariants(json: JsonWorld): string[] {
  const errors: string[] = [];

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      const expected = anchor.placement.parentId === null;
      if (anchor.placement.isTopLevel !== expected) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" placement.isTopLevel must equal (parentId === null)`
        );
      }
    }
  }

  return errors;
}

function validateSharedVertexGroups(json: JsonWorld): string[] {
  const errors: string[] = [];
  const verticesById = new Map(json.vertices.map((vertex) => [vertex.id, vertex]));
  const vertexGroupIds = new Map<string, string>();

  for (const group of json.sharedVertexGroups ?? []) {
    if (group.vertexIds.length < 2) {
      errors.push(`Shared vertex group "${group.id}" must contain at least 2 vertices`);
    }

    for (const duplicateVertexId of findDuplicates(group.vertexIds)) {
      errors.push(`Shared vertex group "${group.id}" contains duplicate vertex "${duplicateVertexId}"`);
    }

    for (const vertexId of group.vertexIds) {
      const previousGroupId = vertexGroupIds.get(vertexId);
      if (previousGroupId && previousGroupId !== group.id) {
        errors.push(
          `Vertex "${vertexId}" belongs to multiple shared vertex groups ("${previousGroupId}" and "${group.id}")`
        );
      }
      vertexGroupIds.set(vertexId, group.id);

      const vertex = verticesById.get(vertexId);
      if (!vertex) {
        errors.push(`Shared vertex group "${group.id}" references non-existent vertex "${vertexId}"`);
        continue;
      }

      if (
        !coordinatesEqual(vertex.x, group.representativeCoordinate.x) ||
        !coordinatesEqual(vertex.y, group.representativeCoordinate.y)
      ) {
        errors.push(
          `Shared vertex group "${group.id}" vertex "${vertexId}" coordinate does not match representativeCoordinate`
        );
      }
    }
  }

  return errors;
}

function validatePolygons(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertices = new Map(
    json.vertices.map((vertex) => [
      vertex.id,
      new Vertex(vertex.id, new Coordinate(vertex.x, vertex.y)),
    ])
  );

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!anchor.shape) {
        continue;
      }
      if (anchor.shape.type !== 'Polygon') {
        continue;
      }
      if (!anchor.shape.rings) {
        continue;
      }

      const rings = anchor.shape.rings;
      const anchorErrors = validatePolygonRings(feature.id, anchor.id, rings, vertices);
      errors.push(...anchorErrors);
    }
  }

  return errors;
}

function validatePolygonRings(
  featureId: string,
  anchorId: string,
  jsonRings: readonly JsonRing[],
  vertices: ReadonlyMap<string, Vertex>
): string[] {
  const errors: string[] = [];
  const validRings: Ring[] = [];
  let canRunGeometryValidation = true;

  for (const duplicateRingId of findDuplicates(jsonRings.map((ring) => ring.id))) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}" contains duplicate ring "${duplicateRingId}"`);
    canRunGeometryValidation = false;
  }

  if (!jsonRings.some((ring) => ring.ringType === 'territory' && ring.parentId === null)) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}" polygon requires a top-level territory ring`);
  }

  for (const ring of jsonRings) {
    let ringIsValidForGeometry = true;

    if (ring.vertexIds.length < 3) {
      errors.push(`Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" requires at least 3 vertices`);
      ringIsValidForGeometry = false;
    }

    for (const duplicateVertexId of findDuplicates(ring.vertexIds)) {
      errors.push(
        `Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" contains duplicate vertex "${duplicateVertexId}"`
      );
      ringIsValidForGeometry = false;
    }

    if (!isRingType(ring.ringType)) {
      errors.push(
        `Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" has unknown ring type "${ring.ringType}"`
      );
      ringIsValidForGeometry = false;
    }

    if (ring.vertexIds.some((vertexId) => !vertices.has(vertexId))) {
      ringIsValidForGeometry = false;
    }

    if (!ringIsValidForGeometry) {
      canRunGeometryValidation = false;
      continue;
    }

    validRings.push(new Ring(ring.id, ring.vertexIds, ring.ringType, ring.parentId));
  }

  if (!canRunGeometryValidation) {
    return errors;
  }

  for (const ring of validRings) {
    if (isSelfIntersecting(resolveRingCoords(ring, vertices))) {
      errors.push(`Feature "${featureId}" anchor "${anchorId}" ring "${ring.id}" is self-intersecting`);
    }
  }

  for (const error of validatePolygonRingHierarchy(validRings, vertices)) {
    errors.push(`Feature "${featureId}" anchor "${anchorId}": ${error.message}`);
  }

  return errors;
}

/**
 * 単一錨内で `shape` の有無と `featureType` ↔ `shape.type` の整合を検証する。
 * 要件定義書 §4.1 のスコープ:
 *   - `shape === undefined` ⟹ `featureType === 'Polygon'` かつ `placement.childIds.length > 0`（コンテナ）
 *   - `shape !== undefined` ⟹ `featureType` と `shape.type` が整合（Point↔Point / Line↔LineString / Polygon↔Polygon）
 * 子参照健全性（参照の存在・Polygon 型）は `validateHierarchyReferences`、
 * 親子相互整合・循環検出（時間スライス）は `validateHierarchyConsistency`、
 * リーフ排他（地図全体）は `validateLeafExclusivity` が担う。
 * 親 ≡ 子の和は後続フェーズ（Phase 3-4）のスコープ。
 */
function validateShapePresence(json: JsonWorld): string[] {
  const errors: string[] = [];

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      const shape = anchor.shape;

      if (shape === undefined) {
        if (feature.featureType !== 'Polygon') {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" of type "${feature.featureType}" requires a shape`
          );
          continue;
        }
        if (anchor.placement.childIds.length === 0) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" has no shape but is not a container (childIds is empty)`
          );
        }
        continue;
      }

      const expected = expectedShapeTypeFor(feature.featureType);
      if (expected !== null && shape.type !== expected) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" shape.type "${shape.type}" does not match featureType "${feature.featureType}"`
        );
      }
    }
  }

  return errors;
}

function expectedShapeTypeFor(featureType: string): string | null {
  if (featureType === 'Point') return 'Point';
  if (featureType === 'Line') return 'LineString';
  if (featureType === 'Polygon') return 'Polygon';
  return null;
}

/**
 * 階層参照（`placement.parentId` / `placement.childIds`）の構造的健全性を検証する。
 *
 * 要件定義書 §2.5.2「データ読み込み時の詳細な挙動」のデータ整合性チェック項目
 * 「ツリー位相の不整合（…子の親側参照欠落、親の子側参照欠落 など）」のうち、
 * **各錨ローカルで完結する参照整合のみ**を対象とする。
 *
 * §2.1: 集約地物（下位領域を持つ面情報）・上位領域を担えるのは面情報（Polygon）のみ。
 * §4.1: shape は末端地物のみ保持し、集約地物は Polygon。
 * 開発ガイド §6.6.8: childIds-only のリーフ判定経路は「shape なし ⟹ childIds 非空」+
 *   「子・親は Polygon」という不変条件群に依存する。本関数が参照整合側を担保する。
 *
 * 検証内容（すべて単一錨内で完結）:
 *   - `parentId !== null` のとき:
 *       - 当該地物自身が Polygon であること（階層に参加できるのは面情報のみ。
 *         §2.1 line 160「線情報と点情報は面情報との干渉を受けない」）
 *       - 自身を親として指していないこと（自己参照禁止）
 *       - 指す先の地物が存在すること
 *       - 指す先の地物が Polygon であること（上位領域は集約地物 = Polygon のみ）
 *   - `childIds`:
 *       - 重複が無いこと
 *       - 自身を子として含まないこと（自己参照禁止）
 *       - 各 ID が指す地物が存在すること
 *       - 各 ID が指す地物が Polygon であること
 *   - `childIds` が非空のとき、当該地物自身が Polygon であること（集約地物は Polygon のみ）
 *
 * 親子相互整合（双方向の参照欠落・時間区間カバレッジ）と循環検出（時間スライス）は
 * `validateHierarchyConsistency`（Phase 3-2）、リーフ排他（地図全体）は
 * `validateLeafExclusivity`（Phase 3-3）が担う。
 * スコープ外（後続サブフェーズ）: 親 ≡ 子の和（Phase 3-4）。
 */
function validateHierarchyReferences(json: JsonWorld): string[] {
  const errors: string[] = [];
  const featureTypeById = new Map(
    json.features.map((feature) => [feature.id, feature.featureType])
  );

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      const { parentId, childIds } = anchor.placement;

      if (parentId !== null) {
        if (feature.featureType !== 'Polygon') {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" has a parent but feature type "${feature.featureType}" is not a Polygon`
          );
        }
        if (parentId === feature.id) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references itself as parent`
          );
        } else if (!featureTypeById.has(parentId)) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references non-existent parent "${parentId}"`
          );
        } else if (featureTypeById.get(parentId) !== 'Polygon') {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" parent "${parentId}" is not a Polygon`
          );
        }
      }

      for (const duplicateChildId of findDuplicates(childIds)) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" contains duplicate child "${duplicateChildId}"`
        );
      }

      for (const childId of childIds) {
        if (childId === feature.id) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references itself as child`
          );
          continue;
        }
        if (!featureTypeById.has(childId)) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references non-existent child "${childId}"`
          );
          continue;
        }
        if (featureTypeById.get(childId) !== 'Polygon') {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" child "${childId}" is not a Polygon`
          );
        }
      }

      if (childIds.length > 0 && feature.featureType !== 'Polygon') {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" has children but feature type "${feature.featureType}" is not a Polygon`
        );
      }
    }
  }

  return errors;
}

/**
 * 階層の親子相互整合（双方向参照）と循環参照を、時間スライスごとに検証する。
 *
 * 要件定義書 §2.5.2「データ読み込み時の詳細な挙動」のデータ整合性チェック項目
 * 「ツリー位相の不整合（…循環参照、子の親側参照欠落、親の子側参照欠落 など）」のうち、
 * **複数地物にまたがり、時刻ごとに評価する必要がある整合性**を対象とする
 * （Phase 3-1 `validateHierarchyReferences` は各錨ローカルの参照整合を担う）。
 *
 * placement（parentId / childIds / isTopLevel）は錨ごとに保持され時間依存のため
 * （§6.2 / 現状.md §6.3）、相互整合は単一時刻ではなく「全錨の境界時刻（start / end）で
 * 区切られた各時間スライス」で評価する。スライス間で有効錨の組み合わせは一定なので、
 * 全境界時刻で評価すれば「時間区間カバレッジ」を厳密に検証できる。
 *
 * 各スライス T で、各地物の有効錨を `getActiveJsonAnchor`（`Feature.getActiveAnchor` 相当:
 * 配列末尾優先 + 半開区間 `[start, end)`）で解決し、以下を検証する:
 *   - 親の子側参照欠落: 子 C の有効錨が親 P を指すなら、P の同時刻有効錨が C を
 *     childIds に含むこと（含まない / P が同時刻に非有効 ならエラー）
 *   - 子の親側参照欠落: 親 P の有効錨が子 C を含むなら、C の同時刻有効錨が P を
 *     parentId に指すこと（指さない / C が同時刻に非有効 ならエラー）
 *   - 循環参照: 親方向に辿って自身へ戻る地物を循環メンバーとして検出（§6.4.14 visited guard）
 *
 * ランタイム版との対応:
 *   - 循環・親存在 → `HierarchyService.validateHierarchy`
 *   - 親 P → 子 C の整合（C の存在・C.parentId === P）→ `ReassignFeatureParentUseCase.validateChildReferences`
 *   いずれも単一時刻 API（編集確定時）。本関数はそれらをロード時に全時間スライスへ広げ、
 *   さらに「子 C → 親 P が P の childIds に含まれるか」（親の子側参照欠落）も加える。
 *   ランタイム側の編集確定時プロセスへの同期は Phase 4（操作 UseCase 再設計）で扱う。
 *   循環については「循環の有無 → 拒否」の結論はランタイムと一致するが、報告する循環メンバー
 *   集合は本関数の方が精密: ランタイム `validateHierarchy` は循環へ流れ込むだけの尾も
 *   報告するのに対し、本関数は「自身へ戻る」構成地物のみを報告する（尾を除外）。後続の
 *   修復 UI / 診断統一（Phase 3-3 以降）で循環メンバー定義を揃える際はこの差に留意する。
 *
 * 非存在地物・自己参照を指す参照は Phase 3-1 が報告するため、本関数は二重報告を避けて
 * スキップする（双方向チェックは `id !== feature.id`、循環チェックは自己親を guard でスキップ）。
 * リーフ排他（地図全体）は `validateLeafExclusivity`（Phase 3-3）が担う。
 * スコープ外（後続サブフェーズ）: 親 ≡ 子の和（Phase 3-4）。
 */
function validateHierarchyConsistency(json: JsonWorld): string[] {
  const errors: string[] = [];
  const featureIds = new Set(json.features.map((feature) => feature.id));
  const sliceTimes = collectSliceTimes(json);

  for (const time of sliceTimes) {
    const activeByFeatureId = new Map<string, JsonFeatureAnchor>();
    for (const feature of json.features) {
      const anchor = getActiveJsonAnchor(feature, time);
      if (anchor) {
        activeByFeatureId.set(feature.id, anchor);
      }
    }

    for (const feature of json.features) {
      const anchor = activeByFeatureId.get(feature.id);
      if (!anchor) continue;

      const { parentId, childIds } = anchor.placement;

      // 子 → 親（親の子側参照欠落）。非存在・自己参照は Phase 3-1 が担うためスキップ。
      if (parentId !== null && parentId !== feature.id && featureIds.has(parentId)) {
        const parentAnchor = activeByFeatureId.get(parentId);
        if (!parentAnchor) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references parent "${parentId}" which is not active at the same time`
          );
        } else if (!parentAnchor.placement.childIds.includes(feature.id)) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" references parent "${parentId}" which does not list it as a child`
          );
        }
      }

      // 親 → 子（子の親側参照欠落）。非存在・自己参照は Phase 3-1 が担うためスキップ。
      for (const childId of childIds) {
        if (childId === feature.id || !featureIds.has(childId)) continue;
        const childAnchor = activeByFeatureId.get(childId);
        if (!childAnchor) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" lists child "${childId}" which is not active at the same time`
          );
        } else if (childAnchor.placement.parentId !== feature.id) {
          errors.push(
            `Feature "${feature.id}" anchor "${anchor.id}" lists child "${childId}" which does not reference it as parent`
          );
        }
      }
    }

    // 循環参照（時間スライス）。親方向に辿って自身へ戻る地物を循環メンバーとする。
    // 自己親（parentId === 自身）は長さ1の循環だが Phase 3-1 が報告するためスキップ（二重報告回避）。
    for (const feature of json.features) {
      const anchor = activeByFeatureId.get(feature.id);
      const parentId = anchor?.placement.parentId ?? null;
      if (parentId === null || parentId === feature.id) continue;
      if (isOnParentCycle(feature.id, activeByFeatureId)) {
        errors.push(`Feature "${feature.id}" is part of a circular parent reference`);
      }
    }
  }

  // 同一論理違反が複数スライスで重複し得るため、メッセージ単位で重複排除する。
  return [...new Set(errors)];
}

/**
 * 末端地物排他（地図全体）をロード時に検証する。
 *
 * 要件定義書 §2.5.2 line 938「末端地物排他の違反（地図全体での末端地物同士の空間重複）」/
 * §2.1 line 145-153「末端地物の排他性は地図全体に適用する」「排他検証は末端地物同士のみ。
 * 集約地物には直接の排他制約を課さない」。
 *
 * placement は錨ごとに時間依存のため（§6.2 / 現状.md §6.3）、排他は単一時刻ではなく
 * 「全錨の境界時刻で区切られた各時間スライス」で評価する（`validateHierarchyConsistency` と同方式）。
 * 各スライス T で各地物の有効錨を `getActiveJsonAnchor` で解決し、**末端ポリゴン錨**
 * （`isJsonLeafPolygonAnchor`: shape が Polygon かつ childIds 空。開発ガイド §6.6.8）だけを
 * 収集してペアワイズに重なりを判定する。集約地物・移行期間ノード（shape あり + childIds 非空）は
 * 対象外（§6.6.8: 集約地物ペアに直接の非重複検証を実装してはいけない。集約地物同士の重なりは
 * 子の末端地物排他から派生的に保証される）。
 *
 * 占有領域解決（`resolveOccupiedTerritories`: territory + 直下 hole 単位、§6.6.2）と
 * 重なり判定（`territorySetsOverlap`: 境界接触は重なりに含めない）は `ConflictDetectionService`
 * のランタイム排他検証と同じ実装を共有する（§6.6.1: 検証経路間のドリフト防止）。
 */
function validateLeafExclusivity(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertexById = new Map<string, { x: number; y: number }>(
    json.vertices.map((vertex) => [vertex.id, { x: vertex.x, y: vertex.y }])
  );
  const resolveVertex = (vertexId: string): { x: number; y: number } | undefined =>
    vertexById.get(vertexId);

  for (const time of collectSliceTimes(json)) {
    const leaves: { featureId: string; territories: RingCoords[][] }[] = [];
    for (const feature of json.features) {
      if (feature.featureType !== 'Polygon') continue;
      const anchor = getActiveJsonAnchor(feature, time);
      if (!anchor || !isJsonLeafPolygonAnchor(anchor)) continue;
      const territories = resolveOccupiedTerritories(anchor.shape?.rings ?? [], resolveVertex);
      if (territories.length === 0) continue;
      leaves.push({ featureId: feature.id, territories });
    }

    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        if (territorySetsOverlap(leaves[i].territories, leaves[j].territories)) {
          errors.push(
            `Leaf features "${leaves[i].featureId}" and "${leaves[j].featureId}" overlap spatially (leaf exclusivity violated)`
          );
        }
      }
    }
  }

  // 同一ペアの重複は複数スライスで重複し得るため、メッセージ単位で重複排除する。
  return [...new Set(errors)];
}

/**
 * JSON 上の末端ポリゴン錨判定。domain `isLeafPolygonAnchor`（`FeatureAnchor`）と同一基準
 * （shape が Polygon かつ childIds 空）。開発ガイド §6.6.8「リーフ判定をひとつに集約し
 * 検証経路間のドリフトを防ぐ」に従い、判定条件を domain ヘルパーと一致させる。
 */
function isJsonLeafPolygonAnchor(anchor: JsonFeatureAnchor): boolean {
  return anchor.shape?.type === 'Polygon' && anchor.placement.childIds.length === 0;
}

/** 全錨の境界時刻（start / end）を時間スライスの breakpoint として収集する（compareTo で重複排除）。 */
function collectSliceTimes(json: JsonWorld): TimePoint[] {
  const times: TimePoint[] = [];
  const pushDistinct = (time: TimePoint): void => {
    if (!times.some((existing) => existing.compareTo(time) === 0)) {
      times.push(time);
    }
  };
  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      pushDistinct(toTimePoint(anchor.timeRange.start));
      if (anchor.timeRange.end) {
        pushDistinct(toTimePoint(anchor.timeRange.end));
      }
    }
  }
  return times;
}

function toTimePoint(jsonTime: JsonTimePoint): TimePoint {
  return new TimePoint(jsonTime.year, jsonTime.month, jsonTime.day);
}

/** `Feature.getActiveAnchor` 相当: 配列末尾優先で半開区間 `[start, end)` の有効錨を返す。 */
function getActiveJsonAnchor(
  feature: JsonFeature,
  time: TimePoint
): JsonFeatureAnchor | undefined {
  for (let i = feature.anchors.length - 1; i >= 0; i--) {
    if (isJsonAnchorActiveAt(feature.anchors[i], time)) {
      return feature.anchors[i];
    }
  }
  return undefined;
}

/** `FeatureAnchor.isActiveAt` 相当: `time >= start && (end 無し || time < end)`。 */
function isJsonAnchorActiveAt(anchor: JsonFeatureAnchor, time: TimePoint): boolean {
  if (time.isBefore(toTimePoint(anchor.timeRange.start))) return false;
  if (anchor.timeRange.end && time.isAtOrAfter(toTimePoint(anchor.timeRange.end))) return false;
  return true;
}

/**
 * 指定スライスの有効錨マップ上で、`startId` から親方向に辿って自身へ戻るか判定する。
 * 戻れば `startId` は循環メンバー（純粋な循環の各構成地物は自身へ戻る）。別の循環へ
 * 流れ込むだけの尾（tail）は false。`visited` で再入を遮断し有限終了する（§6.4.14）。
 */
function isOnParentCycle(
  startId: string,
  activeByFeatureId: ReadonlyMap<string, JsonFeatureAnchor>
): boolean {
  const visited = new Set<string>();
  let currentId: string | null = startId;
  while (currentId !== null) {
    const parentId = activeByFeatureId.get(currentId)?.placement.parentId ?? null;
    if (parentId === null) return false; // ルート到達 or 親が同時刻に非有効 → 循環なし
    if (parentId === startId) return true; // 開始地物へ戻った → 循環メンバー
    if (visited.has(parentId)) return false; // 別の循環へ流れ込む尾 → 非メンバー
    visited.add(parentId);
    currentId = parentId;
  }
  return false;
}

function validateJsonWorld(json: JsonWorld): string[] {
  return [
    ...validateOrphanedVertices(json),
    ...validateTimeRanges(json),
    ...validatePlacementInvariants(json),
    ...validateShapePresence(json),
    ...validateHierarchyReferences(json),
    ...validateHierarchyConsistency(json),
    ...validateSharedVertexGroups(json),
    ...validatePolygons(json),
    ...validateLeafExclusivity(json),
  ];
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function isRingType(value: string): value is RingType {
  return value === 'territory' || value === 'hole';
}

function resolveRingCoords(
  ring: Ring,
  vertices: ReadonlyMap<string, Vertex>
): RingCoords {
  return ring.vertexIds.map((vertexId) => {
    const vertex = vertices.get(vertexId);
    if (!vertex) {
      throw new Error(`Vertex "${vertexId}" not found`);
    }
    return { x: vertex.x, y: vertex.y };
  });
}

function coordinatesEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= COORDINATE_EPSILON;
}

export { validateJsonWorld };
