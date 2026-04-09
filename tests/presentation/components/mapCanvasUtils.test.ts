import { describe, expect, it } from 'vitest';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
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

describe('mapCanvasUtils', () => {
  it('頂点数を形状種別ごとに集計する', () => {
    expect(getAnchorVertexCount(createPolygonAnchor())).toBe(6);
  });

  it('描画更新頻度と頂点表示上限を安全な範囲へ正規化する', () => {
    expect(normalizeRenderFps(Number.NaN)).toBe(60);
    expect(normalizeRenderFps(120)).toBe(60);
    expect(normalizeVertexMarkerDisplayLimit(0)).toBe(1);
    expect(normalizeVertexMarkerDisplayLimit(Number.NaN)).toBe(1000);
  });

  it('ズーム範囲を破綻しない値へ揃える', () => {
    expect(normalizeZoomLimits(10, 2)).toEqual({ min: 2, max: 10 });
    expect(normalizeZoomLimits(Number.NaN, 0)).toEqual({ min: 0.1, max: 1 });
  });

  it('測量距離を表示向けに整形する', () => {
    expect(formatSurveyDistance(12.34)).toBe('12.3');
    expect(formatSurveyDistance(1234.56)).toBe('1,235');
  });
});
