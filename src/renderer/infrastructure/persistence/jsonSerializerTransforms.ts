import {
  World,
  type WorldMetadata,
  type WorldSettings,
  TimelineMarker,
  DEFAULT_SETTINGS,
  DEFAULT_METADATA,
} from '@domain/entities/World';
import { Feature, type FeatureType } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Layer } from '@domain/entities/Layer';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring, type RingType } from '@domain/value-objects/Ring';
import {
  FeatureAnchor,
  type FeatureShape,
  type AnchorProperty,
  type AnchorPlacement,
  type TimeRange,
  type PolygonStyle,
  type LabelVisibility,
} from '@domain/value-objects/FeatureAnchor';
import { SerializationError } from './jsonSerializerErrors';
import type {
  JsonAnchorPlacement,
  JsonAnchorProperty,
  JsonBaseMapSettings,
  JsonFeature,
  JsonFeatureAnchor,
  JsonFeatureShape,
  JsonLabelVisibility,
  JsonLayer,
  JsonPolygonStyle,
  JsonRing,
  JsonSharedVertexGroup,
  JsonTimePoint,
  JsonTimeRange,
  JsonTimelineMarker,
  JsonVertex,
  JsonWorld,
  JsonWorldMetadata,
  JsonWorldSettings,
} from './jsonSerializerTypes';

function serializeTimePoint(tp: TimePoint): JsonTimePoint {
  const json: JsonTimePoint = { year: tp.year };
  if (tp.month !== undefined) json.month = tp.month;
  if (tp.day !== undefined) json.day = tp.day;
  return json;
}

function serializeVertex(v: Vertex): JsonVertex {
  return { id: v.id, x: v.x, y: v.y };
}

function serializeLayer(l: Layer): JsonLayer {
  const json: JsonLayer = {
    id: l.id,
    name: l.name,
    order: l.order,
    visible: l.visible,
    opacity: l.opacity,
  };
  if (l.description) json.description = l.description;
  return json;
}

function serializeSharedVertexGroup(g: SharedVertexGroup): JsonSharedVertexGroup {
  return {
    id: g.id,
    vertexIds: [...g.vertexIds],
    representativeCoordinate: {
      x: g.representativeCoordinate.x,
      y: g.representativeCoordinate.y,
    },
  };
}

function serializeTimelineMarker(m: TimelineMarker): JsonTimelineMarker {
  const json: JsonTimelineMarker = {
    id: m.id,
    time: serializeTimePoint(m.time),
    label: m.label,
  };
  if (m.description) json.description = m.description;
  return json;
}

function serializeRing(r: Ring): JsonRing {
  return {
    id: r.id,
    vertexIds: [...r.vertexIds],
    ringType: r.ringType,
    parentId: r.parentId,
  };
}

function serializeShape(shape: FeatureShape): JsonFeatureShape {
  switch (shape.type) {
    case 'Point':
      return { type: 'Point', vertexId: shape.vertexId };
    case 'LineString':
      return { type: 'LineString', vertexIds: [...shape.vertexIds] };
    case 'Polygon':
      return { type: 'Polygon', rings: shape.rings.map(serializeRing) };
  }
}

function serializeTimeRange(tr: TimeRange): JsonTimeRange {
  const json: JsonTimeRange = { start: serializeTimePoint(tr.start) };
  if (tr.end) json.end = serializeTimePoint(tr.end);
  return json;
}

function serializeAnchorProperty(p: AnchorProperty): JsonAnchorProperty {
  const json: JsonAnchorProperty = {
    name: p.name,
    description: p.description,
  };
  if (p.labelVisibility) json.labelVisibility = { ...p.labelVisibility };
  if (p.style) json.style = { ...p.style };
  if (p.attributes && Object.keys(p.attributes).length > 0) {
    json.attributes = { ...p.attributes };
  }
  if (p.kind !== undefined && p.kind !== '') json.kind = p.kind;
  return json;
}

function serializeAnchorPlacement(pl: AnchorPlacement): JsonAnchorPlacement {
  return {
    layerId: pl.layerId,
    parentId: pl.parentId,
    childIds: [...pl.childIds],
    isTopLevel: pl.isTopLevel,
  };
}

function serializeAnchor(a: FeatureAnchor): JsonFeatureAnchor {
  return {
    id: a.id,
    timeRange: serializeTimeRange(a.timeRange),
    property: serializeAnchorProperty(a.property),
    shape: serializeShape(a.shape),
    placement: serializeAnchorPlacement(a.placement),
  };
}

function serializeFeature(f: Feature): JsonFeature {
  return {
    id: f.id,
    featureType: f.featureType,
    anchors: f.anchors.map(serializeAnchor),
  };
}

function serializeSettings(s: WorldSettings): JsonWorldSettings {
  return {
    zoomMin: s.zoomMin,
    zoomMax: s.zoomMax,
    gridInterval: s.gridInterval,
    gridColor: s.gridColor,
    gridOpacity: s.gridOpacity,
    autoSaveInterval: s.autoSaveInterval,
    equatorLength: s.equatorLength,
    oblateness: s.oblateness,
    labelAreaThreshold: s.labelAreaThreshold,
    defaultAutoColor: s.defaultAutoColor,
    defaultPalette: s.defaultPalette,
    customPalettes: [...s.customPalettes],
    baseMap: { ...s.baseMap },
  };
}

function serializeMetadata(m: WorldMetadata): JsonWorldMetadata {
  return {
    sliderMin: m.sliderMin,
    sliderMax: m.sliderMax,
    worldName: m.worldName,
    worldDescription: m.worldDescription,
    settings: serializeSettings(m.settings),
  };
}

function deserializeTimePoint(json: JsonTimePoint): TimePoint {
  return new TimePoint(json.year, json.month, json.day);
}

function deserializeVertex(json: JsonVertex): Vertex {
  return new Vertex(json.id, new Coordinate(json.x, json.y));
}

function deserializeLayer(json: JsonLayer): Layer {
  return new Layer(
    json.id,
    json.name,
    json.order,
    json.visible,
    json.opacity,
    json.description ?? ''
  );
}

function deserializeSharedVertexGroup(json: JsonSharedVertexGroup): SharedVertexGroup {
  return new SharedVertexGroup(
    json.id,
    json.vertexIds,
    new Coordinate(json.representativeCoordinate.x, json.representativeCoordinate.y)
  );
}

function deserializeTimelineMarker(json: JsonTimelineMarker): TimelineMarker {
  return new TimelineMarker(
    json.id,
    deserializeTimePoint(json.time),
    json.label,
    json.description,
  );
}

function deserializeRing(json: JsonRing): Ring {
  return new Ring(json.id, json.vertexIds, json.ringType as RingType, json.parentId);
}

function deserializeShape(json: JsonFeatureShape): FeatureShape {
  switch (json.type) {
    case 'Point':
      if (!json.vertexId) throw new SerializationError('Point shape requires vertexId');
      return { type: 'Point', vertexId: json.vertexId };
    case 'LineString':
      if (!json.vertexIds) throw new SerializationError('LineString shape requires vertexIds');
      return { type: 'LineString', vertexIds: json.vertexIds };
    case 'Polygon':
      if (!json.rings) throw new SerializationError('Polygon shape requires rings');
      return { type: 'Polygon', rings: json.rings.map(deserializeRing) };
    default:
      throw new SerializationError(`Unknown shape type: ${json.type}`);
  }
}

function deserializeTimeRange(json: JsonTimeRange): TimeRange {
  const range: TimeRange = {
    start: deserializeTimePoint(json.start),
  };
  if (json.end) {
    return { start: range.start, end: deserializeTimePoint(json.end) };
  }
  return range;
}

function deserializeLabelVisibility(json?: JsonLabelVisibility): LabelVisibility | undefined {
  if (!json) return undefined;
  return { minZoom: json.minZoom, minDisplayLength: json.minDisplayLength };
}

function deserializePolygonStyle(json?: JsonPolygonStyle): PolygonStyle | undefined {
  if (!json) return undefined;
  return {
    fillColor: json.fillColor,
    selectedFillColor: json.selectedFillColor,
    autoColor: json.autoColor,
    palette: json.palette,
  };
}

function deserializeAnchorProperty(json: JsonAnchorProperty): AnchorProperty {
  return {
    name: json.name,
    description: json.description,
    labelVisibility: deserializeLabelVisibility(json.labelVisibility),
    style: deserializePolygonStyle(json.style),
    attributes: json.attributes,
    kind: typeof json.kind === 'string' && json.kind !== '' ? json.kind : undefined,
  };
}

function deserializeAnchorPlacement(json: JsonAnchorPlacement): AnchorPlacement {
  return {
    layerId: json.layerId,
    parentId: json.parentId,
    childIds: json.childIds,
    isTopLevel: json.isTopLevel,
  };
}

function deserializeAnchor(json: JsonFeatureAnchor): FeatureAnchor {
  return new FeatureAnchor(
    json.id,
    deserializeTimeRange(json.timeRange),
    deserializeAnchorProperty(json.property),
    deserializeShape(json.shape),
    deserializeAnchorPlacement(json.placement)
  );
}

function deserializeFeature(json: JsonFeature): Feature {
  const validTypes: FeatureType[] = ['Point', 'Line', 'Polygon'];
  if (!validTypes.includes(json.featureType as FeatureType)) {
    throw new SerializationError(`Unknown feature type: ${json.featureType}`);
  }
  return new Feature(
    json.id,
    json.featureType as FeatureType,
    json.anchors.map(deserializeAnchor)
  );
}

function deserializeSettings(json: JsonWorldSettings): WorldSettings {
  return {
    zoomMin: json.zoomMin ?? DEFAULT_SETTINGS.zoomMin,
    zoomMax: json.zoomMax ?? DEFAULT_SETTINGS.zoomMax,
    gridInterval: json.gridInterval ?? DEFAULT_SETTINGS.gridInterval,
    gridColor: json.gridColor ?? DEFAULT_SETTINGS.gridColor,
    gridOpacity: json.gridOpacity ?? DEFAULT_SETTINGS.gridOpacity,
    autoSaveInterval: json.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval,
    equatorLength: json.equatorLength ?? DEFAULT_SETTINGS.equatorLength,
    oblateness: json.oblateness ?? DEFAULT_SETTINGS.oblateness,
    labelAreaThreshold: json.labelAreaThreshold ?? DEFAULT_SETTINGS.labelAreaThreshold,
    defaultAutoColor: json.defaultAutoColor ?? DEFAULT_SETTINGS.defaultAutoColor,
    defaultPalette: json.defaultPalette ?? DEFAULT_SETTINGS.defaultPalette,
    customPalettes: json.customPalettes ?? DEFAULT_SETTINGS.customPalettes,
    baseMap: deserializeBaseMapSettings(json.baseMap),
  };
}

function deserializeBaseMapSettings(json?: JsonBaseMapSettings): WorldSettings['baseMap'] {
  if (!json) {
    return { ...DEFAULT_SETTINGS.baseMap };
  }

  const mode = json.mode === 'custom' ? 'custom' : 'bundled';
  const fileName = typeof json.fileName === 'string' && json.fileName.trim()
    ? json.fileName.trim()
    : DEFAULT_SETTINGS.baseMap.fileName;
  const svgText = typeof json.svgText === 'string' ? json.svgText : null;

  return {
    mode,
    fileName,
    svgText,
  };
}

function deserializeMetadata(json: JsonWorldMetadata): WorldMetadata {
  return {
    sliderMin: json.sliderMin ?? DEFAULT_METADATA.sliderMin,
    sliderMax: json.sliderMax ?? DEFAULT_METADATA.sliderMax,
    worldName: json.worldName ?? DEFAULT_METADATA.worldName,
    worldDescription: json.worldDescription ?? DEFAULT_METADATA.worldDescription,
    settings: json.settings ? deserializeSettings(json.settings) : DEFAULT_SETTINGS,
  };
}

function deserializeVertices(jsonVertices: readonly JsonVertex[] = []): Map<string, Vertex> {
  const vertices = new Map<string, Vertex>();
  for (const jsonVertex of jsonVertices) {
    vertices.set(jsonVertex.id, deserializeVertex(jsonVertex));
  }
  return vertices;
}

function deserializeFeatures(jsonFeatures: readonly JsonFeature[] = []): Map<string, Feature> {
  const features = new Map<string, Feature>();
  for (const jsonFeature of jsonFeatures) {
    features.set(jsonFeature.id, deserializeFeature(jsonFeature));
  }
  return features;
}

function deserializeSharedGroups(
  jsonGroups: readonly JsonSharedVertexGroup[] = []
): Map<string, SharedVertexGroup> {
  const sharedVertexGroups = new Map<string, SharedVertexGroup>();
  for (const jsonGroup of jsonGroups) {
    sharedVertexGroups.set(jsonGroup.id, deserializeSharedVertexGroup(jsonGroup));
  }
  return sharedVertexGroups;
}

function deserializeTimelineMarkers(
  jsonMarkers: readonly JsonTimelineMarker[] = []
): TimelineMarker[] {
  return jsonMarkers.map(deserializeTimelineMarker);
}

function serializeWorldToJson(world: World): JsonWorld {
  return {
    version: world.version,
    layers: world.layers.map(serializeLayer),
    vertices: [...world.vertices.values()].map(serializeVertex),
    sharedVertexGroups: [...world.sharedVertexGroups.values()].map(serializeSharedVertexGroup),
    timelineMarkers: world.timelineMarkers.map(serializeTimelineMarker),
    features: [...world.features.values()].map(serializeFeature),
    metadata: serializeMetadata(world.metadata),
  };
}

function deserializeJsonWorld(json: JsonWorld): World {
  return new World(
    json.version,
    deserializeVertices(json.vertices),
    deserializeFeatures(json.features),
    (json.layers ?? []).map(deserializeLayer),
    deserializeSharedGroups(json.sharedVertexGroups),
    deserializeTimelineMarkers(json.timelineMarkers),
    json.metadata ? deserializeMetadata(json.metadata) : DEFAULT_METADATA
  );
}

export { deserializeJsonWorld, serializeWorldToJson };
