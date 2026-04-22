import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { TimePoint } from '@domain/value-objects/TimePoint';

const GEOMETRY_EPSILON = 1e-7;

export interface SharedEdgeVertexRecord {
  readonly vertexId: string;
  readonly coordinate: Coordinate;
}

export interface SharedEdgeInsertionResult {
  readonly records: readonly SharedEdgeVertexRecord[];
  readonly originalFeatures: ReadonlyMap<string, Feature>;
  readonly updatedFeatures: ReadonlyMap<string, Feature>;
}

interface EdgeInsertion {
  readonly coordinate: Coordinate;
  readonly t: number;
}

interface ShapeInsertionResult {
  readonly shape: FeatureShape;
  readonly changed: boolean;
}

interface VertexIdsInsertionResult {
  readonly vertexIds: readonly string[];
  readonly changed: boolean;
}

interface SharedBoundaryChain {
  readonly vertexIndexes: readonly number[];
}

export function insertSharedEdgeVerticesForSplit(params: {
  readonly featureUseCase: AddFeatureUseCase;
  readonly sourceFeatureId: string;
  readonly newFeatureId: string | null;
  readonly currentTime: TimePoint;
  readonly sharedGroups: ReadonlyMap<string, SharedVertexGroup>;
  readonly splitSourceVertexIds: ReadonlySet<string>;
  readonly splitCoordinates: readonly Coordinate[];
}): SharedEdgeInsertionResult {
  const externalSharedVertexIds = collectExternalSharedVertexIds(
    params.sharedGroups,
    params.splitSourceVertexIds
  );
  if (externalSharedVertexIds.size === 0) {
    return createEmptyResult();
  }

  const context = createInsertionContext(params.featureUseCase);
  for (const feature of [...context.features.values()]) {
    if (feature.id === params.sourceFeatureId || feature.id === params.newFeatureId) continue;
    insertSharedEdgeVerticesIntoFeature(feature, params.currentTime, params.splitCoordinates, externalSharedVertexIds, context);
  }

  return {
    records: context.records,
    originalFeatures: context.originalFeatures,
    updatedFeatures: context.updatedFeatures,
  };
}

function createEmptyResult(): SharedEdgeInsertionResult {
  return {
    records: [],
    originalFeatures: new Map(),
    updatedFeatures: new Map(),
  };
}

function createInsertionContext(featureUseCase: AddFeatureUseCase): {
  readonly features: Map<string, Feature>;
  readonly vertices: Map<string, Vertex>;
  readonly records: SharedEdgeVertexRecord[];
  readonly originalFeatures: Map<string, Feature>;
  readonly updatedFeatures: Map<string, Feature>;
} {
  return {
    features: featureUseCase.getFeaturesMap() as Map<string, Feature>,
    vertices: featureUseCase.getVertices() as Map<string, Vertex>,
    records: [],
    originalFeatures: new Map(),
    updatedFeatures: new Map(),
  };
}

function insertSharedEdgeVerticesIntoFeature(
  feature: Feature,
  currentTime: TimePoint,
  splitCoordinates: readonly Coordinate[],
  externalSharedVertexIds: ReadonlySet<string>,
  context: ReturnType<typeof createInsertionContext>
): void {
  const anchor = feature.getActiveAnchor(currentTime);
  if (!anchor) return;

  const shape = insertSharedEdgeVerticesIntoShape(
    anchor.shape,
    splitCoordinates,
    externalSharedVertexIds,
    context
  );
  if (!shape.changed) return;

  const nextAnchor = anchor.withShape(shape.shape);
  const updatedFeature = feature.withAnchors(
    feature.anchors.map((candidate) => candidate.id === anchor.id ? nextAnchor : candidate)
  );
  context.originalFeatures.set(feature.id, feature);
  context.updatedFeatures.set(feature.id, updatedFeature);
  context.features.set(feature.id, updatedFeature);
}

function insertSharedEdgeVerticesIntoShape(
  shape: FeatureShape,
  splitCoordinates: readonly Coordinate[],
  externalSharedVertexIds: ReadonlySet<string>,
  context: ReturnType<typeof createInsertionContext>
): ShapeInsertionResult {
  if (shape.type === 'LineString') {
    const result = insertSharedEdgeVerticesIntoVertexIds(
      shape.vertexIds,
      splitCoordinates,
      externalSharedVertexIds,
      context,
      false
    );
    return {
      shape: result.changed ? { type: 'LineString', vertexIds: result.vertexIds } : shape,
      changed: result.changed,
    };
  }

  if (shape.type !== 'Polygon') {
    return { shape, changed: false };
  }

  let changed = false;
  const rings = shape.rings.map((ring) => {
    const result = insertSharedEdgeVerticesIntoVertexIds(
      ring.vertexIds,
      splitCoordinates,
      externalSharedVertexIds,
      context,
      true
    );
    changed ||= result.changed;
    return result.changed ? ring.withVertexIds(result.vertexIds) : ring;
  });
  return {
    shape: changed ? { type: 'Polygon', rings } : shape,
    changed,
  };
}

function insertSharedEdgeVerticesIntoVertexIds(
  vertexIds: readonly string[],
  splitCoordinates: readonly Coordinate[],
  externalSharedVertexIds: ReadonlySet<string>,
  context: ReturnType<typeof createInsertionContext>,
  closed: boolean
): VertexIdsInsertionResult {
  const insertionsBySegmentIndex = collectSharedBoundaryInsertions(
    vertexIds,
    splitCoordinates,
    externalSharedVertexIds,
    context,
    closed
  );
  const nextVertexIds: string[] = [];
  let changed = false;

  for (let index = 0; index < vertexIds.length; index++) {
    nextVertexIds.push(vertexIds[index]);
    for (const insertion of insertionsBySegmentIndex.get(index) ?? []) {
      nextVertexIds.push(createSharedEdgeVertex(context, insertion.coordinate));
      changed = true;
    }
  }

  return {
    vertexIds: changed ? nextVertexIds : vertexIds,
    changed,
  };
}

function collectSharedBoundaryInsertions(
  vertexIds: readonly string[],
  splitCoordinates: readonly Coordinate[],
  externalSharedVertexIds: ReadonlySet<string>,
  context: ReturnType<typeof createInsertionContext>,
  closed: boolean
): Map<number, EdgeInsertion[]> {
  const insertionsBySegmentIndex = new Map<number, EdgeInsertion[]>();
  const chains = collectSharedBoundaryChains(vertexIds, externalSharedVertexIds, context.vertices, closed);

  for (const chain of chains) {
    recordExistingSplitVerticesOnChain(chain, vertexIds, splitCoordinates, externalSharedVertexIds, context);

    for (let index = 0; index < chain.vertexIndexes.length - 1; index++) {
      const segmentStartIndex = chain.vertexIndexes[index];
      const segmentEndIndex = chain.vertexIndexes[index + 1];
      const insertions = collectSegmentInsertions(
        vertexIds[segmentStartIndex],
        vertexIds[segmentEndIndex],
        splitCoordinates,
        context.vertices
      );
      if (insertions.length === 0) continue;

      insertionsBySegmentIndex.set(
        segmentStartIndex,
        deduplicateEdgeInsertions([
          ...(insertionsBySegmentIndex.get(segmentStartIndex) ?? []),
          ...insertions,
        ]).toSorted((a, b) => a.t - b.t)
      );
    }
  }

  return insertionsBySegmentIndex;
}

function collectSharedBoundaryChains(
  vertexIds: readonly string[],
  externalSharedVertexIds: ReadonlySet<string>,
  vertices: ReadonlyMap<string, Vertex>,
  closed: boolean
): SharedBoundaryChain[] {
  const sharedIndexes = vertexIds
    .map((vertexId, index) => externalSharedVertexIds.has(vertexId) ? index : -1)
    .filter((index) => index >= 0);
  if (sharedIndexes.length < 2) return [];

  const chains: SharedBoundaryChain[] = [];
  const pairCount = closed ? sharedIndexes.length : sharedIndexes.length - 1;
  for (let index = 0; index < pairCount; index++) {
    const startIndex = sharedIndexes[index];
    const endIndex = sharedIndexes[(index + 1) % sharedIndexes.length];
    const vertexIndexes = collectChainIndexes(startIndex, endIndex, vertexIds.length, closed);
    if (isCollinearChain(vertexIndexes, vertexIds, vertices)) {
      chains.push({ vertexIndexes });
    }
  }

  return chains;
}

function collectChainIndexes(
  startIndex: number,
  endIndex: number,
  vertexCount: number,
  closed: boolean
): number[] {
  if (!closed) {
    return Array.from(
      { length: endIndex - startIndex + 1 },
      (_, offset) => startIndex + offset
    );
  }

  const indexes: number[] = [];
  let index = startIndex;
  do {
    indexes.push(index);
    if (index === endIndex) break;
    index = (index + 1) % vertexCount;
  } while (indexes.length <= vertexCount);
  return indexes;
}

function isCollinearChain(
  vertexIndexes: readonly number[],
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): boolean {
  if (vertexIndexes.length < 2) return false;

  const start = vertices.get(vertexIds[vertexIndexes[0]]);
  const end = vertices.get(vertexIds[vertexIndexes[vertexIndexes.length - 1]]);
  if (!start || !end) return false;

  const dx = end.coordinate.x - start.coordinate.x;
  const dy = end.coordinate.y - start.coordinate.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= GEOMETRY_EPSILON) return false;

  return vertexIndexes.every((index) => {
    const vertex = vertices.get(vertexIds[index]);
    return vertex ? isCoordinateOnSegment(start.coordinate, end.coordinate, vertex.coordinate) : false;
  });
}

function recordExistingSplitVerticesOnChain(
  chain: SharedBoundaryChain,
  vertexIds: readonly string[],
  splitCoordinates: readonly Coordinate[],
  externalSharedVertexIds: ReadonlySet<string>,
  context: ReturnType<typeof createInsertionContext>
): void {
  for (const index of chain.vertexIndexes) {
    const vertexId = vertexIds[index];
    if (externalSharedVertexIds.has(vertexId)) continue;

    const vertex = context.vertices.get(vertexId);
    if (!vertex) continue;

    if (splitCoordinates.some((coordinate) => coordinatesAlmostEqual(coordinate, vertex.coordinate))) {
      recordSharedEdgeVertex(context, vertexId, vertex.coordinate);
    }
  }
}

function collectSegmentInsertions(
  startVertexId: string,
  endVertexId: string,
  splitCoordinates: readonly Coordinate[],
  vertices: ReadonlyMap<string, Vertex>
): EdgeInsertion[] {
  const start = vertices.get(startVertexId);
  const end = vertices.get(endVertexId);
  if (!start || !end) return [];

  const insertions = splitCoordinates
    .map((coordinate) => createEdgeInsertion(start.coordinate, end.coordinate, coordinate))
    .filter((insertion): insertion is EdgeInsertion => insertion !== null);
  return deduplicateEdgeInsertions(insertions).toSorted((a, b) => a.t - b.t);
}

function isCoordinateOnSegment(
  start: Coordinate,
  end: Coordinate,
  coordinate: Coordinate
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= GEOMETRY_EPSILON) return false;

  const t = ((coordinate.x - start.x) * dx + (coordinate.y - start.y) * dy) / lengthSq;
  if (t < -GEOMETRY_EPSILON || t > 1 + GEOMETRY_EPSILON) return false;

  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(projectedX - coordinate.x, projectedY - coordinate.y) <= GEOMETRY_EPSILON;
}

function createEdgeInsertion(
  start: Coordinate,
  end: Coordinate,
  coordinate: Coordinate
): EdgeInsertion | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= GEOMETRY_EPSILON) return null;

  const t = ((coordinate.x - start.x) * dx + (coordinate.y - start.y) * dy) / lengthSq;
  if (t <= GEOMETRY_EPSILON || t >= 1 - GEOMETRY_EPSILON) return null;

  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  if (Math.hypot(projectedX - coordinate.x, projectedY - coordinate.y) > GEOMETRY_EPSILON) return null;
  return { coordinate, t };
}

function deduplicateEdgeInsertions(insertions: readonly EdgeInsertion[]): EdgeInsertion[] {
  const uniqueInsertions = new Map<string, EdgeInsertion>();
  for (const insertion of insertions) {
    uniqueInsertions.set(createCoordinateKey(insertion.coordinate), insertion);
  }
  return [...uniqueInsertions.values()];
}

function createSharedEdgeVertex(
  context: ReturnType<typeof createInsertionContext>,
  coordinate: Coordinate
): string {
  const vertexId = createSharedEdgeVertexId();
  context.vertices.set(vertexId, new Vertex(vertexId, coordinate));
  recordSharedEdgeVertex(context, vertexId, coordinate);
  return vertexId;
}

function recordSharedEdgeVertex(
  context: ReturnType<typeof createInsertionContext>,
  vertexId: string,
  coordinate: Coordinate
): void {
  if (context.records.some((record) => record.vertexId === vertexId)) return;
  context.records.push({ vertexId, coordinate });
}

function collectExternalSharedVertexIds(
  sharedGroups: ReadonlyMap<string, SharedVertexGroup>,
  splitSourceVertexIds: ReadonlySet<string>
): Set<string> {
  const externalVertexIds = new Set<string>();
  for (const group of sharedGroups.values()) {
    if (!group.vertexIds.some((vertexId) => splitSourceVertexIds.has(vertexId))) continue;
    for (const vertexId of group.vertexIds) {
      if (!splitSourceVertexIds.has(vertexId)) {
        externalVertexIds.add(vertexId);
      }
    }
  }
  return externalVertexIds;
}

function createCoordinateKey(coordinate: Coordinate): string {
  return `${coordinate.x.toFixed(9)}:${coordinate.y.toFixed(9)}`;
}

function coordinatesAlmostEqual(a: Coordinate, b: Coordinate): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= GEOMETRY_EPSILON;
}

function createSharedEdgeVertexId(): string {
  return `v-shared-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
