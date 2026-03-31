import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Layer } from '@domain/entities/Layer';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import {
  buildVisibleVertexOwnerMap,
  collectFeatureIdsForSelectedVertices,
  resolveVertexSelectionContext,
} from '@infrastructure/rendering/vertexSelectionContext';

function createPointFeature(
  featureId: string,
  vertexId: string,
  layerId: string,
  time: TimePoint = new TimePoint(1000)
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

function createPolygonFeature(
  featureId: string,
  vertexIds: string[],
  layerId: string,
  time: TimePoint = new TimePoint(1000)
): Feature {
  return new Feature(featureId, 'Polygon', [
    new FeatureAnchor(
      `${featureId}-anchor`,
      { start: time },
      { name: featureId, description: '' },
      {
        type: 'Polygon',
        rings: [new Ring(`${featureId}-ring`, vertexIds, 'territory', null)],
      },
      { layerId, parentId: null, childIds: [] }
    ),
  ]);
}

describe('vertexSelectionContext', () => {
  const currentTime = new TimePoint(1200);
  const visibleLayer = new Layer('visible', '表示', 0, true);
  const hiddenLayer = new Layer('hidden', '非表示', 1, false);

  describe('buildVisibleVertexOwnerMap', () => {
    it('現在時刻かつ可視レイヤー上の所有者だけを集計する', () => {
      const features = [
        createPointFeature('f1', 'v1', 'visible'),
        createPointFeature('f2', 'v2', 'hidden'),
        new Feature('f3', 'Point', [
          new FeatureAnchor(
            'f3-anchor',
            { start: new TimePoint(1300) },
            { name: 'f3', description: '' },
            { type: 'Point', vertexId: 'v3' },
            { layerId: 'visible', parentId: null, childIds: [] }
          ),
        ]),
      ];

      const ownerMap = buildVisibleVertexOwnerMap(features, [visibleLayer, hiddenLayer], currentTime);

      expect([...ownerMap.keys()]).toEqual(['v1']);
      expect(ownerMap.get('v1')).toEqual(new Set(['f1']));
    });

    it('共有頂点では所有地物を重複なく保持する', () => {
      const features = [
        createPointFeature('f1', 'shared-v', 'visible'),
        createPointFeature('f2', 'shared-v', 'visible'),
      ];

      const ownerMap = buildVisibleVertexOwnerMap(features, [visibleLayer], currentTime);

      expect(ownerMap.get('shared-v')).toEqual(new Set(['f1', 'f2']));
    });
  });

  describe('collectFeatureIdsForSelectedVertices', () => {
    it('選択頂点から所有地物ID集合を抽出する', () => {
      const ownerMap = new Map<string, Set<string>>([
        ['v1', new Set(['f1'])],
        ['v2', new Set(['f2', 'f3'])],
      ]);

      const featureIds = collectFeatureIdsForSelectedVertices(new Set(['v1', 'v2']), ownerMap);

      expect(featureIds).toEqual(new Set(['f1', 'f2', 'f3']));
    });
  });

  describe('resolveVertexSelectionContext', () => {
    it('空選択は empty を返す', () => {
      const context = resolveVertexSelectionContext(new Set(), new Map());
      expect(context).toEqual({ kind: 'empty', featureIds: [] });
    });

    it('単一地物のみなら single を返す', () => {
      const features = [
        createPolygonFeature('f1', ['v1', 'v2', 'v3'], 'visible'),
      ];
      const ownerMap = buildVisibleVertexOwnerMap(features, [visibleLayer], currentTime);

      const context = resolveVertexSelectionContext(new Set(['v1', 'v2']), ownerMap);

      expect(context).toEqual({ kind: 'single', featureIds: ['f1'] });
    });

    it('複数地物にまたがると multiple を返す', () => {
      const features = [
        createPointFeature('f1', 'v1', 'visible'),
        createPointFeature('f2', 'v2', 'visible'),
      ];
      const ownerMap = buildVisibleVertexOwnerMap(features, [visibleLayer], currentTime);

      const context = resolveVertexSelectionContext(new Set(['v1', 'v2']), ownerMap);

      expect(context).toEqual({ kind: 'multiple', featureIds: ['f1', 'f2'] });
    });

    it('所有者不明の頂点だけなら unknown を返す', () => {
      const ownerMap = new Map<string, Set<string>>([
        ['v1', new Set(['f1'])],
      ]);

      const context = resolveVertexSelectionContext(new Set(['missing-v']), ownerMap);

      expect(context).toEqual({ kind: 'unknown', featureIds: [] });
    });
  });
});
