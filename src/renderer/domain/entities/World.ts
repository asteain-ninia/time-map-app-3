import type { Vertex } from './Vertex';
import type { Feature } from './Feature';
import type { Layer } from './Layer';
import type { SharedVertexGroup } from './SharedVertexGroup';
import { TimelineMarker } from './TimelineMarker';
export { TimelineMarker } from './TimelineMarker';

/** プロジェクト設定 */
export interface WorldSettings {
  readonly zoomMin: number;
  readonly zoomMax: number;
  readonly gridInterval: number;
  readonly gridColor: string;
  readonly gridOpacity: number;
  readonly autoSaveInterval: number;
  readonly equatorLength: number;
  readonly oblateness: number;
  readonly labelAreaThreshold: number;
  readonly defaultAutoColor: boolean;
  readonly defaultPalette: string;
  readonly customPalettes: readonly string[];
}

/** メタデータ */
export interface WorldMetadata {
  readonly sliderMin: number;
  readonly sliderMax: number;
  readonly worldName: string;
  readonly worldDescription: string;
  readonly settings: WorldSettings;
}

/** デフォルトの設定 */
export const DEFAULT_SETTINGS: WorldSettings = {
  zoomMin: 1,
  zoomMax: 50,
  gridInterval: 10,
  gridColor: '#888888',
  gridOpacity: 0.3,
  autoSaveInterval: 300,
  equatorLength: 40000,
  oblateness: 0.00335,
  labelAreaThreshold: 0.0005,
  defaultAutoColor: true,
  defaultPalette: 'クラシック',
  customPalettes: []
};

/** デフォルトのメタデータ */
export const DEFAULT_METADATA: WorldMetadata = {
  sliderMin: 0,
  sliderMax: 10000,
  worldName: '新しい世界',
  worldDescription: '',
  settings: DEFAULT_SETTINGS
};

/**
 * 集約ルート: World
 * アプリケーション内の全データを保持する最上位エンティティ。
 */
export class World {
  readonly version: string;
  readonly vertices: ReadonlyMap<string, Vertex>;
  readonly features: ReadonlyMap<string, Feature>;
  readonly layers: readonly Layer[];
  readonly sharedVertexGroups: ReadonlyMap<string, SharedVertexGroup>;
  readonly timelineMarkers: readonly TimelineMarker[];
  readonly metadata: WorldMetadata;

  constructor(
    version: string,
    vertices: ReadonlyMap<string, Vertex>,
    features: ReadonlyMap<string, Feature>,
    layers: readonly Layer[],
    sharedVertexGroups: ReadonlyMap<string, SharedVertexGroup>,
    timelineMarkers: readonly TimelineMarker[],
    metadata: WorldMetadata
  ) {
    this.version = version;
    this.vertices = vertices;
    this.features = features;
    this.layers = layers;
    this.sharedVertexGroups = sharedVertexGroups;
    this.timelineMarkers = timelineMarkers;
    this.metadata = metadata;
  }

  /** 空のWorldを作成 */
  static createEmpty(): World {
    return new World(
      '1.0.0',
      new Map(),
      new Map(),
      [],
      new Map(),
      [],
      DEFAULT_METADATA
    );
  }

  /** レイヤーを序列順にソートして取得 */
  getSortedLayers(): readonly Layer[] {
    return [...this.layers].sort((a, b) => a.order - b.order);
  }
}
