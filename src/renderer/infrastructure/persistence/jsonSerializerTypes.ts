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
  kind?: string;
}

interface JsonAnchorPlacement {
  parentId: string | null;
  childIds: string[];
  isTopLevel: boolean;
}

interface JsonTimeRange {
  start: JsonTimePoint;
  end?: JsonTimePoint;
}

interface JsonFeatureAnchor {
  id: string;
  timeRange: JsonTimeRange;
  property: JsonAnchorProperty;
  /**
   * 形状定義。末端地物（リーフ）のみが保持する。集約地物（コンテナ）は
   * このフィールド自体を出力しない。
   */
  shape?: JsonFeatureShape;
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
  baseMap?: JsonBaseMapSettings;
}

interface JsonBaseMapSettings {
  mode?: string;
  fileName?: string;
  svgText?: string | null;
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
  vertices: JsonVertex[];
  sharedVertexGroups: JsonSharedVertexGroup[];
  timelineMarkers: JsonTimelineMarker[];
  features: JsonFeature[];
  metadata: JsonWorldMetadata;
}

const SUPPORTED_VERSION = '1.0.0';

export type {
  JsonAnchorPlacement,
  JsonAnchorProperty,
  JsonBaseMapSettings,
  JsonCoordinate,
  JsonFeature,
  JsonFeatureAnchor,
  JsonFeatureShape,
  JsonLabelVisibility,
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
};

export { SUPPORTED_VERSION };
