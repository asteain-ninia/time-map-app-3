import { DEFAULT_METADATA, DEFAULT_SETTINGS } from '@domain/entities/World';
import { SerializationError } from './jsonSerializerErrors';
import {
  SUPPORTED_VERSION,
  type JsonAnchorPlacement,
  type JsonAnchorProperty,
  type JsonBaseMapSettings,
  type JsonFeature,
  type JsonFeatureAnchor,
  type JsonFeatureShape,
  type JsonLayer,
  type JsonRing,
  type JsonSharedVertexGroup,
  type JsonTimelineMarker,
  type JsonTimePoint,
  type JsonTimeRange,
  type JsonVertex,
  type JsonWorld,
  type JsonWorldMetadata,
  type JsonWorldSettings,
} from './jsonSerializerTypes';

interface MigrationContext {
  readonly warnings: string[];
  warn(message: string): void;
}

interface JsonMigrationResult {
  readonly json: JsonWorld;
  readonly compatibilityWarnings: readonly string[];
}

type JsonRecord = Record<string, unknown>;

function createContext(): MigrationContext {
  const seen = new Set<string>();
  const warnings: string[] = [];
  return {
    warnings,
    warn(message: string): void {
      if (seen.has(message)) return;
      seen.add(message);
      warnings.push(message);
    },
  };
}

function migrateJsonWorld(raw: unknown): JsonMigrationResult {
  if (!isRecord(raw)) {
    throw new SerializationError('Project data must be a JSON object');
  }

  const ctx = createContext();
  resolveVersion(raw, ctx);

  const vertices = requireArray(raw, 'vertices').map((item, index) =>
    normalizeVertex(item, index)
  );
  const featureSources = requireArray(raw, 'features');
  let layers = requireArray(raw, 'layers').map((item, index) =>
    normalizeLayer(item, index, ctx)
  );

  if (layers.length === 0 && featureSources.length > 0) {
    layers = [createDefaultLayer()];
    ctx.warn('レイヤー情報が空の旧形式を読み込んだため、既定レイヤーを追加しました。');
  }

  const defaultLayerId = layers[0]?.id ?? 'default';
  const features = featureSources.map((item, index) =>
    normalizeFeature(item, index, defaultLayerId, ctx)
  );
  const sharedVertexGroups = optionalArray(raw, 'sharedVertexGroups', ctx).map((item, index) =>
    normalizeSharedVertexGroup(item, index)
  );
  const timelineMarkers = optionalArray(raw, 'timelineMarkers', ctx).map((item, index) =>
    normalizeTimelineMarker(item, index)
  );
  const metadata = normalizeMetadata(raw.metadata, ctx);

  return {
    json: {
      version: SUPPORTED_VERSION,
      layers,
      vertices,
      sharedVertexGroups,
      timelineMarkers,
      features,
      metadata,
    },
    compatibilityWarnings: ctx.warnings,
  };
}

function resolveVersion(raw: JsonRecord, ctx: MigrationContext): void {
  const version = raw.version;

  if (typeof version !== 'string' || version.trim().length === 0) {
    if (!looksLikeLegacyProject(raw)) {
      throw new SerializationError('Missing version field');
    }
    ctx.warn(`形式バージョンがない旧形式を ${SUPPORTED_VERSION} として読み込みました。`);
    return;
  }

  if (version === SUPPORTED_VERSION) {
    return;
  }

  if (isMigratableLegacyVersion(version) && looksLikeLegacyProject(raw)) {
    ctx.warn(`形式バージョン ${version} を ${SUPPORTED_VERSION} へ変換しました。`);
    return;
  }

  throw new SerializationError(
    `Unsupported version "${version}" (expected "${SUPPORTED_VERSION}")`
  );
}

function looksLikeLegacyProject(raw: JsonRecord): boolean {
  return Array.isArray(raw.layers) && Array.isArray(raw.vertices) && Array.isArray(raw.features);
}

function isMigratableLegacyVersion(version: string): boolean {
  return /^0\.\d+(?:\.\d+)?$/.test(version);
}

function requireArray(raw: JsonRecord, key: string): readonly unknown[] {
  const value = raw[key];
  if (Array.isArray(value)) return value;
  throw new SerializationError(`Project data is missing required "${key}" array`);
}

function optionalArray(raw: JsonRecord, key: string, ctx: MigrationContext): readonly unknown[] {
  const value = raw[key];
  if (value === undefined) {
    ctx.warn(`${key} がない旧形式を読み込んだため、空配列として補完しました。`);
    return [];
  }
  if (Array.isArray(value)) return value;
  throw new SerializationError(`Project data field "${key}" must be an array`);
}

function normalizeVertex(value: unknown, index: number): JsonVertex {
  const record = expectRecord(value, `vertices[${index}]`);
  return {
    id: requiredString(record, 'id', `vertices[${index}]`),
    x: requiredNumber(record, 'x', `vertices[${index}]`),
    y: requiredNumber(record, 'y', `vertices[${index}]`),
  };
}

function normalizeLayer(value: unknown, index: number, ctx: MigrationContext): JsonLayer {
  const record = expectRecord(value, `layers[${index}]`);
  const id = optionalString(record, 'id') ?? `layer-${index + 1}`;
  if (!optionalString(record, 'id')) {
    ctx.warn('IDがないレイヤーを検出したため、既定IDを補完しました。');
  }

  return {
    id,
    name: optionalString(record, 'name') ?? id,
    order: optionalNumber(record, 'order') ?? index,
    visible: optionalBoolean(record, 'visible') ?? true,
    opacity: optionalNumber(record, 'opacity') ?? 1,
    description: optionalString(record, 'description'),
  };
}

function createDefaultLayer(): JsonLayer {
  return {
    id: 'default',
    name: 'レイヤー1',
    order: 0,
    visible: true,
    opacity: 1,
  };
}

function normalizeSharedVertexGroup(value: unknown, index: number): JsonSharedVertexGroup {
  const record = expectRecord(value, `sharedVertexGroups[${index}]`);
  const representativeCoordinate = expectRecord(
    record.representativeCoordinate,
    `sharedVertexGroups[${index}].representativeCoordinate`
  );
  return {
    id: requiredString(record, 'id', `sharedVertexGroups[${index}]`),
    vertexIds: requiredStringArray(record, 'vertexIds', `sharedVertexGroups[${index}]`),
    representativeCoordinate: {
      x: requiredNumber(representativeCoordinate, 'x', `sharedVertexGroups[${index}].representativeCoordinate`),
      y: requiredNumber(representativeCoordinate, 'y', `sharedVertexGroups[${index}].representativeCoordinate`),
    },
  };
}

function normalizeTimelineMarker(value: unknown, index: number): JsonTimelineMarker {
  const record = expectRecord(value, `timelineMarkers[${index}]`);
  return {
    id: requiredString(record, 'id', `timelineMarkers[${index}]`),
    time: normalizeTimePoint(record.time, `timelineMarkers[${index}].time`),
    label: requiredString(record, 'label', `timelineMarkers[${index}]`),
    description: optionalString(record, 'description'),
  };
}

function normalizeFeature(
  value: unknown,
  index: number,
  defaultLayerId: string,
  ctx: MigrationContext
): JsonFeature {
  const record = expectRecord(value, `features[${index}]`);
  const id = requiredString(record, 'id', `features[${index}]`);
  const featureType = normalizeFeatureType(
    requiredString(record, 'featureType', `features[${index}]`),
    ctx
  );
  const anchors = Array.isArray(record.anchors)
    ? record.anchors.map((anchor, anchorIndex) =>
        normalizeAnchor(anchor, id, anchorIndex, featureType, defaultLayerId, ctx)
      )
    : [normalizeLegacyFeatureAnchor(record, id, featureType, defaultLayerId, ctx)];

  return {
    id,
    featureType,
    anchors,
  };
}

function normalizeFeatureType(value: string, ctx: MigrationContext): string {
  if (value === 'Point' || value === 'Line' || value === 'Polygon') {
    return value;
  }
  if (value === 'LineString') {
    ctx.warn('旧形式の featureType "LineString" を "Line" に変換しました。');
    return 'Line';
  }

  const lower = value.toLowerCase();
  if (lower === 'point') {
    ctx.warn('小文字の featureType "point" を "Point" に変換しました。');
    return 'Point';
  }
  if (lower === 'line') {
    ctx.warn('小文字の featureType "line" を "Line" に変換しました。');
    return 'Line';
  }
  if (lower === 'polygon') {
    ctx.warn('小文字の featureType "polygon" を "Polygon" に変換しました。');
    return 'Polygon';
  }

  return value;
}

function normalizeAnchor(
  value: unknown,
  featureId: string,
  anchorIndex: number,
  featureType: string,
  defaultLayerId: string,
  ctx: MigrationContext
): JsonFeatureAnchor {
  const record = expectRecord(value, `features[${featureId}].anchors[${anchorIndex}]`);
  const id = optionalString(record, 'id') ?? `${featureId}-anchor-${anchorIndex + 1}`;
  if (!optionalString(record, 'id')) {
    ctx.warn('IDがない歴史の錨を検出したため、既定IDを補完しました。');
  }

  return {
    id,
    timeRange: normalizeTimeRange(record.timeRange, record, id, ctx),
    property: normalizeAnchorProperty(record.property, record, ctx),
    shape: normalizeShape(record.shape, record, id, featureType, ctx),
    placement: normalizePlacement(record.placement, record, defaultLayerId, ctx),
  };
}

function normalizeLegacyFeatureAnchor(
  record: JsonRecord,
  featureId: string,
  featureType: string,
  defaultLayerId: string,
  ctx: MigrationContext
): JsonFeatureAnchor {
  ctx.warn('anchors がない旧形式の地物を、単一の歴史の錨へ変換しました。');
  return {
    id: `${featureId}-anchor-1`,
    timeRange: normalizeTimeRange(record.timeRange, record, `${featureId}-anchor-1`, ctx),
    property: normalizeAnchorProperty(record.property, record, ctx),
    shape: normalizeShape(record.shape, record, `${featureId}-anchor-1`, featureType, ctx),
    placement: normalizePlacement(record.placement, record, defaultLayerId, ctx),
  };
}

function normalizeTimeRange(
  value: unknown,
  fallbackSource: JsonRecord,
  anchorId: string,
  ctx: MigrationContext
): JsonTimeRange {
  if (isRecord(value)) {
    return {
      start: normalizeTimePoint(value.start, `anchor ${anchorId}.timeRange.start`),
      end: value.end === undefined
        ? undefined
        : normalizeTimePoint(value.end, `anchor ${anchorId}.timeRange.end`),
    };
  }

  if (fallbackSource.time !== undefined) {
    ctx.warn('旧形式の time を timeRange.start に変換しました。');
    return { start: normalizeTimePoint(fallbackSource.time, `anchor ${anchorId}.time`) };
  }
  if (typeof fallbackSource.startYear === 'number') {
    ctx.warn('旧形式の startYear を timeRange.start.year に変換しました。');
    const range: JsonTimeRange = { start: { year: fallbackSource.startYear } };
    if (typeof fallbackSource.endYear === 'number') {
      range.end = { year: fallbackSource.endYear };
    }
    return range;
  }

  ctx.warn('timeRange がない旧形式の錨を、年0開始として補完しました。');
  return { start: { year: DEFAULT_METADATA.sliderMin } };
}

function normalizeTimePoint(value: unknown, path: string): JsonTimePoint {
  if (typeof value === 'number') {
    return { year: value };
  }
  const record = expectRecord(value, path);
  return {
    year: requiredNumber(record, 'year', path),
    month: optionalNumber(record, 'month'),
    day: optionalNumber(record, 'day'),
  };
}

function normalizeAnchorProperty(
  value: unknown,
  fallbackSource: JsonRecord,
  ctx: MigrationContext
): JsonAnchorProperty {
  const projection = firstRecord(fallbackSource.properties);
  const source = isRecord(value) ? value : projection ?? fallbackSource;
  if (!isRecord(value) && projection) {
    ctx.warn('旧形式の properties[0] を歴史の錨の property に変換しました。');
  }

  const kind = optionalString(source, 'kind');
  return {
    name: optionalString(source, 'name') ?? '',
    description: optionalString(source, 'description') ?? '',
    labelVisibility: isRecord(source.labelVisibility)
      ? {
          minZoom: optionalNumber(source.labelVisibility, 'minZoom'),
          minDisplayLength: optionalNumber(source.labelVisibility, 'minDisplayLength'),
        }
      : undefined,
    style: isRecord(source.style) ? normalizePolygonStyle(source.style) : undefined,
    attributes: isRecord(source.attributes) ? { ...source.attributes } : undefined,
    kind: kind && kind !== '' ? kind : undefined,
  };
}

function normalizePolygonStyle(source: JsonRecord): JsonAnchorProperty['style'] {
  return {
    fillColor: optionalString(source, 'fillColor') ?? 'rgba(136, 136, 136, 0.6)',
    selectedFillColor: optionalString(source, 'selectedFillColor') ?? 'rgba(255, 170, 68, 0.8)',
    autoColor: optionalBoolean(source, 'autoColor') ?? true,
    palette: optionalString(source, 'palette') ?? DEFAULT_SETTINGS.defaultPalette,
  };
}

function normalizeShape(
  value: unknown,
  fallbackSource: JsonRecord,
  anchorId: string,
  featureType: string,
  ctx: MigrationContext
): JsonFeatureShape {
  const source = isRecord(value) ? value : fallbackSource;
  if (!isRecord(value)) {
    ctx.warn('旧形式の地物直下の形状情報を、歴史の錨の shape に移しました。');
  }

  const rawType = optionalString(source, 'type') ?? shapeTypeFromFeatureType(featureType);
  const shapeType = normalizeShapeType(rawType, featureType, ctx);

  if (shapeType === 'Point') {
    const vertexId = optionalString(source, 'vertexId');
    return vertexId ? { type: 'Point', vertexId } : { type: 'Point' };
  }

  if (shapeType === 'LineString') {
    const vertexIds = optionalStringArray(source, 'vertexIds');
    return vertexIds ? { type: 'LineString', vertexIds } : { type: 'LineString' };
  }

  if (shapeType !== 'Polygon') {
    return { type: shapeType };
  }

  if (Array.isArray(source.rings)) {
    return {
      type: 'Polygon',
      rings: source.rings.map((ring, index) => normalizeRing(ring, anchorId, index, ctx)),
    };
  }

  if (isRecord(value) && source.vertexIds === undefined) {
    return { type: 'Polygon' };
  }

  return {
    type: 'Polygon',
    rings: [normalizeLegacyPolygonRing(source, anchorId, ctx)],
  };
}

function shapeTypeFromFeatureType(featureType: string): string {
  return featureType === 'Line' ? 'LineString' : featureType;
}

function normalizeShapeType(value: string, featureType: string, ctx: MigrationContext): string {
  if (value === 'Point' || value === 'LineString' || value === 'Polygon') {
    return value;
  }
  if (value === 'Line' && featureType === 'Line') {
    ctx.warn('旧形式の shape.type "Line" を "LineString" に変換しました。');
    return 'LineString';
  }
  return value;
}

function normalizeRing(
  value: unknown,
  anchorId: string,
  index: number,
  ctx: MigrationContext
): JsonRing {
  const record = expectRecord(value, `anchor ${anchorId}.shape.rings[${index}]`);
  const id = optionalString(record, 'id') ?? `${anchorId}-ring-${index + 1}`;
  const ringType = optionalString(record, 'ringType') ?? (index === 0 ? 'territory' : 'hole');
  if (!optionalString(record, 'ringType')) {
    ctx.warn('ringType がない旧形式のリングを検出したため、位置に基づいて補完しました。');
  }

  return {
    id,
    vertexIds: requiredStringArray(record, 'vertexIds', `anchor ${anchorId}.shape.rings[${index}]`),
    ringType,
    parentId: normalizeParentId(record.parentId, ringType, anchorId, index),
  };
}

function normalizeLegacyPolygonRing(
  source: JsonRecord,
  anchorId: string,
  ctx: MigrationContext
): JsonRing {
  ctx.warn('旧形式の Polygon.vertexIds を territory リングに変換しました。');
  return {
    id: `${anchorId}-ring-1`,
    vertexIds: requiredStringArray(source, 'vertexIds', `anchor ${anchorId}.shape`),
    ringType: 'territory',
    parentId: null,
  };
}

function normalizeParentId(
  value: unknown,
  ringType: string,
  anchorId: string,
  index: number
): string | null {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  if (ringType === 'hole' && index > 0) return `${anchorId}-ring-1`;
  return null;
}

function normalizePlacement(
  value: unknown,
  fallbackSource: JsonRecord,
  defaultLayerId: string,
  ctx: MigrationContext
): JsonAnchorPlacement {
  const source = isRecord(value) ? value : fallbackSource;
  if (!isRecord(value)) {
    ctx.warn('placement がない旧形式の錨を検出したため、所属情報を補完しました。');
  }

  const parentId = typeof source.parentId === 'string' ? source.parentId : null;
  const isTopLevel = normalizeIsTopLevel(source.isTopLevel, parentId, ctx);
  return {
    layerId: optionalString(source, 'layerId') ?? defaultLayerId,
    parentId,
    childIds: Array.isArray(source.childIds)
      ? source.childIds.filter((id): id is string => typeof id === 'string')
      : [],
    isTopLevel,
  };
}

function normalizeIsTopLevel(
  value: unknown,
  parentId: string | null,
  ctx: MigrationContext
): boolean {
  const derived = parentId === null;
  if (typeof value !== 'boolean') {
    ctx.warn('placement.isTopLevel がない旧形式の錨を検出したため、parentId から派生しました。');
    return derived;
  }
  if (value !== derived) {
    ctx.warn(
      'placement.isTopLevel と parentId の不変条件が崩れた錨を検出したため、parentId から再派生しました。'
    );
    return derived;
  }
  return value;
}

function normalizeMetadata(value: unknown, ctx: MigrationContext): JsonWorldMetadata {
  if (!isRecord(value)) {
    ctx.warn('metadata がない旧形式を読み込んだため、プロジェクト設定を既定値で補完しました。');
    return defaultMetadata();
  }

  return {
    sliderMin: optionalNumber(value, 'sliderMin') ?? DEFAULT_METADATA.sliderMin,
    sliderMax: optionalNumber(value, 'sliderMax') ?? DEFAULT_METADATA.sliderMax,
    worldName: optionalString(value, 'worldName') ?? DEFAULT_METADATA.worldName,
    worldDescription: optionalString(value, 'worldDescription') ?? DEFAULT_METADATA.worldDescription,
    settings: normalizeSettings(value.settings, ctx),
  };
}

function normalizeSettings(value: unknown, ctx: MigrationContext): JsonWorldSettings {
  if (!isRecord(value)) {
    ctx.warn('metadata.settings がない旧形式を読み込んだため、表示設定を既定値で補完しました。');
    return defaultSettings();
  }

  if (!isRecord(value.baseMap)) {
    ctx.warn('metadata.settings.baseMap がない旧形式を読み込んだため、プリセット地図設定を補完しました。');
  }

  return {
    zoomMin: optionalNumber(value, 'zoomMin') ?? DEFAULT_SETTINGS.zoomMin,
    zoomMax: optionalNumber(value, 'zoomMax') ?? DEFAULT_SETTINGS.zoomMax,
    gridInterval: optionalNumber(value, 'gridInterval') ?? DEFAULT_SETTINGS.gridInterval,
    gridColor: optionalString(value, 'gridColor') ?? DEFAULT_SETTINGS.gridColor,
    gridOpacity: optionalNumber(value, 'gridOpacity') ?? DEFAULT_SETTINGS.gridOpacity,
    autoSaveInterval: optionalNumber(value, 'autoSaveInterval') ?? DEFAULT_SETTINGS.autoSaveInterval,
    equatorLength: optionalNumber(value, 'equatorLength') ?? DEFAULT_SETTINGS.equatorLength,
    oblateness: optionalNumber(value, 'oblateness') ?? DEFAULT_SETTINGS.oblateness,
    labelAreaThreshold: optionalNumber(value, 'labelAreaThreshold') ?? DEFAULT_SETTINGS.labelAreaThreshold,
    defaultAutoColor: optionalBoolean(value, 'defaultAutoColor') ?? DEFAULT_SETTINGS.defaultAutoColor,
    defaultPalette: optionalString(value, 'defaultPalette') ?? DEFAULT_SETTINGS.defaultPalette,
    customPalettes: Array.isArray(value.customPalettes)
      ? value.customPalettes.filter((entry): entry is string => typeof entry === 'string')
      : [...DEFAULT_SETTINGS.customPalettes],
    baseMap: normalizeBaseMapSettings(value.baseMap),
  };
}

function normalizeBaseMapSettings(value: unknown): JsonBaseMapSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_SETTINGS.baseMap };
  }
  return {
    mode: optionalString(value, 'mode'),
    fileName: optionalString(value, 'fileName'),
    svgText: typeof value.svgText === 'string' ? value.svgText : null,
  };
}

function defaultMetadata(): JsonWorldMetadata {
  return {
    sliderMin: DEFAULT_METADATA.sliderMin,
    sliderMax: DEFAULT_METADATA.sliderMax,
    worldName: DEFAULT_METADATA.worldName,
    worldDescription: DEFAULT_METADATA.worldDescription,
    settings: defaultSettings(),
  };
}

function defaultSettings(): JsonWorldSettings {
  return {
    zoomMin: DEFAULT_SETTINGS.zoomMin,
    zoomMax: DEFAULT_SETTINGS.zoomMax,
    gridInterval: DEFAULT_SETTINGS.gridInterval,
    gridColor: DEFAULT_SETTINGS.gridColor,
    gridOpacity: DEFAULT_SETTINGS.gridOpacity,
    autoSaveInterval: DEFAULT_SETTINGS.autoSaveInterval,
    equatorLength: DEFAULT_SETTINGS.equatorLength,
    oblateness: DEFAULT_SETTINGS.oblateness,
    labelAreaThreshold: DEFAULT_SETTINGS.labelAreaThreshold,
    defaultAutoColor: DEFAULT_SETTINGS.defaultAutoColor,
    defaultPalette: DEFAULT_SETTINGS.defaultPalette,
    customPalettes: [...DEFAULT_SETTINGS.customPalettes],
    baseMap: { ...DEFAULT_SETTINGS.baseMap },
  };
}

function requiredString(record: JsonRecord, key: string, path: string): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  throw new SerializationError(`${path}.${key} must be a string`);
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function requiredNumber(record: JsonRecord, key: string, path: string): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new SerializationError(`${path}.${key} must be a number`);
}

function optionalNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function requiredStringArray(record: JsonRecord, key: string, path: string): string[] {
  const value = record[key];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return [...value];
  }
  throw new SerializationError(`${path}.${key} must be a string array`);
}

function optionalStringArray(record: JsonRecord, key: string): string[] | undefined {
  const value = record[key];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return [...value];
  }
  return undefined;
}

function firstRecord(value: unknown): JsonRecord | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return isRecord(first) ? first : null;
}

function expectRecord(value: unknown, path: string): JsonRecord {
  if (isRecord(value)) return value;
  throw new SerializationError(`${path} must be an object`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { migrateJsonWorld, type JsonMigrationResult };
