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
  resolveVersion(raw);

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

  const featureIds = collectFeatureIds(featureSources);
  const features = featureSources.map((item, index) =>
    normalizeFeature(item, index, featureIds, ctx)
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

function resolveVersion(raw: JsonRecord): void {
  const version = raw.version;

  // 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
  // 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
  // 現状.md §6.2「既存 .gimoza 互換性は破棄する（移行マイグレーションは実装しない）」。
  // version 欠落は旧形式（0.x 系）のマーカー、0.x 系も旧モデル時代のバージョンとして拒否する。
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new SerializationError('Missing version field');
  }

  if (version === SUPPORTED_VERSION) {
    return;
  }

  throw new SerializationError(
    `Unsupported version "${version}" (expected "${SUPPORTED_VERSION}")`
  );
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
  featureIds: ReadonlySet<string>,
  ctx: MigrationContext
): JsonFeature {
  const record = expectRecord(value, `features[${index}]`);
  const id = requiredString(record, 'id', `features[${index}]`);
  const featureType = normalizeFeatureType(
    requiredString(record, 'featureType', `features[${index}]`)
  );
  if (!Array.isArray(record.anchors)) {
    throw new SerializationError(`features[${index}].anchors must be an array`);
  }
  const anchors = record.anchors.map((anchor, anchorIndex) =>
    normalizeAnchor(anchor, id, anchorIndex, featureType, featureIds, ctx)
  );

  return {
    id,
    featureType,
    anchors,
  };
}

/**
 * features 配列から id セットを抽出する。
 * `resolveShape` のコンテナ判定（`shape` 欠落 + `childIds` 非空）の前提条件として、
 * `childIds` が実在する feature を指していることを確認するために使う。
 * （要件定義書 §2.5.2 「子の親側参照欠落」検出の最低限の実装）
 */
function collectFeatureIds(featureSources: readonly unknown[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const source of featureSources) {
    if (isRecord(source) && typeof source.id === 'string') {
      ids.add(source.id);
    }
  }
  return ids;
}

function normalizeFeatureType(value: string): string {
  if (value === 'Point' || value === 'Line' || value === 'Polygon') {
    return value;
  }
  throw new SerializationError(`Unknown feature type: ${value}`);
}

function normalizeAnchor(
  value: unknown,
  featureId: string,
  anchorIndex: number,
  featureType: string,
  featureIds: ReadonlySet<string>,
  ctx: MigrationContext
): JsonFeatureAnchor {
  const record = expectRecord(value, `features[${featureId}].anchors[${anchorIndex}]`);
  const id = optionalString(record, 'id') ?? `${featureId}-anchor-${anchorIndex + 1}`;
  if (!optionalString(record, 'id')) {
    ctx.warn('IDがない歴史の錨を検出したため、既定IDを補完しました。');
  }

  const placement = normalizePlacement(record.placement, record, ctx);
  return {
    id,
    timeRange: normalizeTimeRange(record.timeRange, id),
    property: normalizeAnchorProperty(record.property),
    shape: resolveShape(record, id, featureType, placement, featureIds, ctx),
    placement,
  };
}

/**
 * shape の有無を判定し、欠落時はコンテナ（Polygon + 子あり）または
 * SerializationError として扱う。詳細は 要件定義書.md §4.1（`shape`?）を参照。
 * コンテナ昇格の前提として `childIds` が実在する feature を指していることも確認する
 * （要件定義書 §2.5.2「子の親側参照欠落」検出の最低限の実装。Phase 3 で親側からの
 * 相互参照や循環検出に拡張予定）。
 */
function resolveShape(
  record: JsonRecord,
  anchorId: string,
  featureType: string,
  placement: JsonAnchorPlacement,
  featureIds: ReadonlySet<string>,
  ctx: MigrationContext
): JsonFeatureShape | undefined {
  if (isRecord(record.shape)) {
    return normalizeShape(record.shape, anchorId, featureType);
  }

  if (featureType === 'Polygon' && placement.childIds.length > 0) {
    const orphans = placement.childIds.filter((childId) => !featureIds.has(childId));
    if (orphans.length > 0) {
      throw new SerializationError(
        `Anchor "${anchorId}" has no shape and references non-existent child feature(s): ${orphans.join(', ')}`
      );
    }
    ctx.warn('shape を持たない集約地物（Polygon + childIds あり）を検出したため、形状フィールドを省略しました。');
    return undefined;
  }

  if (featureType === 'Polygon') {
    throw new SerializationError(
      `Anchor "${anchorId}" has no shape but is not a container (childIds is empty)`
    );
  }
  throw new SerializationError(
    `Anchor "${anchorId}" of type "${featureType}" requires a shape`
  );
}

function normalizeTimeRange(value: unknown, anchorId: string): JsonTimeRange {
  const record = expectRecord(value, `anchor ${anchorId}.timeRange`);
  return {
    start: normalizeTimePoint(record.start, `anchor ${anchorId}.timeRange.start`),
    end: record.end === undefined
      ? undefined
      : normalizeTimePoint(record.end, `anchor ${anchorId}.timeRange.end`),
  };
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

function normalizeAnchorProperty(value: unknown): JsonAnchorProperty {
  const source = expectRecord(value, 'anchor.property');

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
  anchorId: string,
  featureType: string
): JsonFeatureShape {
  const source = expectRecord(value, `anchor ${anchorId}.shape`);
  const shapeType = optionalString(source, 'type') ?? defaultShapeType(featureType);

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
      rings: source.rings.map((ring, index) => normalizeRing(ring, anchorId, index)),
    };
  }

  return { type: 'Polygon' };
}

function defaultShapeType(featureType: string): string {
  return featureType === 'Line' ? 'LineString' : featureType;
}

function normalizeRing(value: unknown, anchorId: string, index: number): JsonRing {
  const record = expectRecord(value, `anchor ${anchorId}.shape.rings[${index}]`);
  const id = optionalString(record, 'id') ?? `${anchorId}-ring-${index + 1}`;
  const ringType = requiredString(record, 'ringType', `anchor ${anchorId}.shape.rings[${index}]`);

  return {
    id,
    vertexIds: requiredStringArray(record, 'vertexIds', `anchor ${anchorId}.shape.rings[${index}]`),
    ringType,
    parentId: typeof record.parentId === 'string' ? record.parentId : null,
  };
}

function normalizePlacement(
  value: unknown,
  fallbackSource: JsonRecord,
  ctx: MigrationContext
): JsonAnchorPlacement {
  const source = isRecord(value) ? value : fallbackSource;

  // 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
  // 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
  // 現状.md §6.2「既存 .gimoza 互換性は破棄する（移行マイグレーションは実装しない）」。
  // Phase 2-D-6-3c で `placement.layerId` を完全撤去したため、本フィールドを含むファイルは
  // 旧モデルのマーカーとして拒否する。fallback 用 warning より先に判定する。
  if ('layerId' in source) {
    throw new SerializationError(
      '旧モデル（placement.layerId を含む形式）のファイルは互換性なしとして拒否されました。新規プロジェクトを開始してください。'
    );
  }

  if (!isRecord(value)) {
    ctx.warn('placement がない旧形式の錨を検出したため、所属情報を補完しました。');
  }

  const parentId = typeof source.parentId === 'string' ? source.parentId : null;
  const isTopLevel = normalizeIsTopLevel(source.isTopLevel, parentId, ctx);
  return {
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

function expectRecord(value: unknown, path: string): JsonRecord {
  if (isRecord(value)) return value;
  throw new SerializationError(`${path} must be an object`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { migrateJsonWorld, type JsonMigrationResult };
