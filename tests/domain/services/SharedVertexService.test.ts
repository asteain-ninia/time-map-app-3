import { describe, it, expect } from 'vitest';
import {
  screenToWorldSnapDistance,
  findSnapCandidates,
  findGroupForVertex,
  getLinkedVertexIds,
  isSharedVertexMergeAllowed,
  mergeVertices,
  unmergeVertex,
  moveSharedVertices,
  UnmergeSuppression,
} from '@domain/services/SharedVertexService';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';

// ---- ヘルパー ----

function makeVertex(id: string, x: number, y: number): Vertex {
  return new Vertex(id, new Coordinate(x, y));
}

function makeGroup(id: string, vertexIds: string[], x: number, y: number): SharedVertexGroup {
  return new SharedVertexGroup(id, vertexIds, new Coordinate(x, y));
}

function verticesMap(...vs: Vertex[]): ReadonlyMap<string, Vertex> {
  return new Map(vs.map(v => [v.id, v]));
}

function groupsMap(...gs: SharedVertexGroup[]): ReadonlyMap<string, SharedVertexGroup> {
  return new Map(gs.map(g => [g.id, g]));
}

function makePointFeature(id: string, vertexId: string): Feature {
  return new Feature(
    id,
    'Point',
    [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(1000) },
        { name: id, description: '' },
        { type: 'Point', vertexId },
        { layerId: 'l1', parentId: null, childIds: [] }
      ),
    ]
  );
}

function makeLineFeature(id: string, vertexIds: readonly string[]): Feature {
  return new Feature(
    id,
    'Line',
    [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(1000) },
        { name: id, description: '' },
        { type: 'LineString', vertexIds },
        { layerId: 'l1', parentId: null, childIds: [] }
      ),
    ]
  );
}

function makePolygonFeature(id: string, rings: readonly Ring[]): Feature {
  return new Feature(
    id,
    'Polygon',
    [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(1000) },
        { name: id, description: '' },
        { type: 'Polygon', rings },
        { layerId: 'l1', parentId: null, childIds: [] }
      ),
    ]
  );
}

// ---- テスト ----

describe('SharedVertexService', () => {
  describe('screenToWorldSnapDistance', () => {
    it('ズーム1、幅800pxで50pxのスナップ距離を変換する', () => {
      // 1px = 360/1/800 = 0.45度、50px = 22.5度
      const result = screenToWorldSnapDistance(50, 800, 1);
      expect(result).toBeCloseTo(22.5);
    });

    it('ズーム10ではスナップ距離が1/10になる', () => {
      const zoom1 = screenToWorldSnapDistance(50, 800, 1);
      const zoom10 = screenToWorldSnapDistance(50, 800, 10);
      expect(zoom10).toBeCloseTo(zoom1 / 10);
    });

    it('表示幅が広いほどスナップ距離が小さくなる', () => {
      const narrow = screenToWorldSnapDistance(50, 400, 1);
      const wide = screenToWorldSnapDistance(50, 800, 1);
      expect(narrow).toBeGreaterThan(wide);
    });

    it('viewWidthが0の場合は0を返す', () => {
      expect(screenToWorldSnapDistance(50, 0, 1)).toBe(0);
    });

    it('zoomが0の場合は0を返す', () => {
      expect(screenToWorldSnapDistance(50, 800, 0)).toBe(0);
    });
  });

  describe('findSnapCandidates', () => {
    const v1 = makeVertex('v1', 0, 0);
    const v2 = makeVertex('v2', 1, 0);
    const v3 = makeVertex('v3', 5, 5);
    const v4 = makeVertex('v4', 0.5, 0);
    const vertices = verticesMap(v1, v2, v3, v4);

    it('スナップ距離内の頂点を距離昇順で返す', () => {
      const result = findSnapCandidates(0, 0, vertices, new Set(), 2);
      expect(result.length).toBe(3); // v1(0), v4(0.5), v2(1)
      expect(result[0].vertexId).toBe('v1');
      expect(result[1].vertexId).toBe('v4');
      expect(result[2].vertexId).toBe('v2');
    });

    it('スナップ距離外の頂点は含まれない', () => {
      const result = findSnapCandidates(0, 0, vertices, new Set(), 2);
      expect(result.find(c => c.vertexId === 'v3')).toBeUndefined();
    });

    it('除外IDに指定した頂点は含まれない', () => {
      const result = findSnapCandidates(0, 0, vertices, new Set(['v1', 'v4']), 2);
      expect(result.length).toBe(1);
      expect(result[0].vertexId).toBe('v2');
    });

    it('スナップ距離0では自位置の頂点のみ返す', () => {
      const result = findSnapCandidates(0, 0, vertices, new Set(), 0);
      expect(result.length).toBe(1);
      expect(result[0].vertexId).toBe('v1');
      expect(result[0].distance).toBe(0);
    });

    it('空の頂点マップでは空配列を返す', () => {
      const result = findSnapCandidates(0, 0, new Map(), new Set(), 10);
      expect(result).toEqual([]);
    });

    it('候補の座標情報が正しい', () => {
      const result = findSnapCandidates(0, 0, vertices, new Set(['v1']), 1);
      const v4Candidate = result.find(c => c.vertexId === 'v4');
      expect(v4Candidate).toBeDefined();
      expect(v4Candidate!.coordinate.x).toBe(0.5);
      expect(v4Candidate!.coordinate.y).toBe(0);
    });
  });

  describe('findGroupForVertex', () => {
    it('頂点が属するグループを返す', () => {
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const groups = groupsMap(g1);
      expect(findGroupForVertex('v1', groups)).toBe(g1);
      expect(findGroupForVertex('v2', groups)).toBe(g1);
    });

    it('どのグループにも属さない場合はundefined', () => {
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const groups = groupsMap(g1);
      expect(findGroupForVertex('v3', groups)).toBeUndefined();
    });

    it('空のグループマップではundefined', () => {
      expect(findGroupForVertex('v1', new Map())).toBeUndefined();
    });
  });

  describe('getLinkedVertexIds', () => {
    it('共有関係にある全頂点IDを返す（自分自身を含む）', () => {
      const g1 = makeGroup('g1', ['v1', 'v2', 'v3'], 0, 0);
      const groups = groupsMap(g1);
      const linked = getLinkedVertexIds('v1', groups);
      expect(linked).toEqual(['v1', 'v2', 'v3']);
    });

    it('共有関係がなければ空配列', () => {
      const groups = groupsMap(makeGroup('g1', ['v1', 'v2'], 0, 0));
      expect(getLinkedVertexIds('v99', groups)).toEqual([]);
    });
  });

  describe('isSharedVertexMergeAllowed', () => {
    const time = new TimePoint(1000);

    it('同一線形内の非隣接頂点どうしは共有頂点化できない', () => {
      const line = makeLineFeature('line-1', ['l1', 'l2', 'l3']);

      expect(isSharedVertexMergeAllowed('l1', 'l3', [line], new Map(), time)).toBe(false);
    });

    it('同一リング内の非隣接頂点どうしは共有頂点化できない', () => {
      const polygon = makePolygonFeature(
        'polygon-1',
        [new Ring('ring-1', ['r1', 'r2', 'r3', 'r4'], 'territory', null)]
      );

      expect(isSharedVertexMergeAllowed('r1', 'r3', [polygon], new Map(), time)).toBe(false);
    });

    it('同一地物でも別リングに属する頂点どうしは共有頂点化できる', () => {
      const polygon = makePolygonFeature(
        'polygon-1',
        [
          new Ring('outer-1', ['o1', 'o2', 'o3', 'o4'], 'territory', null),
          new Ring('hole-1', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer-1'),
          new Ring('island-1', ['i1', 'i2', 'i3'], 'territory', 'hole-1'),
        ]
      );

      expect(isSharedVertexMergeAllowed('h1', 'i1', [polygon], new Map(), time)).toBe(true);
    });

    it('マージ後の共有グループ内に同一リング頂点が共存する場合は拒否する', () => {
      const polygon = makePolygonFeature(
        'polygon-1',
        [new Ring('hole-1', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer-1')]
      );
      const pointA = makePointFeature('point-1', 'p1');
      const pointB = makePointFeature('point-2', 'p2');
      const groups = groupsMap(
        makeGroup('g1', ['p1', 'h1'], 0, 0),
        makeGroup('g2', ['p2', 'h3'], 10, 10)
      );

      expect(isSharedVertexMergeAllowed('p1', 'p2', [polygon, pointA, pointB], groups, time)).toBe(false);
    });
  });

  describe('mergeVertices', () => {
    it('どちらもグループに属さない場合、新規グループを作成する', () => {
      const coord = new Coordinate(5, 5);
      const result = mergeVertices('v1', 'v2', coord, new Map(), 'g-new');
      expect(result.updatedGroups.length).toBe(1);
      expect(result.updatedGroups[0].id).toBe('g-new');
      expect(result.updatedGroups[0].vertexIds).toEqual(['v1', 'v2']);
      expect(result.removedGroupIds).toEqual([]);
      expect(result.snapCoordinate).toBe(coord);
    });

    it('ドラッグ元がグループに属する場合、ターゲットをそのグループに追加する', () => {
      const g1 = makeGroup('g1', ['v1', 'v3'], 0, 0);
      const coord = new Coordinate(5, 5);
      const result = mergeVertices('v1', 'v2', coord, groupsMap(g1), 'g-new');
      expect(result.updatedGroups.length).toBe(1);
      expect(result.updatedGroups[0].id).toBe('g1');
      expect(result.updatedGroups[0].vertexIds).toContain('v2');
      expect(result.removedGroupIds).toEqual([]);
    });

    it('ターゲットがグループに属する場合、ドラッグ元をそのグループに追加する', () => {
      const g1 = makeGroup('g1', ['v2', 'v3'], 0, 0);
      const coord = new Coordinate(5, 5);
      const result = mergeVertices('v1', 'v2', coord, groupsMap(g1), 'g-new');
      expect(result.updatedGroups.length).toBe(1);
      expect(result.updatedGroups[0].id).toBe('g1');
      expect(result.updatedGroups[0].vertexIds).toContain('v1');
    });

    it('両方が別グループに属する場合、グループを統合する', () => {
      const gA = makeGroup('gA', ['v1', 'v3'], 0, 0);
      const gB = makeGroup('gB', ['v2', 'v4'], 5, 5);
      const coord = new Coordinate(3, 3);
      const result = mergeVertices('v1', 'v2', coord, groupsMap(gA, gB), 'g-new');
      expect(result.updatedGroups.length).toBe(1);
      expect(result.updatedGroups[0].id).toBe('gA');
      const ids = result.updatedGroups[0].vertexIds;
      expect(ids).toContain('v1');
      expect(ids).toContain('v2');
      expect(ids).toContain('v3');
      expect(ids).toContain('v4');
      expect(result.removedGroupIds).toEqual(['gB']);
    });

    it('同じグループに既に属している場合は座標のみ更新する', () => {
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const coord = new Coordinate(3, 3);
      const result = mergeVertices('v1', 'v2', coord, groupsMap(g1), 'g-new');
      expect(result.updatedGroups.length).toBe(1);
      expect(result.updatedGroups[0].vertexIds).toEqual(['v1', 'v2']);
      expect(result.removedGroupIds).toEqual([]);
      expect(result.snapCoordinate).toBe(coord);
    });

    it('統合時に重複する頂点IDは排除される', () => {
      // v1がgAにもgBにも属するケース（本来ありえないが防御的に）
      const gA = makeGroup('gA', ['v1', 'v2'], 0, 0);
      const gB = makeGroup('gB', ['v3', 'v1'], 5, 5);
      // v2はgAに属するのでdraggedとして使い、v3はgBに属する
      const coord = new Coordinate(3, 3);
      const result = mergeVertices('v2', 'v3', coord, groupsMap(gA, gB), 'g-new');
      const ids = result.updatedGroups[0].vertexIds;
      // v1が重複しない
      expect(ids.filter(id => id === 'v1').length).toBe(1);
    });
  });

  describe('unmergeVertex', () => {
    it('グループから頂点を除去して更新されたグループを返す', () => {
      const g1 = makeGroup('g1', ['v1', 'v2', 'v3'], 0, 0);
      const result = unmergeVertex('v1', groupsMap(g1));
      expect(result).not.toBeNull();
      expect(result!.groupId).toBe('g1');
      expect(result!.updatedGroup).not.toBeNull();
      expect(result!.updatedGroup!.vertexIds).toEqual(['v2', 'v3']);
    });

    it('グループが2メンバーから1メンバーになる場合、グループ削除（null）を返す', () => {
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const result = unmergeVertex('v1', groupsMap(g1));
      expect(result).not.toBeNull();
      expect(result!.updatedGroup).toBeNull();
      expect(result!.groupId).toBe('g1');
    });

    it('グループに属さない頂点の場合はnullを返す', () => {
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const result = unmergeVertex('v99', groupsMap(g1));
      expect(result).toBeNull();
    });
  });

  describe('moveSharedVertices', () => {
    it('グループ内の全頂点を新座標に更新する', () => {
      const v1 = makeVertex('v1', 0, 0);
      const v2 = makeVertex('v2', 0, 0);
      const g1 = makeGroup('g1', ['v1', 'v2'], 0, 0);
      const newCoord = new Coordinate(5, 5);

      const result = moveSharedVertices('g1', newCoord, groupsMap(g1), verticesMap(v1, v2));
      expect(result.updatedVertices.length).toBe(2);
      for (const [, vertex] of result.updatedVertices) {
        expect(vertex.x).toBe(5);
        expect(vertex.y).toBe(5);
      }
    });

    it('グループの代表座標も更新される', () => {
      const v1 = makeVertex('v1', 0, 0);
      const g1 = makeGroup('g1', ['v1'], 0, 0);
      const newCoord = new Coordinate(10, 20);

      const result = moveSharedVertices('g1', newCoord, groupsMap(g1), verticesMap(v1));
      expect(result.updatedGroup.representativeCoordinate.x).toBe(10);
      expect(result.updatedGroup.representativeCoordinate.y).toBe(20);
    });

    it('頂点マップに存在しないメンバーはスキップされる', () => {
      const v1 = makeVertex('v1', 0, 0);
      const g1 = makeGroup('g1', ['v1', 'v-missing'], 0, 0);
      const newCoord = new Coordinate(5, 5);

      const result = moveSharedVertices('g1', newCoord, groupsMap(g1), verticesMap(v1));
      expect(result.updatedVertices.length).toBe(1);
      expect(result.updatedVertices[0][0]).toBe('v1');
    });

    it('存在しないグループIDでは空の結果を返す', () => {
      const result = moveSharedVertices('g-missing', new Coordinate(0, 0), new Map(), new Map());
      expect(result.updatedVertices).toEqual([]);
    });

    it('経度の周回情報を保持したまま共有頂点を移動する', () => {
      const v1 = makeVertex('v1', 0, 0);
      const g1 = makeGroup('g1', ['v1'], 0, 0);
      const newCoord = new Coordinate(200, 0);

      const result = moveSharedVertices('g1', newCoord, groupsMap(g1), verticesMap(v1));
      expect(result.updatedVertices[0][1].x).toBe(200);
    });
  });

  describe('UnmergeSuppression', () => {
    it('ペアの抑制を登録・判定できる', () => {
      const suppression = new UnmergeSuppression();
      suppression.suppress('v1', 'v2');
      expect(suppression.isSuppressed('v1', 'v2')).toBe(true);
      expect(suppression.isSuppressed('v2', 'v1')).toBe(true); // 順序不問
    });

    it('登録していないペアは抑制されない', () => {
      const suppression = new UnmergeSuppression();
      suppression.suppress('v1', 'v2');
      expect(suppression.isSuppressed('v1', 'v3')).toBe(false);
    });

    it('ペア単位で抑制を解除できる', () => {
      const suppression = new UnmergeSuppression();
      suppression.suppress('v1', 'v2');
      suppression.suppress('v1', 'v3');
      suppression.release('v1', 'v2');
      expect(suppression.isSuppressed('v1', 'v2')).toBe(false);
      expect(suppression.isSuppressed('v1', 'v3')).toBe(true);
    });

    it('特定頂点に関する全抑制を一括解除できる', () => {
      const suppression = new UnmergeSuppression();
      suppression.suppress('v1', 'v2');
      suppression.suppress('v1', 'v3');
      suppression.suppress('v2', 'v4');
      suppression.releaseAll('v1');
      expect(suppression.isSuppressed('v1', 'v2')).toBe(false);
      expect(suppression.isSuppressed('v1', 'v3')).toBe(false);
      expect(suppression.isSuppressed('v2', 'v4')).toBe(true);
    });

    it('sizeは現在の抑制ペア数を返す', () => {
      const suppression = new UnmergeSuppression();
      expect(suppression.size).toBe(0);
      suppression.suppress('v1', 'v2');
      suppression.suppress('v1', 'v3');
      expect(suppression.size).toBe(2);
    });

    it('clearで全抑制を解除できる', () => {
      const suppression = new UnmergeSuppression();
      suppression.suppress('v1', 'v2');
      suppression.suppress('v1', 'v3');
      suppression.clear();
      expect(suppression.size).toBe(0);
      expect(suppression.isSuppressed('v1', 'v2')).toBe(false);
    });
  });
});
