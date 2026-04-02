import { describe, it, expect, vi, afterEach } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { eventBus } from '@application/EventBus';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';

describe('AddFeatureUseCase', () => {
  let useCase: AddFeatureUseCase;
  const time = new TimePoint(1000);

  afterEach(() => {
    eventBus.clear();
  });

  describe('addPoint', () => {
    it('点情報を追加できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPoint(
        new Coordinate(10, 20),
        'layer1',
        time
      );
      expect(feature.featureType).toBe('Point');
      expect(feature.anchors).toHaveLength(1);
    });

    it('追加した点情報の錨が正しい形状を持つ', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPoint(
        new Coordinate(10, 20),
        'layer1',
        time
      );
      const anchor = feature.anchors[0];
      expect(anchor.shape.type).toBe('Point');
      if (anchor.shape.type === 'Point') {
        const vertex = useCase.getVertices().get(anchor.shape.vertexId);
        expect(vertex).toBeDefined();
        expect(vertex!.x).toBe(10);
        expect(vertex!.y).toBe(20);
      }
    });

    it('レイヤーIDが錨のplacementに設定される', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPoint(
        new Coordinate(0, 0),
        'my-layer',
        time
      );
      expect(feature.anchors[0].placement.layerId).toBe('my-layer');
    });

    it('現在時刻が錨の開始時刻になる', () => {
      useCase = new AddFeatureUseCase();
      const t = new TimePoint(500, 3, 15);
      const feature = useCase.addPoint(new Coordinate(0, 0), 'l1', t);
      expect(feature.anchors[0].timeRange.start.equals(t)).toBe(true);
      expect(feature.anchors[0].timeRange.end).toBeUndefined();
    });

    it('名前を指定できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPoint(
        new Coordinate(0, 0),
        'l1',
        time,
        '首都'
      );
      expect(feature.anchors[0].property.name).toBe('首都');
    });

    it('名前を省略すると自動採番される', () => {
      useCase = new AddFeatureUseCase();
      const f1 = useCase.addPoint(new Coordinate(0, 0), 'l1', time);
      expect(f1.anchors[0].property.name).toMatch(/^点/);
    });

    it('feature:added イベントを発行する', () => {
      useCase = new AddFeatureUseCase();
      const listener = vi.fn();
      const unsub = eventBus.on('feature:added', listener);

      const feature = useCase.addPoint(new Coordinate(0, 0), 'l1', time);

      expect(listener).toHaveBeenCalledWith({ featureId: feature.id });
      unsub();
    });
  });

  describe('addLine', () => {
    it('線情報を追加できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 10)],
        'l1',
        time
      );
      expect(feature.featureType).toBe('Line');
    });

    it('線情報の錨がLineString形状を持つ', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 0)],
        'l1',
        time
      );
      const anchor = feature.anchors[0];
      expect(anchor.shape.type).toBe('LineString');
      if (anchor.shape.type === 'LineString') {
        expect(anchor.shape.vertexIds).toHaveLength(3);
      }
    });

    it('2点未満ならエラーを投げる', () => {
      useCase = new AddFeatureUseCase();
      expect(() =>
        useCase.addLine([new Coordinate(0, 0)], 'l1', time)
      ).toThrow('2点以上');
    });

    it('feature:added イベントを発行する', () => {
      useCase = new AddFeatureUseCase();
      const listener = vi.fn();
      const unsub = eventBus.on('feature:added', listener);

      useCase.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 10)],
        'l1',
        time
      );

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  describe('addPolygon', () => {
    it('面情報を追加できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1',
        time
      );
      expect(feature.featureType).toBe('Polygon');
    });

    it('面情報の錨がPolygon形状を持つ', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1',
        time
      );
      const anchor = feature.anchors[0];
      expect(anchor.shape.type).toBe('Polygon');
      if (anchor.shape.type === 'Polygon') {
        expect(anchor.shape.rings).toHaveLength(1);
        expect(anchor.shape.rings[0].ringType).toBe('territory');
        expect(anchor.shape.rings[0].vertexIds).toHaveLength(3);
      }
    });

    it('3点未満ならエラーを投げる', () => {
      useCase = new AddFeatureUseCase();
      expect(() =>
        useCase.addPolygon(
          [new Coordinate(0, 0), new Coordinate(10, 0)],
          'l1',
          time
        )
      ).toThrow('3点以上');
    });

    it('feature:added イベントを発行する', () => {
      useCase = new AddFeatureUseCase();
      const listener = vi.fn();
      const unsub = eventBus.on('feature:added', listener);

      useCase.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1',
        time
      );

      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('面スタイルの初期値を指定できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1',
        time,
        undefined,
        {
          fillColor: '#abcdef',
          selectedFillColor: '#fedcba',
          autoColor: true,
          palette: 'パステル',
        }
      );

      expect(feature.anchors[0].property.style).toEqual({
        fillColor: '#abcdef',
        selectedFillColor: '#fedcba',
        autoColor: true,
        palette: 'パステル',
      });
    });
  });

  describe('getFeatures / getVertices', () => {
    it('追加した地物の一覧を取得できる', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(0, 0), 'l1', time);
      useCase.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 10)],
        'l1',
        time
      );
      expect(useCase.getFeatures()).toHaveLength(2);
    });

    it('追加した頂点がverticesマップに含まれる', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(5, 10), 'l1', time);
      const vertices = useCase.getVertices();
      expect(vertices.size).toBe(1);
      const vertex = [...vertices.values()][0];
      expect(vertex.x).toBe(5);
      expect(vertex.y).toBe(10);
    });

    it('getFeatureById で個別取得できる', () => {
      useCase = new AddFeatureUseCase();
      const feature = useCase.addPoint(new Coordinate(0, 0), 'l1', time);
      expect(useCase.getFeatureById(feature.id)).toBe(feature);
    });

    it('存在しないIDなら undefined', () => {
      useCase = new AddFeatureUseCase();
      expect(useCase.getFeatureById('xxx')).toBeUndefined();
    });
  });

  describe('restore', () => {
    it('地物と頂点を復元できる', () => {
      useCase = new AddFeatureUseCase();
      const vertices = new Map<string, Vertex>();
      vertices.set('v1', new Vertex('v1', new Coordinate(10, 20)));

      const anchor = new FeatureAnchor(
        'a1',
        { start: new TimePoint(1000) },
        { name: '復元地物', description: '' },
        { type: 'Point', vertexId: 'v1' },
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const features = new Map<string, Feature>();
      features.set('f1', new Feature('f1', 'Point', [anchor]));

      useCase.restore(features, vertices);

      expect(useCase.getFeatures()).toHaveLength(1);
      expect(useCase.getFeatures()[0].anchors[0].property.name).toBe('復元地物');
      expect(useCase.getVertices().size).toBe(1);
    });

    it('復元前のデータは上書きされる', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(0, 0), 'l1', time);
      expect(useCase.getFeatures()).toHaveLength(1);

      useCase.restore(new Map(), new Map());

      expect(useCase.getFeatures()).toHaveLength(0);
      expect(useCase.getVertices().size).toBe(0);
    });

    it('復元後の新規追加でIDが衝突しない', () => {
      useCase = new AddFeatureUseCase();
      const vertices = new Map<string, Vertex>();
      vertices.set('v-5', new Vertex('v-5', new Coordinate(10, 20)));

      const anchor = new FeatureAnchor(
        'a-3',
        { start: new TimePoint(100) },
        { name: 'test', description: '' },
        { type: 'Point', vertexId: 'v-5' },
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const features = new Map<string, Feature>();
      features.set('f-10', new Feature('f-10', 'Point', [anchor]));

      useCase.restore(features, vertices);

      // 新しく追加
      const newFeature = useCase.addPoint(new Coordinate(50, 60), 'l1', time);
      // f-10の次はf-11以降
      expect(newFeature.id).not.toBe('f-10');
      // IDの重複なし
      const ids = useCase.getFeatures().map(f => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('ポリゴンのリングIDも採番カウンタに反映される', () => {
      useCase = new AddFeatureUseCase();
      const vertices = new Map<string, Vertex>();
      vertices.set('v-1', new Vertex('v-1', new Coordinate(0, 0)));
      vertices.set('v-2', new Vertex('v-2', new Coordinate(10, 0)));
      vertices.set('v-3', new Vertex('v-3', new Coordinate(10, 10)));

      const ring = new Ring('ring-5', ['v-1', 'v-2', 'v-3'], 'territory', null);
      const anchor = new FeatureAnchor(
        'a-1',
        { start: new TimePoint(100) },
        { name: 'poly', description: '' },
        { type: 'Polygon', rings: [ring] },
        { layerId: 'l1', parentId: null, childIds: [] }
      );
      const features = new Map<string, Feature>();
      features.set('f-1', new Feature('f-1', 'Polygon', [anchor]));

      useCase.restore(features, vertices);

      // 新しいポリゴンを追加してリングIDが衝突しないことを確認
      const newPoly = useCase.addPolygon(
        [new Coordinate(20, 20), new Coordinate(30, 20), new Coordinate(30, 30)],
        'l1',
        time
      );
      if (newPoly.anchors[0].shape.type === 'Polygon') {
        expect(newPoly.anchors[0].shape.rings[0].id).not.toBe('ring-5');
      }
    });

    it('getFeaturesMapで全地物のMapを取得できる', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(0, 0), 'l1', time);
      useCase.addPoint(new Coordinate(10, 10), 'l1', time);

      const map = useCase.getFeaturesMap();
      expect(map.size).toBe(2);
      expect(map instanceof Map).toBe(true);
    });
  });

  describe('座標正規化', () => {
    it('経度が正規化される', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(200, 0), 'l1', time);
      const vertex = [...useCase.getVertices().values()][0];
      expect(vertex.x).toBe(-160); // 200 - 360 = -160
    });

    it('緯度がクランプされる', () => {
      useCase = new AddFeatureUseCase();
      useCase.addPoint(new Coordinate(0, 100), 'l1', time);
      const vertex = [...useCase.getVertices().values()][0];
      expect(vertex.y).toBe(90);
    });
  });
});
