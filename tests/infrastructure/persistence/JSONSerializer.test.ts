import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  deserializeWithReport,
  SerializationError,
} from '@infrastructure/persistence/JSONSerializer';
import { World, DEFAULT_METADATA, DEFAULT_SETTINGS } from '@domain/entities/World';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';

/** 最小限のWorldを作成 */
function createMinimalWorld(): World {
  return World.createEmpty();
}

/** テスト用のポイント地物を含むWorldを作成 */
function createWorldWithPoint(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));

  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(1000, 3, 15) },
    { name: '城', description: '要塞' },
    { type: 'Point', vertexId: 'v1' },
    { parentId: null, childIds: [], isTopLevel: true }
  );
  const feature = new Feature('f1', 'Point', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  return new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);
}

/** テスト用のライン地物を含むWorldを作成 */
function createWorldWithLine(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
  vertices.set('v2', new Vertex('v2', new Coordinate(10, 10)));
  vertices.set('v3', new Vertex('v3', new Coordinate(20, 0)));

  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(500), end: new TimePoint(1500) },
    { name: '街道', description: '主要街道' },
    { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] },
    { parentId: null, childIds: [], isTopLevel: true }
  );
  const feature = new Feature('f1', 'Line', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  return new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);
}

/** テスト用のポリゴン地物を含むWorldを作成 */
function createWorldWithPolygon(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
  vertices.set('v2', new Vertex('v2', new Coordinate(10, 0)));
  vertices.set('v3', new Vertex('v3', new Coordinate(10, 10)));
  vertices.set('v4', new Vertex('v4', new Coordinate(0, 10)));

  const ring = new Ring('r1', ['v1', 'v2', 'v3', 'v4'], 'territory', null);
  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(1000) },
    {
      name: '王国A',
      description: '北方の王国',
      style: {
        fillColor: 'rgba(255,136,136,1.0)',
        selectedFillColor: 'rgba(255,170,170,1.0)',
        autoColor: true,
        palette: 'クラシック',
      },
    },
    { type: 'Polygon', rings: [ring] },
    { parentId: null, childIds: ['f2'], isTopLevel: true }
  );
  const feature = new Feature('f1', 'Polygon', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  // childIds: ['f2'] が指す子地物を実在させる（Phase 3-1: 参照整合 — 子は存在する Polygon）。
  // Phase 3-4（親 ≡ 子の和）: f1 は shape あり + 子ありの移行期間ノードのため、子 f2 の形状を
  // 親 f1 と同一の全体正方形にして「親形状 ≡ 子の和」を満たす（ロード時検証を通すため）。
  const childRing = new Ring('r2', ['v1', 'v2', 'v3', 'v4'], 'territory', null);
  const childAnchor = new FeatureAnchor(
    'a2',
    { start: new TimePoint(1000) },
    { name: '属国B', description: '南方の属国' },
    { type: 'Polygon', rings: [childRing] },
    { parentId: 'f1', childIds: [], isTopLevel: false }
  );
  features.set('f2', new Feature('f2', 'Polygon', [childAnchor]));

  return new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);
}

/** 全データを含むWorldを作成 */
function createFullWorld(): World {
  const vertices = new Map<string, Vertex>();
  vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));
  vertices.set('v2', new Vertex('v2', new Coordinate(10, 20)));

  const features = new Map<string, Feature>();
  const anchor = new FeatureAnchor(
    'a1',
    { start: new TimePoint(100) },
    { name: 'ポイント', description: '' },
    { type: 'Point', vertexId: 'v1' },
    { parentId: null, childIds: [], isTopLevel: true }
  );
  features.set('f1', new Feature('f1', 'Point', [anchor]));

  const sharedVertexGroups = new Map<string, SharedVertexGroup>();
  sharedVertexGroups.set(
    'svg1',
    new SharedVertexGroup('svg1', ['v1', 'v2'], new Coordinate(10, 20))
  );

  const timelineMarkers = [
    { id: 'm1', time: new TimePoint(500, 6), label: '大戦争', description: '世界大戦' },
  ];

  const metadata = {
    ...DEFAULT_METADATA,
    worldName: 'テスト世界',
    worldDescription: '説明文',
  };

  return new World('1.0.0', vertices, features, sharedVertexGroups, timelineMarkers, metadata);
}

function createValidJsonWorld(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '1.0.0',
    vertices: [{ id: 'v1', x: 0, y: 0 }],
    features: [{
      id: 'f1',
      featureType: 'Point',
      anchors: [{
        id: 'a1',
        timeRange: { start: { year: 100 } },
        property: { name: 'test', description: '' },
        shape: { type: 'Point', vertexId: 'v1' },
        placement: { parentId: null, childIds: [], isTopLevel: true },
      }],
    }],
    sharedVertexGroups: [],
    timelineMarkers: [],
    metadata: DEFAULT_METADATA,
    ...overrides,
  };
}

describe('JSONSerializer', () => {
  describe('serialize', () => {
    it('空のWorldをシリアライズできる', () => {
      const world = createMinimalWorld();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.vertices).toEqual([]);
      expect(parsed.features).toEqual([]);
      expect(parsed.sharedVertexGroups).toEqual([]);
      expect(parsed.timelineMarkers).toEqual([]);
      expect(parsed.metadata).toBeDefined();
    });

    it('ポイント地物をシリアライズできる', () => {
      const world = createWorldWithPoint();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.vertices).toHaveLength(1);
      expect(parsed.vertices[0]).toEqual({ id: 'v1', x: 10, y: 20 });

      expect(parsed.features).toHaveLength(1);
      expect(parsed.features[0].featureType).toBe('Point');
      expect(parsed.features[0].anchors[0].shape.type).toBe('Point');
      expect(parsed.features[0].anchors[0].shape.vertexId).toBe('v1');
    });

    it('ライン地物をシリアライズできる', () => {
      const world = createWorldWithLine();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.vertices).toHaveLength(3);
      expect(parsed.features[0].anchors[0].shape.type).toBe('LineString');
      expect(parsed.features[0].anchors[0].shape.vertexIds).toEqual(['v1', 'v2', 'v3']);
    });

    it('ポリゴン地物をシリアライズできる', () => {
      const world = createWorldWithPolygon();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      const shape = parsed.features[0].anchors[0].shape;
      expect(shape.type).toBe('Polygon');
      expect(shape.rings).toHaveLength(1);
      expect(shape.rings[0].vertexIds).toEqual(['v1', 'v2', 'v3', 'v4']);
      expect(shape.rings[0].ringType).toBe('territory');
      expect(shape.rings[0].parentId).toBeNull();
    });

    it('TimePointの月・日が正しくシリアライズされる', () => {
      const world = createWorldWithPoint();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      const timeRange = parsed.features[0].anchors[0].timeRange;
      expect(timeRange.start.year).toBe(1000);
      expect(timeRange.start.month).toBe(3);
      expect(timeRange.start.day).toBe(15);
    });

    it('終了時間ありのTimeRangeをシリアライズできる', () => {
      const world = createWorldWithLine();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      const timeRange = parsed.features[0].anchors[0].timeRange;
      expect(timeRange.start.year).toBe(500);
      expect(timeRange.end.year).toBe(1500);
    });

    it('PolygonStyleをシリアライズできる', () => {
      const world = createWorldWithPolygon();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      const style = parsed.features[0].anchors[0].property.style;
      expect(style.fillColor).toBe('rgba(255,136,136,1.0)');
      expect(style.autoColor).toBe(true);
      expect(style.palette).toBe('クラシック');
    });

    it('共有頂点グループをシリアライズできる', () => {
      const world = createFullWorld();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.sharedVertexGroups).toHaveLength(1);
      expect(parsed.sharedVertexGroups[0].id).toBe('svg1');
      expect(parsed.sharedVertexGroups[0].vertexIds).toEqual(['v1', 'v2']);
      expect(parsed.sharedVertexGroups[0].representativeCoordinate).toEqual({ x: 10, y: 20 });
    });

    it('タイムラインマーカーをシリアライズできる', () => {
      const world = createFullWorld();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.timelineMarkers).toHaveLength(1);
      expect(parsed.timelineMarkers[0].label).toBe('大戦争');
      expect(parsed.timelineMarkers[0].time.year).toBe(500);
      expect(parsed.timelineMarkers[0].time.month).toBe(6);
      expect(parsed.timelineMarkers[0].description).toBe('世界大戦');
    });

    it('メタデータをシリアライズできる', () => {
      const world = createFullWorld();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.worldName).toBe('テスト世界');
      expect(parsed.metadata.worldDescription).toBe('説明文');
      expect(parsed.metadata.settings.gridColor).toBe('#888888');
    });

    it('カスタムベースマップ設定をシリアライズできる', () => {
      const metadata = {
        ...DEFAULT_METADATA,
        settings: {
          ...DEFAULT_SETTINGS,
          baseMap: {
            mode: 'custom' as const,
            fileName: 'world.svg',
            svgText: '<svg viewBox="0 0 360 180"></svg>',
          },
        },
      };
      const world = new World('1.0.0', new Map(), new Map(), new Map(), [], metadata);
      const parsed = JSON.parse(serialize(world));

      expect(parsed.metadata.settings.baseMap).toEqual(metadata.settings.baseMap);
    });

    it('placement.childIdsをシリアライズできる', () => {
      const world = createWorldWithPolygon();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.features[0].anchors[0].placement.childIds).toEqual(['f2']);
    });
  });

  describe('deserialize', () => {
    it('空のWorldをデシリアライズできる', () => {
      const world = createMinimalWorld();
      const json = serialize(world);
      const restored = deserialize(json);

      expect(restored.version).toBe('1.0.0');
      expect(restored.vertices.size).toBe(0);
      expect(restored.features.size).toBe(0);
    });

    it('ポイント地物をラウンドトリップできる', () => {
      const original = createWorldWithPoint();
      const restored = deserialize(serialize(original));

      expect(restored.features.size).toBe(1);
      const f = restored.features.get('f1')!;
      expect(f.featureType).toBe('Point');
      expect(f.anchors[0].shape.type).toBe('Point');
      if (f.anchors[0].shape.type === 'Point') {
        expect(f.anchors[0].shape.vertexId).toBe('v1');
      }
      expect(f.anchors[0].property.name).toBe('城');
      expect(f.anchors[0].timeRange.start.year).toBe(1000);
      expect(f.anchors[0].timeRange.start.month).toBe(3);
      expect(f.anchors[0].timeRange.start.day).toBe(15);
    });

    it('ライン地物をラウンドトリップできる', () => {
      const original = createWorldWithLine();
      const restored = deserialize(serialize(original));

      const f = restored.features.get('f1')!;
      expect(f.featureType).toBe('Line');
      if (f.anchors[0].shape.type === 'LineString') {
        expect(f.anchors[0].shape.vertexIds).toEqual(['v1', 'v2', 'v3']);
      }
      expect(f.anchors[0].timeRange.end!.year).toBe(1500);
    });

    it('ポリゴン地物をラウンドトリップできる', () => {
      const original = createWorldWithPolygon();
      const restored = deserialize(serialize(original));

      const f = restored.features.get('f1')!;
      expect(f.featureType).toBe('Polygon');
      if (f.anchors[0].shape.type === 'Polygon') {
        expect(f.anchors[0].shape.rings).toHaveLength(1);
        expect(f.anchors[0].shape.rings[0].ringType).toBe('territory');
        expect(f.anchors[0].shape.rings[0].vertexIds).toEqual(['v1', 'v2', 'v3', 'v4']);
      }
      expect(f.anchors[0].property.style!.fillColor).toBe('rgba(255,136,136,1.0)');
    });

    it('全データをラウンドトリップできる', () => {
      const original = createFullWorld();
      const restored = deserialize(serialize(original));

      expect(restored.vertices.size).toBe(2);
      expect(restored.features.size).toBe(1);
      expect(restored.sharedVertexGroups.size).toBe(1);
      expect(restored.timelineMarkers).toHaveLength(1);
      expect(restored.metadata.worldName).toBe('テスト世界');

      const svg = restored.sharedVertexGroups.get('svg1')!;
      expect(svg.vertexIds).toEqual(['v1', 'v2']);
      expect(svg.representativeCoordinate.x).toBe(10);

      expect(restored.timelineMarkers[0].label).toBe('大戦争');
    });

    it('頂点座標がドメインオブジェクトに復元される', () => {
      const original = createWorldWithPoint();
      const restored = deserialize(serialize(original));

      const v = restored.vertices.get('v1')!;
      expect(v).toBeInstanceOf(Vertex);
      expect(v.coordinate).toBeInstanceOf(Coordinate);
      expect(v.x).toBe(10);
      expect(v.y).toBe(20);
    });

    it('TimePointがドメインオブジェクトに復元される', () => {
      const original = createWorldWithPoint();
      const restored = deserialize(serialize(original));

      const tp = restored.features.get('f1')!.anchors[0].timeRange.start;
      expect(tp).toBeInstanceOf(TimePoint);
      expect(tp.year).toBe(1000);
    });

    it('FeatureAnchorがドメインオブジェクトに復元される', () => {
      const original = createWorldWithPoint();
      const restored = deserialize(serialize(original));

      const anchor = restored.features.get('f1')!.anchors[0];
      expect(anchor).toBeInstanceOf(FeatureAnchor);
    });

    it('設定のデフォルト値が正しく復元される', () => {
      const original = createMinimalWorld();
      const restored = deserialize(serialize(original));

      expect(restored.metadata.settings.zoomMin).toBe(DEFAULT_SETTINGS.zoomMin);
      expect(restored.metadata.settings.equatorLength).toBe(DEFAULT_SETTINGS.equatorLength);
      expect(restored.metadata.settings.defaultPalette).toBe('クラシック');
      expect(restored.metadata.settings.baseMap).toEqual(DEFAULT_SETTINGS.baseMap);
    });

    it('カスタムベースマップ設定を復元できる', () => {
      const metadata = {
        ...DEFAULT_METADATA,
        settings: {
          ...DEFAULT_SETTINGS,
          baseMap: {
            mode: 'custom' as const,
            fileName: 'world.svg',
            svgText: '<svg viewBox="0 0 360 180"></svg>',
          },
        },
      };
      const world = new World('1.0.0', new Map(), new Map(), new Map(), [], metadata);
      const restored = deserialize(serialize(world));

      expect(restored.metadata.settings.baseMap).toEqual(metadata.settings.baseMap);
    });
  });

  describe('バージョン検証', () => {
    it('バージョンフィールドがなくプロジェクト構造も不完全な場合エラー', () => {
      expect(() => deserialize('{}')).toThrow(SerializationError);
      expect(() => deserialize('{}')).toThrow('Missing version field');
    });

    it('バージョンフィールドがない旧形式プロジェクトは読み込みエラーで拒否される', () => {
      // 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
      // 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
      const world = createValidJsonWorld();
      delete world.version;

      expect(() => deserialize(JSON.stringify(world))).toThrow(SerializationError);
      expect(() => deserialize(JSON.stringify(world))).toThrow('Missing version field');
    });

    it('0.x系の旧バージョンは読み込みエラーで拒否される', () => {
      // 要件定義書 §2.5.2 同上。0.x 系は旧モデル時代のバージョンとして拒否する。
      const world = createValidJsonWorld({ version: '0.9.0' });

      expect(() => deserialize(JSON.stringify(world))).toThrow(SerializationError);
      expect(() => deserialize(JSON.stringify(world))).toThrow('Unsupported version "0.9.0"');
      expect(() => deserialize(JSON.stringify(world))).toThrow(`expected "${'1.0.0'}"`);
    });

    it('サポートされないバージョンの場合エラー', () => {
      const json = JSON.stringify({ version: '2.0.0', vertices: [], features: [], sharedVertexGroups: [], timelineMarkers: [], metadata: DEFAULT_METADATA });
      expect(() => deserialize(json)).toThrow(SerializationError);
      expect(() => deserialize(json)).toThrow('Unsupported version');
    });

    it('不正なJSONの場合エラー', () => {
      expect(() => deserialize('not json {')).toThrow(SerializationError);
      expect(() => deserialize('not json {')).toThrow('Invalid JSON format');
    });
  });

  describe('データ整合性検証', () => {
    it('存在しない頂点への参照でエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        vertices: [],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v-nonexistent' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('non-existent vertex');
    });

    it('終了時間が開始時間より前の場合エラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 1500 }, end: { year: 1000 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('end time before start time');
    });

    it('不正な地物タイプでエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Unknown',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('Unknown feature type');
    });

    it('不正な形状タイプでエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Circle' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow(
        'shape.type "Circle" does not match featureType "Point"'
      );
    });

    it('LineStringのvertexIds欠損でエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        vertices: [],
        features: [{
          id: 'f1',
          featureType: 'Line',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'LineString' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('LineString shape requires vertexIds');
    });

    it('sharedVertexGroups欠損の旧データは空グループとして読み込める', () => {
      const world = createValidJsonWorld();
      delete world.sharedVertexGroups;

      const restored = deserialize(JSON.stringify(world));

      expect(restored.sharedVertexGroups.size).toBe(0);
    });

    it('旧形式の単一形状地物（version 0.8.0）は読み込みエラーで拒否される', () => {
      // 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
      // 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
      // 0.x 系は旧モデル時代の形式バージョンとして拒否されるため、
      // 内部の旧形式 migration ロジック（anchors 補完、vertexIds → territory リング等）には
      // 到達しない。
      const world = createValidJsonWorld({
        version: '0.8.0',
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 10, y: 0 },
          { id: 'v3', x: 0, y: 10 },
        ],
        features: [{
          id: 'f-legacy',
          featureType: 'polygon',
          name: '旧国家',
          description: '旧形式の地物',
          type: 'Polygon',
          vertexIds: ['v1', 'v2', 'v3'],
          startYear: 1200,
        }],
      });

      expect(() => deserialize(JSON.stringify(world))).toThrow(SerializationError);
      expect(() => deserialize(JSON.stringify(world))).toThrow('Unsupported version "0.8.0"');
    });

    it('旧形式の欠損した追加フィールドを補完し警告を返す', () => {
      const world = createValidJsonWorld({
        metadata: {
          ...DEFAULT_METADATA,
          settings: { ...DEFAULT_SETTINGS },
        },
      });
      delete world.sharedVertexGroups;
      delete world.timelineMarkers;
      const metadata = world.metadata as Record<string, unknown>;
      const settings = metadata.settings as Record<string, unknown>;
      delete settings.baseMap;

      const result = deserializeWithReport(JSON.stringify(world));

      expect(result.world.sharedVertexGroups.size).toBe(0);
      expect(result.world.timelineMarkers).toHaveLength(0);
      expect(result.world.metadata.settings.baseMap.fileName).toBe('base-map.svg');
      expect(result.compatibilityWarnings).toEqual(expect.arrayContaining([
        'sharedVertexGroups がない旧形式を読み込んだため、空配列として補完しました。',
        'timelineMarkers がない旧形式を読み込んだため、空配列として補完しました。',
        'metadata.settings.baseMap がない旧形式を読み込んだため、プリセット地図設定を補完しました。',
      ]));
    });

    it('共有頂点グループが存在しない頂点を参照するとエラー', () => {
      const json = JSON.stringify(createValidJsonWorld({
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 0, y: 0 },
        ],
        sharedVertexGroups: [{
          id: 'sg-1',
          vertexIds: ['v1', 'v-missing'],
          representativeCoordinate: { x: 0, y: 0 },
        }],
      }));

      expect(() => deserialize(json)).toThrow('Shared vertex group "sg-1" references non-existent vertex "v-missing"');
    });

    it('同じ頂点が複数の共有頂点グループに所属するとエラー', () => {
      const json = JSON.stringify(createValidJsonWorld({
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 0, y: 0 },
          { id: 'v3', x: 0, y: 0 },
        ],
        sharedVertexGroups: [
          {
            id: 'sg-1',
            vertexIds: ['v1', 'v2'],
            representativeCoordinate: { x: 0, y: 0 },
          },
          {
            id: 'sg-2',
            vertexIds: ['v2', 'v3'],
            representativeCoordinate: { x: 0, y: 0 },
          },
        ],
      }));

      expect(() => deserialize(json)).toThrow('Vertex "v2" belongs to multiple shared vertex groups');
    });

    it('共有頂点グループの代表座標と頂点座標が一致しないとエラー', () => {
      const json = JSON.stringify(createValidJsonWorld({
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 1, y: 0 },
        ],
        sharedVertexGroups: [{
          id: 'sg-1',
          vertexIds: ['v1', 'v2'],
          representativeCoordinate: { x: 0, y: 0 },
        }],
      }));

      expect(() => deserialize(json)).toThrow(
        'Shared vertex group "sg-1" vertex "v2" coordinate does not match representativeCoordinate'
      );
    });

    it('自己交差ポリゴンを読み込み時に拒否する', () => {
      const json = JSON.stringify(createValidJsonWorld({
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 10, y: 10 },
          { id: 'v3', x: 10, y: 0 },
          { id: 'v4', x: 0, y: 10 },
        ],
        features: [{
          id: 'f-poly',
          featureType: 'Polygon',
          anchors: [{
            id: 'a-poly',
            timeRange: { start: { year: 100 } },
            property: { name: 'bowtie', description: '' },
            shape: {
              type: 'Polygon',
              rings: [{
                id: 'r-bowtie',
                vertexIds: ['v1', 'v2', 'v3', 'v4'],
                ringType: 'territory',
                parentId: null,
              }],
            },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      }));

      expect(() => deserialize(json)).toThrow('ring "r-bowtie" is self-intersecting');
    });

    it('親領土からはみ出す穴リングを読み込み時に拒否する', () => {
      const json = JSON.stringify(createValidJsonWorld({
        vertices: [
          { id: 'o1', x: 0, y: 0 },
          { id: 'o2', x: 20, y: 0 },
          { id: 'o3', x: 20, y: 20 },
          { id: 'o4', x: 0, y: 20 },
          { id: 'h1', x: 4, y: 4 },
          { id: 'h2', x: 16, y: 4 },
          { id: 'h3', x: 24, y: 16 },
          { id: 'h4', x: 4, y: 16 },
        ],
        features: [{
          id: 'f-poly',
          featureType: 'Polygon',
          anchors: [{
            id: 'a-poly',
            timeRange: { start: { year: 100 } },
            property: { name: 'invalid-hole', description: '' },
            shape: {
              type: 'Polygon',
              rings: [
                {
                  id: 'outer',
                  vertexIds: ['o1', 'o2', 'o3', 'o4'],
                  ringType: 'territory',
                  parentId: null,
                },
                {
                  id: 'hole',
                  vertexIds: ['h1', 'h2', 'h3', 'h4'],
                  ringType: 'hole',
                  parentId: 'outer',
                },
              ],
            },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      }));

      expect(() => deserialize(json)).toThrow('親リングの内部に完全に収まっていません');
    });
  });

  describe('複数アンカーの地物', () => {
    it('時代変遷のある地物をラウンドトリップできる', () => {
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
      vertices.set('v2', new Vertex('v2', new Coordinate(10, 0)));
      vertices.set('v3', new Vertex('v3', new Coordinate(5, 10)));
      vertices.set('v4', new Vertex('v4', new Coordinate(15, 10)));

      const anchor1 = new FeatureAnchor(
        'a1',
        { start: new TimePoint(1000), end: new TimePoint(1200) },
        { name: '旧領土', description: '' },
        { type: 'Polygon', rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      );
      const anchor2 = new FeatureAnchor(
        'a2',
        { start: new TimePoint(1200) },
        { name: '新領土', description: '拡大後' },
        { type: 'Polygon', rings: [new Ring('r2', ['v1', 'v2', 'v4', 'v3'], 'territory', null)] },
        { parentId: null, childIds: [], isTopLevel: true }
      );

      const feature = new Feature('f1', 'Polygon', [anchor1, anchor2]);
      const features = new Map<string, Feature>();
      features.set('f1', feature);

      const world = new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);

      const restored = deserialize(serialize(world));
      const f = restored.features.get('f1')!;
      expect(f.anchors).toHaveLength(2);
      expect(f.anchors[0].property.name).toBe('旧領土');
      expect(f.anchors[1].property.name).toBe('新領土');
      expect(f.anchors[0].timeRange.end!.year).toBe(1200);
    });
  });

  describe('property.kind（種別ラベル）', () => {
    it('kind が指定された錨をラウンドトリップで保持する', () => {
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));

      const anchor = new FeatureAnchor(
        'a1',
        { start: new TimePoint(1000) },
        { name: '東京都', description: '', kind: '都' },
        { type: 'Point', vertexId: 'v1' },
        { parentId: null, childIds: [], isTopLevel: true }
      );
      const feature = new Feature('f1', 'Point', [anchor]);
      const features = new Map<string, Feature>();
      features.set('f1', feature);

      const world = new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);

      const json = serialize(world);
      expect(JSON.parse(json).features[0].anchors[0].property.kind).toBe('都');

      const restored = deserialize(json);
      expect(restored.features.get('f1')!.anchors[0].property.kind).toBe('都');
    });

    it('kind 未設定の錨は kind を JSON に出力しない', () => {
      const world = createWorldWithPoint();
      const json = serialize(world);
      const parsed = JSON.parse(json);
      expect(parsed.features[0].anchors[0].property.kind).toBeUndefined();
      expect('kind' in parsed.features[0].anchors[0].property).toBe(false);
    });

    it('旧形式（kind フィールドなし）を読み込むと kind は undefined になる', () => {
      const json = createValidJsonWorld();
      const restored = deserialize(JSON.stringify(json));
      expect(restored.features.get('f1')!.anchors[0].property.kind).toBeUndefined();
    });

    it('空文字列の kind は読み込み時に undefined へ正規化する', () => {
      const json = createValidJsonWorld();
      ((json.features as Array<Record<string, unknown>>)[0].anchors as Array<Record<string, unknown>>)[0].property = {
        name: 'test',
        description: '',
        kind: '',
      };
      const restored = deserialize(JSON.stringify(json));
      expect(restored.features.get('f1')!.anchors[0].property.kind).toBeUndefined();
    });
  });

  describe('placement.isTopLevel（最上位フラグ）', () => {
    it('isTopLevel を JSON ラウンドトリップで保持する', () => {
      const child = new FeatureAnchor(
        'a-child',
        { start: new TimePoint(1000) },
        { name: '子', description: '' },
        { type: 'Point', vertexId: 'v1' },
        { parentId: 'p1', childIds: [], isTopLevel: false }
      );
      const features = new Map<string, Feature>();
      features.set('f-child', new Feature('f-child', 'Point', [child]));
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
      const world = new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);

      const json = serialize(world);
      expect(JSON.parse(json).features[0].anchors[0].placement.isTopLevel).toBe(false);
    });

    it('旧形式（isTopLevel フィールドなし）は parentId === null から派生する', () => {
      const json = createValidJsonWorld();
      const placement = ((json.features as Array<Record<string, unknown>>)[0].anchors as Array<Record<string, unknown>>)[0].placement as Record<string, unknown>;
      delete placement.isTopLevel;
      const restored = deserialize(JSON.stringify(json));
      expect(restored.features.get('f1')!.anchors[0].placement.isTopLevel).toBe(true);
    });

    it('parentId が指定された旧形式は isTopLevel=false を派生する', () => {
      // 子 f1 が実在する親コンテナ parent を指す正当なツリー（Phase 3-1 参照整合を満たす）で、
      // isTopLevel 欠落（旧形式）から false が派生することを確認する。
      const json = {
        version: '1.0.0',
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 10, y: 0 },
          { id: 'v3', x: 0, y: 10 },
        ],
        features: [
          {
            id: 'f1',
            featureType: 'Polygon',
            anchors: [{
              id: 'a1',
              timeRange: { start: { year: 100 } },
              property: { name: 'child', description: '' },
              shape: {
                type: 'Polygon',
                rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
              },
              // isTopLevel 欠落（旧形式）→ parentId から false が派生される
              placement: { parentId: 'parent', childIds: [] },
            }],
          },
          {
            id: 'parent',
            featureType: 'Polygon',
            anchors: [{
              id: 'ap',
              timeRange: { start: { year: 100 } },
              property: { name: 'parent', description: '' },
              // 集約地物（shape フィールドなし）
              placement: { parentId: null, childIds: ['f1'], isTopLevel: true },
            }],
          },
        ],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      };
      const restored = deserialize(JSON.stringify(json));
      expect(restored.features.get('f1')!.anchors[0].placement.isTopLevel).toBe(false);
    });

    it('isTopLevel と parentId の不変条件が崩れたデータは読み込み時に再派生される', () => {
      const json = createValidJsonWorld();
      const placement = ((json.features as Array<Record<string, unknown>>)[0].anchors as Array<Record<string, unknown>>)[0].placement as Record<string, unknown>;
      placement.parentId = null;
      placement.isTopLevel = false;
      const restored = deserialize(JSON.stringify(json));
      expect(restored.features.get('f1')!.anchors[0].placement.isTopLevel).toBe(true);
    });
  });

  describe('shape optional 化（Phase 2-C-1: コンテナ錨）', () => {
    it('shape を持たないコンテナ錨は JSON ラウンドトリップで shape フィールドを出力しない', () => {
      const containerAnchor = new FeatureAnchor(
        'a-c',
        { start: new TimePoint(0) },
        { name: '合衆国', description: '' },
        undefined,
        { parentId: null, childIds: ['f-child'], isTopLevel: true }
      );
      const childAnchor = new FeatureAnchor(
        'a-child',
        { start: new TimePoint(0) },
        { name: 'ヴァージニア', description: '' },
        { type: 'Polygon', rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)] },
        { parentId: 'f-c', childIds: [], isTopLevel: false }
      );
      const features = new Map<string, Feature>();
      features.set('f-c', new Feature('f-c', 'Polygon', [containerAnchor]));
      features.set('f-child', new Feature('f-child', 'Polygon', [childAnchor]));
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
      vertices.set('v2', new Vertex('v2', new Coordinate(10, 0)));
      vertices.set('v3', new Vertex('v3', new Coordinate(0, 10)));
      const world = new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);

      const json = serialize(world);
      const parsed = JSON.parse(json);
      const containerJson = parsed.features.find((f: { id: string }) => f.id === 'f-c').anchors[0];
      expect('shape' in containerJson).toBe(false);

      const restored = deserialize(json);
      expect(restored.features.get('f-c')!.anchors[0].shape).toBeUndefined();
    });

    it('旧形式（shape フィールドなし + Polygon + childIds 非空）はコンテナとして警告付きで読み込む', () => {
      const json = createValidJsonWorld({
        vertices: [
          { id: 'v1', x: 0, y: 0 },
          { id: 'v2', x: 10, y: 0 },
          { id: 'v3', x: 0, y: 10 },
        ],
        features: [
          {
            id: 'f-c',
            featureType: 'Polygon',
            anchors: [
              {
                id: 'a-c',
                timeRange: { start: { year: 0 } },
                property: { name: '合衆国', description: '' },
                placement: { parentId: null, childIds: ['f-child'], isTopLevel: true },
              },
            ],
          },
          {
            id: 'f-child',
            featureType: 'Polygon',
            anchors: [
              {
                id: 'a-child',
                timeRange: { start: { year: 0 } },
                property: { name: 'ヴァージニア', description: '' },
                shape: {
                  type: 'Polygon',
                  rings: [
                    { id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null },
                  ],
                },
                placement: { parentId: 'f-c', childIds: [], isTopLevel: false },
              },
            ],
          },
        ],
      });
      const report = deserializeWithReport(JSON.stringify(json));
      expect(report.world.features.get('f-c')!.anchors[0].shape).toBeUndefined();
      expect(
        report.compatibilityWarnings.some((w) => w.includes('集約地物'))
      ).toBe(true);
    });

    it('旧形式（shape フィールドなし + Point）は SerializationError を投げる', () => {
      const json = createValidJsonWorld({
        features: [
          {
            id: 'f1',
            featureType: 'Point',
            anchors: [
              {
                id: 'a1',
                timeRange: { start: { year: 0 } },
                property: { name: 'p', description: '' },
                placement: { parentId: null, childIds: [], isTopLevel: true },
              },
            ],
          },
        ],
      });
      expect(() => deserialize(JSON.stringify(json))).toThrow(SerializationError);
    });

    it('旧形式（shape フィールドなし + Line）は SerializationError を投げる', () => {
      const json = createValidJsonWorld({
        features: [
          {
            id: 'f1',
            featureType: 'Line',
            anchors: [
              {
                id: 'a1',
                timeRange: { start: { year: 0 } },
                property: { name: 'p', description: '' },
                placement: { parentId: null, childIds: [], isTopLevel: true },
              },
            ],
          },
        ],
      });
      expect(() => deserialize(JSON.stringify(json))).toThrow(SerializationError);
    });

    it('旧形式（shape フィールドなし + Polygon + childIds に存在しない feature ID）は SerializationError を投げる', () => {
      const json = createValidJsonWorld({
        features: [
          {
            id: 'f-c',
            featureType: 'Polygon',
            anchors: [
              {
                id: 'a-c',
                timeRange: { start: { year: 0 } },
                property: { name: '合衆国', description: '' },
                placement: {
                  parentId: null,
                  childIds: ['ghost'],
                  isTopLevel: true,
                },
              },
            ],
          },
        ],
      });
      expect(() => deserialize(JSON.stringify(json))).toThrow(SerializationError);
    });

    it('旧形式（shape フィールドなし + Polygon + childIds 空）は SerializationError を投げる', () => {
      const json = createValidJsonWorld({
        features: [
          {
            id: 'f1',
            featureType: 'Polygon',
            anchors: [
              {
                id: 'a1',
                timeRange: { start: { year: 0 } },
                property: { name: 'p', description: '' },
                placement: { parentId: null, childIds: [], isTopLevel: true },
              },
            ],
          },
        ],
      });
      expect(() => deserialize(JSON.stringify(json))).toThrow(SerializationError);
    });
  });

  describe('穴あきポリゴン', () => {
    it('ホールリングを含むポリゴンをラウンドトリップできる', () => {
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(0, 0)));
      vertices.set('v2', new Vertex('v2', new Coordinate(20, 0)));
      vertices.set('v3', new Vertex('v3', new Coordinate(20, 20)));
      vertices.set('v4', new Vertex('v4', new Coordinate(0, 20)));
      vertices.set('v5', new Vertex('v5', new Coordinate(5, 5)));
      vertices.set('v6', new Vertex('v6', new Coordinate(10, 5)));
      vertices.set('v7', new Vertex('v7', new Coordinate(10, 10)));

      const outerRing = new Ring('r-outer', ['v1', 'v2', 'v3', 'v4'], 'territory', null);
      const holeRing = new Ring('r-hole', ['v5', 'v6', 'v7'], 'hole', 'r-outer');

      const anchor = new FeatureAnchor(
        'a1',
        { start: new TimePoint(0) },
        { name: '穴あき', description: '' },
        { type: 'Polygon', rings: [outerRing, holeRing] },
        { parentId: null, childIds: [], isTopLevel: true }
      );
      const feature = new Feature('f1', 'Polygon', [anchor]);
      const features = new Map<string, Feature>();
      features.set('f1', feature);

      const world = new World('1.0.0', vertices, features, new Map(), [], DEFAULT_METADATA);

      const restored = deserialize(serialize(world));
      const shape = restored.features.get('f1')!.anchors[0].shape;
      if (shape.type === 'Polygon') {
        expect(shape.rings).toHaveLength(2);
        expect(shape.rings[0].ringType).toBe('territory');
        expect(shape.rings[0].parentId).toBeNull();
        expect(shape.rings[1].ringType).toBe('hole');
        expect(shape.rings[1].parentId).toBe('r-outer');
      }
    });
  });
});
