import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { Ring, type RingType } from '@domain/value-objects/Ring';
import { isSelfIntersecting, type RingCoords } from '@domain/services/GeometryService';
import { validatePolygonRingHierarchy } from '@domain/services/RingEditService';
import type { JsonRing, JsonWorld } from './jsonSerializerTypes';

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
 * 子参照健全性（参照の存在・Polygon 型）は `validateHierarchyReferences` が担う。
 * 親子相互整合・循環検出・リーフ排他・親≡子の和は後続フェーズのスコープ。
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
 * スコープ外（後続サブフェーズ）: 親子相互整合（時間区間カバレッジ・双方向の参照欠落）、
 * 循環検出（時間スライス）、リーフ排他（地図全体）、親 ≡ 子の和。
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

function validateJsonWorld(json: JsonWorld): string[] {
  return [
    ...validateOrphanedVertices(json),
    ...validateTimeRanges(json),
    ...validatePlacementInvariants(json),
    ...validateShapePresence(json),
    ...validateHierarchyReferences(json),
    ...validateSharedVertexGroups(json),
    ...validatePolygons(json),
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
