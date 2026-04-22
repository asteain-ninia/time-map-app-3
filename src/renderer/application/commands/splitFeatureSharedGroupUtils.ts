import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { SharedEdgeVertexRecord } from './splitFeatureSharedEdgeInsertion';

export type SplitPiece = 'a' | 'b';

export interface SplitVertexRecord {
  readonly piece: SplitPiece;
  readonly ringId: string;
  readonly vertexId: string;
  readonly coordinate: Coordinate;
}

export function collectShapeVertexIds(shape: FeatureShape): Set<string> {
  switch (shape.type) {
    case 'Point':
      return new Set([shape.vertexId]);
    case 'LineString':
      return new Set(shape.vertexIds);
    case 'Polygon':
      return new Set(shape.rings.flatMap((ring) => [...ring.vertexIds]));
  }
}

export function collectSharedSplitBoundaryCoordinates(records: readonly SplitVertexRecord[]): Coordinate[] {
  return [...groupSplitRecordsByCoordinate(records).values()]
    .filter((groupedRecords) => {
      const pieces = new Set(
        selectOneSplitRecordPerComponent(groupedRecords).map((record) => record.piece)
      );
      return pieces.has('a') && pieces.has('b');
    })
    .map((groupedRecords) => groupedRecords[0]?.coordinate)
    .filter((coordinate): coordinate is Coordinate => coordinate !== undefined);
}

export function inheritExistingSharedGroups(params: {
  readonly sharedGroups: Map<string, SharedVertexGroup>;
  readonly splitSourceVertexIds: ReadonlySet<string>;
  readonly splitRecords: readonly SplitVertexRecord[];
  readonly vertices: Map<string, Vertex>;
}): Set<string> {
  const splitRecordsByCoordinate = groupSplitRecordsByCoordinate(params.splitRecords);
  const inheritedSplitVertexIds = new Set<string>();

  for (const [groupId, group] of [...params.sharedGroups]) {
    const splitSourceMembers = group.vertexIds.filter((vertexId) =>
      params.splitSourceVertexIds.has(vertexId)
    );
    if (splitSourceMembers.length === 0) continue;

    const inheritedVertexIds = collectInheritedSplitVertexIds(
      splitSourceMembers,
      splitRecordsByCoordinate,
      params.vertices,
      group.representativeCoordinate
    );
    for (const vertexId of inheritedVertexIds) {
      inheritedSplitVertexIds.add(vertexId);
    }

    const nextVertexIds = [
      ...group.vertexIds.filter((vertexId) => !params.splitSourceVertexIds.has(vertexId)),
      ...inheritedVertexIds,
    ];
    replaceSharedGroupVertices(params.sharedGroups, groupId, group, nextVertexIds);
  }

  return inheritedSplitVertexIds;
}

export function createSplitSharedGroups(params: {
  readonly sharedGroups: Map<string, SharedVertexGroup>;
  readonly inheritedSplitVertexIds: ReadonlySet<string>;
  readonly sharedEdgeVertexRecords: readonly SharedEdgeVertexRecord[];
  readonly splitRecords: readonly SplitVertexRecord[];
  readonly vertices: Map<string, Vertex>;
  readonly createSharedGroupId: () => string;
}): void {
  const recordsByCoordinate = groupSplitRecordsByCoordinate(params.splitRecords);
  const sharedEdgeRecordsByCoordinate = groupSharedEdgeRecordsByCoordinate(params.sharedEdgeVertexRecords);

  for (const records of recordsByCoordinate.values()) {
    const sharedRecords = selectOneSplitRecordPerComponent(records);
    const sharedPieces = new Set(sharedRecords.map((record) => record.piece));
    if (!sharedPieces.has('a') || !sharedPieces.has('b')) continue;
    if (sharedRecords.some((record) => params.inheritedSplitVertexIds.has(record.vertexId))) continue;

    const representativeRecord = sharedRecords[0];
    if (!representativeRecord) continue;

    const representativeCoordinate = representativeRecord.coordinate;
    for (const record of sharedRecords) {
      const vertex = params.vertices.get(record.vertexId);
      if (vertex) {
        params.vertices.set(record.vertexId, vertex.withCoordinate(representativeCoordinate));
      }
    }

    const sharedEdgeVertexIds = collectSharedEdgeVertexIds(
      sharedEdgeRecordsByCoordinate,
      representativeCoordinate
    );
    mergeOrCreateSharedGroup({
      sharedGroups: params.sharedGroups,
      vertexIds: [...sharedRecords.map((record) => record.vertexId), ...sharedEdgeVertexIds],
      representativeCoordinate,
      vertices: params.vertices,
      createSharedGroupId: params.createSharedGroupId,
    });
  }
}

function mergeOrCreateSharedGroup(params: {
  readonly sharedGroups: Map<string, SharedVertexGroup>;
  readonly vertexIds: readonly string[];
  readonly representativeCoordinate: Coordinate;
  readonly vertices: Map<string, Vertex>;
  readonly createSharedGroupId: () => string;
}): void {
  const vertexIds = [...new Set(params.vertexIds)];
  if (vertexIds.length <= 1) return;

  const existingGroups = collectGroupsForVertexIds(params.sharedGroups, vertexIds);
  const groupId = existingGroups[0]?.id ?? params.createSharedGroupId();
  const mergedVertexIds = [
    ...new Set([
      ...existingGroups.flatMap((group) => [...group.vertexIds]),
      ...vertexIds,
    ]),
  ];

  for (const group of existingGroups) {
    if (group.id !== groupId) {
      params.sharedGroups.delete(group.id);
    }
  }

  for (const vertexId of mergedVertexIds) {
    const vertex = params.vertices.get(vertexId);
    if (vertex) {
      params.vertices.set(vertexId, vertex.withCoordinate(params.representativeCoordinate));
    }
  }

  params.sharedGroups.set(
    groupId,
    new SharedVertexGroup(groupId, mergedVertexIds, params.representativeCoordinate)
  );
}

function collectGroupsForVertexIds(
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>,
  vertexIds: readonly string[]
): SharedVertexGroup[] {
  const targetVertexIds = new Set(vertexIds);
  const groups: SharedVertexGroup[] = [];

  for (const group of sharedGroups.values()) {
    if (group.vertexIds.some((vertexId) => targetVertexIds.has(vertexId))) {
      groups.push(group);
    }
  }

  return groups;
}

function collectInheritedSplitVertexIds(
  splitSourceMembers: readonly string[],
  splitRecordsByCoordinate: ReadonlyMap<string, readonly SplitVertexRecord[]>,
  vertices: Map<string, Vertex>,
  representativeCoordinate: Coordinate
): string[] {
  const inheritedVertexIds: string[] = [];
  const sourceCoordinateKeys = collectSourceCoordinateKeys(splitSourceMembers, vertices);

  for (const coordinateKey of sourceCoordinateKeys) {
    const records = selectOneSplitRecordPerComponent(splitRecordsByCoordinate.get(coordinateKey) ?? []);
    for (const record of records) {
      inheritedVertexIds.push(record.vertexId);
      const vertex = vertices.get(record.vertexId);
      if (vertex) {
        vertices.set(record.vertexId, vertex.withCoordinate(representativeCoordinate));
      }
    }
  }

  return inheritedVertexIds;
}

function collectSourceCoordinateKeys(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): Set<string> {
  const coordinateKeys = new Set<string>();
  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      coordinateKeys.add(createCoordinateKey(vertex.coordinate));
    }
  }
  return coordinateKeys;
}

function replaceSharedGroupVertices(
  sharedGroups: Map<string, SharedVertexGroup>,
  groupId: string,
  group: SharedVertexGroup,
  vertexIds: readonly string[]
): void {
  const uniqueVertexIds = [...new Set(vertexIds)];
  if (uniqueVertexIds.length <= 1) {
    sharedGroups.delete(groupId);
    return;
  }

  sharedGroups.set(
    groupId,
    new SharedVertexGroup(groupId, uniqueVertexIds, group.representativeCoordinate)
  );
}

function groupSharedEdgeRecordsByCoordinate(
  records: readonly SharedEdgeVertexRecord[]
): Map<string, SharedEdgeVertexRecord[]> {
  const recordsByCoordinate = new Map<string, SharedEdgeVertexRecord[]>();

  for (const record of records) {
    const key = createCoordinateKey(record.coordinate);
    recordsByCoordinate.set(key, [...(recordsByCoordinate.get(key) ?? []), record]);
  }

  return recordsByCoordinate;
}

function collectSharedEdgeVertexIds(
  recordsByCoordinate: ReadonlyMap<string, readonly SharedEdgeVertexRecord[]>,
  coordinate: Coordinate
): string[] {
  return (recordsByCoordinate.get(createCoordinateKey(coordinate)) ?? [])
    .map((record) => record.vertexId);
}

function selectOneSplitRecordPerComponent(
  records: readonly SplitVertexRecord[]
): SplitVertexRecord[] {
  const recordsByComponent = new Map<string, SplitVertexRecord>();
  for (const record of records) {
    const componentKey = `${record.piece}:${record.ringId}`;
    if (!recordsByComponent.has(componentKey)) {
      recordsByComponent.set(componentKey, record);
    }
  }
  return [...recordsByComponent.values()];
}

function groupSplitRecordsByCoordinate(
  records: readonly SplitVertexRecord[]
): Map<string, SplitVertexRecord[]> {
  const recordsByCoordinate = new Map<string, SplitVertexRecord[]>();

  for (const record of records) {
    const key = createCoordinateKey(record.coordinate);
    recordsByCoordinate.set(key, [...(recordsByCoordinate.get(key) ?? []), record]);
  }

  return recordsByCoordinate;
}

function createCoordinateKey(coordinate: Coordinate): string {
  return `${coordinate.x.toFixed(9)}:${coordinate.y.toFixed(9)}`;
}
