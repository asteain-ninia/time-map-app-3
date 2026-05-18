import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import {
  buildSceneVertexOwnerMap,
  collectFeatureIdsForSelectedVertices,
  resolveVertexSelectionContext,
} from '@infrastructure/rendering/vertexSelectionContext';
import { collectMapSceneEntries } from '@presentation/components/mapSceneEntries';

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
      { layerId, parentId: null, childIds: [], isTopLevel: true }
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
      { layerId, parentId: null, childIds: [], isTopLevel: true }
    ),
  ]);
}

/** ポリゴンリーフの polygonRings 解決に必要な最小限の vertex 座標を組み立てる */
function makeCoords(...ids: string[]): ReadonlyMap<string, Coordinate> {
  const m = new Map<string, Coordinate>();
  ids.forEach((id, i) => m.set(id, new Coordinate(i, i)));
  return m;
}

describe('vertexSelectionContext', () => {
  const currentTime = new TimePoint(1200);

  describe('buildSceneVertexOwnerMap', () => {
    it('sceneEntries に含まれる地物の所有者だけを集計する', () => {
      // 「描画される地物 = 頂点所有者として現れる地物」を sceneEntries で固定する
      // （開発ガイド §6.1.2 / §6.6.9 対概念整合性）
      const features = [
        createPointFeature('f1', 'v1', 'visible'),
        new Feature('f3', 'Point', [
          new FeatureAnchor(
            'f3-anchor',
            { start: new TimePoint(1300) },
            { name: 'f3', description: '' },
            { type: 'Point', vertexId: 'v3' },
            { layerId: 'visible', parentId: null, childIds: [], isTopLevel: true }
          ),
        ]),
      ];
      const sceneEntries = collectMapSceneEntries(features, currentTime, makeCoords('v1', 'v3'));

      const ownerMap = buildSceneVertexOwnerMap(sceneEntries);

      expect([...ownerMap.keys()]).toEqual(['v1']);
      expect(ownerMap.get('v1')).toEqual(new Set(['f1']));
    });

    it('共有頂点では所有地物を重複なく保持する', () => {
      const features = [
        createPointFeature('f1', 'shared-v', 'visible'),
        createPointFeature('f2', 'shared-v', 'visible'),
      ];
      const sceneEntries = collectMapSceneEntries(features, currentTime, makeCoords('shared-v'));

      const ownerMap = buildSceneVertexOwnerMap(sceneEntries);

      expect(ownerMap.get('shared-v')).toEqual(new Set(['f1', 'f2']));
    });

    it('空 sceneEntries なら空 ownerMap', () => {
      const ownerMap = buildSceneVertexOwnerMap([]);
      expect(ownerMap.size).toBe(0);
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
      const ownerMap = buildSceneVertexOwnerMap(
        collectMapSceneEntries(features, currentTime, makeCoords('v1', 'v2', 'v3'))
      );

      const context = resolveVertexSelectionContext(new Set(['v1', 'v2']), ownerMap);

      expect(context).toEqual({ kind: 'single', featureIds: ['f1'] });
    });

    it('複数地物にまたがると multiple を返す', () => {
      const features = [
        createPointFeature('f1', 'v1', 'visible'),
        createPointFeature('f2', 'v2', 'visible'),
      ];
      const ownerMap = buildSceneVertexOwnerMap(
        collectMapSceneEntries(features, currentTime, makeCoords('v1', 'v2'))
      );

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
