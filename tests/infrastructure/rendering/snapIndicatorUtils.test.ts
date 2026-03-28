import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { SnapCandidate } from '@domain/services/SharedVertexService';
import {
  buildSnapIndicators,
  buildSnapIndicator,
  isVertexShared,
  getSharedPeerIds,
} from '@infrastructure/rendering/snapIndicatorUtils';

describe('snapIndicatorUtils', () => {
  const v1 = new Vertex('v1', new Coordinate(10, 20));
  const v2 = new Vertex('v2', new Coordinate(15, 25));
  const v3 = new Vertex('v3', new Coordinate(20, 30));
  const vertices = new Map<string, Vertex>([
    ['v1', v1],
    ['v2', v2],
    ['v3', v3],
  ]);

  const group = new SharedVertexGroup('g1', ['v1', 'v2']);
  const sharedGroups = new Map<string, SharedVertexGroup>([['g1', group]]);
  const emptyGroups = new Map<string, SharedVertexGroup>();

  describe('buildSnapIndicator', () => {
    it('候補が空の場合はnull', () => {
      expect(buildSnapIndicator([], vertices, emptyGroups)).toBeNull();
    });

    it('最も近い候補からインジケーターを生成する', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v1', distance: 1, coordinate: v1.coordinate },
        { vertexId: 'v2', distance: 5, coordinate: v2.coordinate },
      ];
      const result = buildSnapIndicator(candidates, vertices, emptyGroups);
      expect(result).not.toBeNull();
      expect(result!.targetVertexId).toBe('v1');
      expect(result!.x).toBe(10);
      expect(result!.y).toBe(20);
      expect(result!.isShared).toBe(false);
    });

    it('共有グループに属する頂点はisShared=true', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v1', distance: 1, coordinate: v1.coordinate },
      ];
      const result = buildSnapIndicator(candidates, vertices, sharedGroups);
      expect(result!.isShared).toBe(true);
    });

    it('共有グループに属さない頂点はisShared=false', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v3', distance: 1, coordinate: v3.coordinate },
      ];
      const result = buildSnapIndicator(candidates, vertices, sharedGroups);
      expect(result!.isShared).toBe(false);
    });

    it('頂点が見つからない場合はnull', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v-unknown', distance: 1, coordinate: new Coordinate(0, 0) },
      ];
      expect(buildSnapIndicator(candidates, vertices, emptyGroups)).toBeNull();
    });
  });

  describe('buildSnapIndicators', () => {
    it('候補ごとに複数のインジケーターを生成する', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v1', distance: 1, coordinate: v1.coordinate },
        { vertexId: 'v2', distance: 2, coordinate: v2.coordinate },
      ];

      expect(buildSnapIndicators(candidates, vertices, sharedGroups)).toEqual([
        { targetVertexId: 'v1', x: 10, y: 20, isShared: true },
        { targetVertexId: 'v2', x: 15, y: 25, isShared: true },
      ]);
    });

    it('存在しない頂点候補はスキップする', () => {
      const candidates: SnapCandidate[] = [
        { vertexId: 'v1', distance: 1, coordinate: v1.coordinate },
        { vertexId: 'v-missing', distance: 2, coordinate: new Coordinate(0, 0) },
      ];

      expect(buildSnapIndicators(candidates, vertices, sharedGroups)).toEqual([
        { targetVertexId: 'v1', x: 10, y: 20, isShared: true },
      ]);
    });
  });

  describe('isVertexShared', () => {
    it('共有グループに属する頂点はtrue', () => {
      expect(isVertexShared('v1', sharedGroups)).toBe(true);
      expect(isVertexShared('v2', sharedGroups)).toBe(true);
    });

    it('共有グループに属さない頂点はfalse', () => {
      expect(isVertexShared('v3', sharedGroups)).toBe(false);
    });

    it('空のグループマップではfalse', () => {
      expect(isVertexShared('v1', emptyGroups)).toBe(false);
    });
  });

  describe('getSharedPeerIds', () => {
    it('共有グループの他メンバーを返す', () => {
      expect(getSharedPeerIds('v1', sharedGroups)).toEqual(['v2']);
      expect(getSharedPeerIds('v2', sharedGroups)).toEqual(['v1']);
    });

    it('共有グループに属さない場合は空配列', () => {
      expect(getSharedPeerIds('v3', sharedGroups)).toEqual([]);
    });

    it('空グループマップでは空配列', () => {
      expect(getSharedPeerIds('v1', emptyGroups)).toEqual([]);
    });
  });
});
