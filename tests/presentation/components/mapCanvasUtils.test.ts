import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  computeRenderWrapOffsets,
  formatSurveyDistance,
  getAnchorVertexCount,
  normalizeRenderFps,
  normalizeVertexMarkerDisplayLimit,
  normalizeZoomLimits,
} from '@presentation/components/mapCanvasUtils';

function createPolygonAnchor(): FeatureAnchor {
  return new FeatureAnchor(
    'anchor-1',
    { start: new TimePoint(100) },
    { name: '面', description: '' },
    {
      type: 'Polygon',
      rings: [
        new Ring('ring-1', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('ring-2', ['v4', 'v5', 'v6'], 'hole', 'ring-1'),
      ],
    },
    { layerId: 'layer-1', parentId: null, childIds: [] }
  );
}

function createPointAnchor(): FeatureAnchor {
  return new FeatureAnchor(
    'anchor-point',
    { start: new TimePoint(100) },
    { name: '点', description: '' },
    { type: 'Point', vertexId: 'point-v1' },
    { layerId: 'layer-1', parentId: null, childIds: [] }
  );
}

function createLineAnchor(): FeatureAnchor {
  return new FeatureAnchor(
    'anchor-line',
    { start: new TimePoint(100) },
    { name: '線', description: '' },
    { type: 'LineString', vertexIds: ['line-v1', 'line-v2', 'line-v3'] },
    { layerId: 'layer-1', parentId: null, childIds: [] }
  );
}

function createPointFeature(
  featureId: string,
  vertexId: string,
  layerId: string,
  time: TimePoint
): Feature {
  return new Feature(featureId, 'Point', [
    new FeatureAnchor(
      `${featureId}-anchor`,
      { start: time },
      { name: featureId, description: '' },
      { type: 'Point', vertexId },
      { layerId, parentId: null, childIds: [] }
    ),
  ]);
}

describe('mapCanvasUtils', () => {
  it('頂点数を形状種別ごとに集計する', () => {
    expect(getAnchorVertexCount(createPolygonAnchor())).toBe(6);
  });

  it('Pointの頂点数は1として扱う', () => {
    expect(getAnchorVertexCount(createPointAnchor())).toBe(1);
  });

  it('LineStringの頂点数は配列長を返す', () => {
    expect(getAnchorVertexCount(createLineAnchor())).toBe(3);
  });

  it('描画更新頻度と頂点表示上限を安全な範囲へ正規化する', () => {
    expect(normalizeRenderFps(Number.NaN)).toBe(60);
    expect(normalizeRenderFps(120)).toBe(60);
    expect(normalizeVertexMarkerDisplayLimit(0)).toBe(1);
    expect(normalizeVertexMarkerDisplayLimit(Number.NaN)).toBe(1000);
  });

  it('頂点表示上限は負数でも1未満にならない', () => {
    expect(normalizeVertexMarkerDisplayLimit(-12)).toBe(1);
  });

  it('ズーム範囲を破綻しない値へ揃える', () => {
    expect(normalizeZoomLimits(10, 2)).toEqual({ min: 2, max: 10 });
    expect(normalizeZoomLimits(Number.NaN, 0)).toEqual({ min: 0.1, max: 1 });
  });

  it('ズーム範囲が同値入力なら同じ値を維持する', () => {
    expect(normalizeZoomLimits(8, 8)).toEqual({ min: 8, max: 8 });
  });

  it('測量距離を表示向けに整形する', () => {
    expect(formatSurveyDistance(12.34)).toBe('12.3');
    expect(formatSurveyDistance(1234.56)).toBe('1,235');
  });

  it('測量距離がちょうど100kmなら整数表示する', () => {
    expect(formatSurveyDistance(100)).toBe('100');
  });

  it('720度超の地物でも可視コピーに必要なラップタイルを含める', () => {
    const time = new TimePoint(100);
    const feature = createPointFeature('f-wrap', 'v-wrap', 'layer-1', time);
    const vertices = new Map([
      ['v-wrap', new Vertex('v-wrap', new Coordinate(900, 10))],
    ]);

    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      [feature],
      vertices,
      time,
      { visibleLayerIds: new Set(['layer-1']) }
    );

    expect(offsets).toContain(-720);
    expect(offsets).toContain(-1080);
  });

  it('非表示レイヤーの地物は追加ラップタイル算出に含めない', () => {
    const time = new TimePoint(100);
    const feature = createPointFeature('f-hidden', 'v-hidden', 'layer-hidden', time);
    const vertices = new Map([
      ['v-hidden', new Vertex('v-hidden', new Coordinate(900, 10))],
    ]);

    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      [feature],
      vertices,
      time,
      { visibleLayerIds: new Set(['layer-visible']) }
    );

    expect(offsets).not.toContain(-720);
    expect(offsets).toEqual([-360, 0, 360]);
  });

  it('描画中の一時座標だけでも追加ラップタイルを算出できる', () => {
    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      [],
      new Map(),
      undefined,
      { extraCoords: [new Coordinate(900, 0)] }
    );

    expect(offsets).toContain(-720);
    expect(offsets).toContain(-1080);
  });
});
