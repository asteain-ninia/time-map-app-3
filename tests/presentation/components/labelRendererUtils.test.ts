import { describe, expect, it } from 'vitest';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  DEFAULT_LABEL_MIN_ZOOM,
  getFeatureLabelPosition,
  measureFeatureLabelArea,
  shouldRenderFeatureLabel,
} from '@presentation/components/labelRendererUtils';

function createVertices(
  entries: Record<string, { lon: number; lat: number }>
): ReadonlyMap<string, Vertex> {
  return new Map(
    Object.entries(entries).map(([id, coordinate]) => [
      id,
      new Vertex(id, new Coordinate(coordinate.lon, coordinate.lat)),
    ])
  );
}

function createPointAnchor(): FeatureAnchor {
  return new FeatureAnchor(
    'a-point',
    { start: new TimePoint(1000) },
    { name: '拠点', description: '' },
    { type: 'Point', vertexId: 'p1' },
    { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
  );
}

function createLineAnchor(minDisplayLength?: number): FeatureAnchor {
  return new FeatureAnchor(
    'a-line',
    { start: new TimePoint(1000) },
    {
      name: '街道',
      description: '',
      labelVisibility: minDisplayLength === undefined ? undefined : { minDisplayLength },
    },
    { type: 'LineString', vertexIds: ['l1', 'l2', 'l3'] },
    { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
  );
}

function createPolygonAnchor(overrides?: {
  minZoom?: number;
  name?: string;
}): FeatureAnchor {
  return new FeatureAnchor(
    'a-polygon',
    { start: new TimePoint(1000) },
    {
      name: overrides?.name ?? '王国',
      description: '',
      labelVisibility: overrides?.minZoom === undefined ? undefined : { minZoom: overrides.minZoom },
    },
    {
      type: 'Polygon',
      rings: [new Ring('r1', ['v1', 'v2', 'v3', 'v4'], 'territory', null)],
    },
    { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true }
  );
}

describe('labelRendererUtils', () => {
  describe('getFeatureLabelPosition', () => {
    it('点地物の座標をそのままラベル位置に使う', () => {
      const position = getFeatureLabelPosition(
        createPointAnchor(),
        createVertices({
          p1: { lon: 10, lat: 20 },
        })
      );

      expect(position).toEqual({ x: 190, y: 70 });
    });

    it('180度子午線またぎポリゴンでも生値経度の重心を主表示帯へ折り返す', () => {
      const position = getFeatureLabelPosition(
        createPolygonAnchor(),
        createVertices({
          v1: { lon: 170, lat: 10 },
          v2: { lon: 190, lat: 10 },
          v3: { lon: 190, lat: -10 },
          v4: { lon: 170, lat: -10 },
        })
      );

      expect(position?.x).toBe(360);
      expect(position?.y).toBe(90);
    });

    it('180度超の生値経度差も短弧化せず算術平均で重心を求める', () => {
      const position = getFeatureLabelPosition(
        createPolygonAnchor(),
        createVertices({
          v1: { lon: 170, lat: 10 },
          v2: { lon: 540, lat: 10 },
          v3: { lon: 540, lat: -10 },
          v4: { lon: 170, lat: -10 },
        })
      );

      expect(position?.x).toBe(175);
      expect(position?.y).toBe(90);
    });
  });

  describe('measureFeatureLabelArea', () => {
    it('ポリゴン外周リングの面積を計算する', () => {
      const area = measureFeatureLabelArea(
        createPolygonAnchor(),
        createVertices({
          v1: { lon: 0, lat: 0 },
          v2: { lon: 2, lat: 0 },
          v3: { lon: 2, lat: 2 },
          v4: { lon: 0, lat: 2 },
        })
      );

      expect(area).toBe(4);
    });
  });

  describe('shouldRenderFeatureLabel', () => {
    it('デフォルト最小ズーム未満では表示しない', () => {
      const visible = shouldRenderFeatureLabel(
        createPointAnchor(),
        createVertices({
          p1: { lon: 0, lat: 0 },
        }),
        DEFAULT_LABEL_MIN_ZOOM - 0.1,
        0
      );

      expect(visible).toBe(false);
    });

    it('地物ごとの minZoom を優先する', () => {
      const visible = shouldRenderFeatureLabel(
        createPolygonAnchor({ minZoom: 4 }),
        createVertices({
          v1: { lon: 0, lat: 0 },
          v2: { lon: 2, lat: 0 },
          v3: { lon: 2, lat: 2 },
          v4: { lon: 0, lat: 2 },
        }),
        3,
        0
      );

      expect(visible).toBe(false);
    });

    it('面積閾値未満のポリゴンは表示しない', () => {
      const visible = shouldRenderFeatureLabel(
        createPolygonAnchor(),
        createVertices({
          v1: { lon: 0, lat: 0 },
          v2: { lon: 1, lat: 0 },
          v3: { lon: 1, lat: 1 },
          v4: { lon: 0, lat: 1 },
        }),
        3,
        2
      );

      expect(visible).toBe(false);
    });

    it('minDisplayLength 未満の線ラベルは表示しない', () => {
      const visible = shouldRenderFeatureLabel(
        createLineAnchor(10),
        createVertices({
          l1: { lon: 0, lat: 0 },
          l2: { lon: 1, lat: 0 },
          l3: { lon: 2, lat: 0 },
        }),
        3,
        0
      );

      expect(visible).toBe(false);
    });

    it('名称が空なら表示しない', () => {
      const visible = shouldRenderFeatureLabel(
        createPolygonAnchor({ name: '' }),
        createVertices({
          v1: { lon: 0, lat: 0 },
          v2: { lon: 2, lat: 0 },
          v3: { lon: 2, lat: 2 },
          v4: { lon: 0, lat: 2 },
        }),
        3,
        0
      );

      expect(visible).toBe(false);
    });
  });
});
