/**
 * JSONシリアライザ
 * §4.2: World ↔ JSON変換。ファイルスキーマに準拠。
 * §2.5: 保存時はバージョンフィールド必須、読み込み時はバージョン検証。
 */

import { World, type WorldMetadata, type WorldSettings, TimelineMarker, DEFAULT_SETTINGS, DEFAULT_METADATA } from '@domain/entities/World';
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

// ---- JSON型定義（ファイルスキーマ §4.2） ----

interface JsonTimePoint {
  year: number;
  month?: number;
  day?: number;
}

interface JsonCoordinate {
  x: number;
  y: number;
}

interface JsonVertex {
  id: string;
  x: number;
  y: number;
}

interface JsonLayer {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  opacity: number;
  description?: string;
}

interface JsonSharedVertexGroup {
  id: string;
  vertexIds: string[];
  representativeCoordinate: JsonCoordinate;
}

interface JsonTimelineMarker {
  id: string;
  time: JsonTimePoint;
  label: string;
  description?: string;
}

interface JsonRing {
  id: string;
  vertexIds: string[];
  ringType: string;
  parentId: string | null;
}

interface JsonFeatureShape {
  type: string;
  vertexId?: string;
  vertexIds?: string[];
  rings?: JsonRing[];
}

interface JsonLabelVisibility {
  minZoom?: number;
  minDisplayLength?: number;
}

interface JsonPolygonStyle {
  fillColor: string;
  selectedFillColor: string;
  autoColor: boolean;
  palette: string;
}

interface JsonAnchorProperty {
  name: string;
  description: string;
  labelVisibility?: JsonLabelVisibility;
  style?: JsonPolygonStyle;
  attributes?: Record<string, unknown>;
}

interface JsonAnchorPlacement {
  layerId: string;
  parentId: string | null;
  childIds: string[];
}

interface JsonTimeRange {
  start: JsonTimePoint;
  end?: JsonTimePoint;
}

interface JsonFeatureAnchor {
  id: string;
  timeRange: JsonTimeRange;
  property: JsonAnchorProperty;
  shape: JsonFeatureShape;
  placement: JsonAnchorPlacement;
}

interface JsonFeature {
  id: string;
  featureType: string;
  anchors: JsonFeatureAnchor[];
}

interface JsonWorldSettings {
  zoomMin: number;
  zoomMax: number;
  gridInterval: number;
  gridColor: string;
  gridOpacity: number;
  autoSaveInterval: number;
  equatorLength: number;
  oblateness: number;
  labelAreaThreshold: number;
  defaultAutoColor: boolean;
  defaultPalette: string;
  customPalettes: string[];
}

interface JsonWorldMetadata {
  sliderMin: number;
  sliderMax: number;
  worldName: string;
  worldDescription: string;
  settings: JsonWorldSettings;
}

interface JsonWorld {
  version: string;
  layers: JsonLayer[];
  vertices: JsonVertex[];
  sharedVertexGroups: JsonSharedVertexGroup[];
  timelineMarkers: JsonTimelineMarker[];
  features: JsonFeature[];
  metadata: JsonWorldMetadata;
}

/** サポートするファイルフォーマットバージョン */
const SUPPORTED_VERSION = '1.0.0';

/** シリアライズエラー */
export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

// ---- シリアライズ（Domain → JSON） ----

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
  return json;
}

function serializeAnchorPlacement(pl: AnchorPlacement): JsonAnchorPlacement {
  return {
    layerId: pl.layerId,
    parentId: pl.parentId,
    childIds: [...pl.childIds],
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

// ---- デシリアライズ（JSON → Domain） ----

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
  };
}

function deserializeAnchorPlacement(json: JsonAnchorPlacement): AnchorPlacement {
  return {
    layerId: json.layerId,
    parentId: json.parentId,
    childIds: json.childIds,
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

// ---- 検証 ----

function validateOrphanedVertices(json: JsonWorld): string[] {
  const errors: string[] = [];
  const vertexIds = new Set(json.vertices.map((v) => v.id));

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (anchor.shape.type === 'Point' && anchor.shape.vertexId) {
        if (!vertexIds.has(anchor.shape.vertexId)) {
          errors.push(`Feature "${feature.id}" references non-existent vertex "${anchor.shape.vertexId}"`);
        }
      }
      if (anchor.shape.type === 'LineString' && anchor.shape.vertexIds) {
        for (const vid of anchor.shape.vertexIds) {
          if (!vertexIds.has(vid)) {
            errors.push(`Feature "${feature.id}" references non-existent vertex "${vid}"`);
          }
        }
      }
      if (anchor.shape.type === 'Polygon' && anchor.shape.rings) {
        for (const ring of anchor.shape.rings) {
          for (const vid of ring.vertexIds) {
            if (!vertexIds.has(vid)) {
              errors.push(`Feature "${feature.id}" ring "${ring.id}" references non-existent vertex "${vid}"`);
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
      if (anchor.timeRange.end) {
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
  }
  return errors;
}

function validateLayerReferences(json: JsonWorld): string[] {
  const errors: string[] = [];
  const layerIds = new Set(json.layers.map((l) => l.id));

  for (const feature of json.features) {
    for (const anchor of feature.anchors) {
      if (!layerIds.has(anchor.placement.layerId)) {
        errors.push(
          `Feature "${feature.id}" anchor "${anchor.id}" references non-existent layer "${anchor.placement.layerId}"`
        );
      }
    }
  }
  return errors;
}

// ---- パブリックAPI ----

/**
 * WorldをJSON文字列にシリアライズする
 */
export function serialize(world: World): string {
  const json: JsonWorld = {
    version: world.version,
    layers: world.layers.map(serializeLayer),
    vertices: [...world.vertices.values()].map(serializeVertex),
    sharedVertexGroups: [...world.sharedVertexGroups.values()].map(serializeSharedVertexGroup),
    timelineMarkers: world.timelineMarkers.map(serializeTimelineMarker),
    features: [...world.features.values()].map(serializeFeature),
    metadata: serializeMetadata(world.metadata),
  };
  return JSON.stringify(json, null, 2);
}

/**
 * JSON文字列からWorldをデシリアライズする
 * §2.5.2: バージョン検証、データ整合性検証を行う
 *
 * @throws SerializationError バージョン不一致、データ不整合時
 */
export function deserialize(jsonString: string): World {
  let json: JsonWorld;
  try {
    json = JSON.parse(jsonString) as JsonWorld;
  } catch {
    throw new SerializationError('Invalid JSON format');
  }

  // バージョン検証
  if (!json.version) {
    throw new SerializationError('Missing version field');
  }
  if (json.version !== SUPPORTED_VERSION) {
    throw new SerializationError(
      `Unsupported version "${json.version}" (expected "${SUPPORTED_VERSION}")`
    );
  }

  // データ整合性検証
  const errors: string[] = [
    ...validateOrphanedVertices(json),
    ...validateTimeRanges(json),
    ...validateLayerReferences(json),
  ];
  if (errors.length > 0) {
    throw new SerializationError(
      `Data validation failed:\n${errors.join('\n')}`
    );
  }

  // デシリアライズ
  const vertices = new Map<string, Vertex>();
  for (const jv of json.vertices ?? []) {
    vertices.set(jv.id, deserializeVertex(jv));
  }

  const features = new Map<string, Feature>();
  for (const jf of json.features ?? []) {
    features.set(jf.id, deserializeFeature(jf));
  }

  const layers = (json.layers ?? []).map(deserializeLayer);

  const sharedVertexGroups = new Map<string, SharedVertexGroup>();
  for (const jg of json.sharedVertexGroups ?? []) {
    sharedVertexGroups.set(jg.id, deserializeSharedVertexGroup(jg));
  }

  const timelineMarkers = (json.timelineMarkers ?? []).map(deserializeTimelineMarker);

  const metadata = json.metadata
    ? deserializeMetadata(json.metadata)
    : DEFAULT_METADATA;

  return new World(
    json.version,
    vertices,
    features,
    layers,
    sharedVertexGroups,
    timelineMarkers,
    metadata
  );
}
