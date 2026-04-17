import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SerializationError } from '@infrastructure/persistence/JSONSerializer';
import { World, DEFAULT_METADATA, DEFAULT_SETTINGS } from '@domain/entities/World';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Layer } from '@domain/entities/Layer';
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
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const feature = new Feature('f1', 'Point', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  const layers = [new Layer('l1', 'レイヤー1', 0)];

  return new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);
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
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  const feature = new Feature('f1', 'Line', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  const layers = [new Layer('l1', '道路', 0)];

  return new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);
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
    { layerId: 'l1', parentId: null, childIds: ['f2'] }
  );
  const feature = new Feature('f1', 'Polygon', [anchor]);
  const features = new Map<string, Feature>();
  features.set('f1', feature);

  const layers = [new Layer('l1', '国家', 0, true, 0.8, '国家レイヤー')];

  return new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);
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
    { layerId: 'l1', parentId: null, childIds: [] }
  );
  features.set('f1', new Feature('f1', 'Point', [anchor]));

  const layers = [new Layer('l1', 'テスト', 0)];

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

  return new World('1.0.0', vertices, features, layers, sharedVertexGroups, timelineMarkers, metadata);
}

function createValidJsonWorld(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '1.0.0',
    layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
    vertices: [{ id: 'v1', x: 0, y: 0 }],
    features: [{
      id: 'f1',
      featureType: 'Point',
      anchors: [{
        id: 'a1',
        timeRange: { start: { year: 100 } },
        property: { name: 'test', description: '' },
        shape: { type: 'Point', vertexId: 'v1' },
        placement: { layerId: 'l1', parentId: null, childIds: [] },
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
      expect(parsed.layers).toEqual([]);
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

    it('レイヤーのdescriptionとopacityをシリアライズできる', () => {
      const world = createWorldWithPolygon();
      const json = serialize(world);
      const parsed = JSON.parse(json);

      expect(parsed.layers[0].opacity).toBe(0.8);
      expect(parsed.layers[0].description).toBe('国家レイヤー');
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
      const world = new World('1.0.0', new Map(), new Map(), [], new Map(), [], metadata);
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
      expect(restored.layers).toHaveLength(0);
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
      expect(restored.layers).toHaveLength(1);
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

    it('レイヤーがドメインオブジェクトに復元される', () => {
      const original = createWorldWithPolygon();
      const restored = deserialize(serialize(original));

      const layer = restored.layers[0];
      expect(layer).toBeInstanceOf(Layer);
      expect(layer.opacity).toBe(0.8);
      expect(layer.description).toBe('国家レイヤー');
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
      const world = new World('1.0.0', new Map(), new Map(), [], new Map(), [], metadata);
      const restored = deserialize(serialize(world));

      expect(restored.metadata.settings.baseMap).toEqual(metadata.settings.baseMap);
    });
  });

  describe('バージョン検証', () => {
    it('バージョンフィールドがない場合エラー', () => {
      expect(() => deserialize('{"layers":[]}')).toThrow(SerializationError);
      expect(() => deserialize('{"layers":[]}')).toThrow('Missing version field');
    });

    it('サポートされないバージョンの場合エラー', () => {
      const json = JSON.stringify({ version: '2.0.0', layers: [], vertices: [], features: [], sharedVertexGroups: [], timelineMarkers: [], metadata: DEFAULT_METADATA });
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
        layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
        vertices: [],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v-nonexistent' },
            placement: { layerId: 'l1', parentId: null, childIds: [] },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('non-existent vertex');
    });

    it('存在しないレイヤーへの参照でエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        layers: [],
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { layerId: 'l-nonexistent', parentId: null, childIds: [] },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('non-existent layer');
    });

    it('終了時間が開始時間より前の場合エラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 1500 }, end: { year: 1000 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { layerId: 'l1', parentId: null, childIds: [] },
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
        layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Unknown',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { layerId: 'l1', parentId: null, childIds: [] },
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
        layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
        vertices: [{ id: 'v1', x: 0, y: 0 }],
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'Circle' },
            placement: { layerId: 'l1', parentId: null, childIds: [] },
          }],
        }],
        sharedVertexGroups: [],
        timelineMarkers: [],
        metadata: DEFAULT_METADATA,
      });
      expect(() => deserialize(json)).toThrow('Unknown shape type');
    });

    it('LineStringのvertexIds欠損でエラー', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
        vertices: [],
        features: [{
          id: 'f1',
          featureType: 'Line',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape: { type: 'LineString' },
            placement: { layerId: 'l1', parentId: null, childIds: [] },
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
            placement: { layerId: 'l1', parentId: null, childIds: [] },
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
            placement: { layerId: 'l1', parentId: null, childIds: [] },
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
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const anchor2 = new FeatureAnchor(
        'a2',
        { start: new TimePoint(1200) },
        { name: '新領土', description: '拡大後' },
        { type: 'Polygon', rings: [new Ring('r2', ['v1', 'v2', 'v4', 'v3'], 'territory', null)] },
        { layerId: 'l1', parentId: null, childIds: [] }
      );

      const feature = new Feature('f1', 'Polygon', [anchor1, anchor2]);
      const features = new Map<string, Feature>();
      features.set('f1', feature);

      const layers = [new Layer('l1', '国家', 0)];
      const world = new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);

      const restored = deserialize(serialize(world));
      const f = restored.features.get('f1')!;
      expect(f.anchors).toHaveLength(2);
      expect(f.anchors[0].property.name).toBe('旧領土');
      expect(f.anchors[1].property.name).toBe('新領土');
      expect(f.anchors[0].timeRange.end!.year).toBe(1200);
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
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const feature = new Feature('f1', 'Polygon', [anchor]);
      const features = new Map<string, Feature>();
      features.set('f1', feature);

      const layers = [new Layer('l1', 'テスト', 0)];
      const world = new World('1.0.0', vertices, features, layers, new Map(), [], DEFAULT_METADATA);

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
