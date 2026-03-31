import { describe, it, expect } from 'vitest';
import {
  addHoleRing,
  addExclaveRing,
  deleteRing,
  isRingDrawingPointAllowed,
  resolveRingDrawingPlacement,
  validateNewRingPlacement,
  validatePolygonRingHierarchy,
  validateRingPlacement,
  resolveRingCoords,
  getDirectChildren,
  getDescendants,
  RingEditError,
} from '@domain/services/RingEditService';
import { Ring } from '@domain/value-objects/Ring';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { RingCoords } from '@domain/services/GeometryService';

// ---- ヘルパー ----

function makeRing(id: string, type: 'territory' | 'hole', parentId: string | null): Ring {
  return new Ring(id, ['v1', 'v2', 'v3'], type, parentId);
}

function makeVertex(id: string, x: number, y: number): Vertex {
  return new Vertex(id, new Coordinate(x, y));
}

function verticesMap(...vs: Vertex[]): ReadonlyMap<string, Vertex> {
  return new Map(vs.map(v => [v.id, v]));
}

function createNestedRingFixture() {
  const outer = new Ring('outer', ['o1', 'o2', 'o3', 'o4'], 'territory', null);
  const hole = new Ring('hole', ['h1', 'h2', 'h3', 'h4'], 'hole', 'outer');
  const island = new Ring('island', ['i1', 'i2', 'i3', 'i4'], 'territory', 'hole');
  const rings = [outer, hole, island];
  const vertices = verticesMap(
    makeVertex('o1', 0, 0),
    makeVertex('o2', 20, 0),
    makeVertex('o3', 20, 20),
    makeVertex('o4', 0, 20),
    makeVertex('h1', 4, 4),
    makeVertex('h2', 16, 4),
    makeVertex('h3', 16, 16),
    makeVertex('h4', 4, 16),
    makeVertex('i1', 6, 6),
    makeVertex('i2', 10, 6),
    makeVertex('i3', 10, 10),
    makeVertex('i4', 6, 10),
  );
  return { rings, vertices };
}

// ---- テスト ----

describe('RingEditService', () => {
  describe('addHoleRing', () => {
    it('領土リングの子として穴リングを追加できる', () => {
      const territory = makeRing('r1', 'territory', null);
      const result = addHoleRing([territory], 'r1', 'r-new', ['v4', 'v5', 'v6']);
      expect(result.rings.length).toBe(2);
      expect(result.addedRingId).toBe('r-new');
      const added = result.rings.find(r => r.id === 'r-new')!;
      expect(added.ringType).toBe('hole');
      expect(added.parentId).toBe('r1');
      expect(added.vertexIds).toEqual(['v4', 'v5', 'v6']);
    });

    it('親リングが存在しない場合はエラー', () => {
      expect(() => addHoleRing([], 'r-missing', 'r-new', ['v1', 'v2', 'v3']))
        .toThrow(RingEditError);
    });

    it('親リングがholeの場合はエラー', () => {
      const hole = makeRing('r1', 'hole', 'r0');
      expect(() => addHoleRing([hole], 'r1', 'r-new', ['v1', 'v2', 'v3']))
        .toThrow('not a territory ring');
    });

    it('3点未満の場合はエラー', () => {
      const territory = makeRing('r1', 'territory', null);
      expect(() => addHoleRing([territory], 'r1', 'r-new', ['v1', 'v2']))
        .toThrow('at least 3 vertices');
    });
  });

  describe('addExclaveRing', () => {
    it('穴リングの子として飛び地を追加できる', () => {
      const territory = makeRing('r1', 'territory', null);
      const hole = makeRing('r2', 'hole', 'r1');
      const result = addExclaveRing([territory, hole], 'r2', 'r-new', ['v4', 'v5', 'v6']);
      expect(result.rings.length).toBe(3);
      const added = result.rings.find(r => r.id === 'r-new')!;
      expect(added.ringType).toBe('territory');
      expect(added.parentId).toBe('r2');
    });

    it('トップレベルの飛び地を追加できる（parentId=null）', () => {
      const result = addExclaveRing([], null, 'r-new', ['v1', 'v2', 'v3']);
      expect(result.rings.length).toBe(1);
      const added = result.rings[0];
      expect(added.ringType).toBe('territory');
      expect(added.parentId).toBeNull();
    });

    it('親がterritoryの場合はエラー', () => {
      const territory = makeRing('r1', 'territory', null);
      expect(() => addExclaveRing([territory], 'r1', 'r-new', ['v1', 'v2', 'v3']))
        .toThrow('not a hole ring');
    });

    it('3点未満の場合はエラー', () => {
      expect(() => addExclaveRing([], null, 'r-new', ['v1', 'v2']))
        .toThrow('at least 3 vertices');
    });
  });

  describe('deleteRing', () => {
    it('穴リングを削除すると直下の領土子リングも削除される', () => {
      // 飛び地A → 穴A → 飛び地B → 穴B → 飛び地C
      const rings = [
        makeRing('terr-A', 'territory', null),
        new Ring('hole-A', ['v1', 'v2', 'v3'], 'hole', 'terr-A'),
        new Ring('terr-B', ['v4', 'v5', 'v6'], 'territory', 'hole-A'),
        new Ring('hole-B', ['v7', 'v8', 'v9'], 'hole', 'terr-B'),
        new Ring('terr-C', ['v10', 'v11', 'v12'], 'territory', 'hole-B'),
      ];

      const result = deleteRing(rings, 'hole-A');

      // hole-A と terr-B が削除される
      expect(result.deletedRingIds).toContain('hole-A');
      expect(result.deletedRingIds).toContain('terr-B');
      expect(result.deletedRingIds.length).toBe(2);

      // hole-B は terr-A に再接続される
      const holeB = result.rings.find(r => r.id === 'hole-B')!;
      expect(holeB.parentId).toBe('terr-A');

      // terr-C はそのまま（hole-Bの子）
      const terrC = result.rings.find(r => r.id === 'terr-C')!;
      expect(terrC.parentId).toBe('hole-B');

      expect(result.shouldDeleteFeature).toBe(false);
    });

    it('領土リングを削除すると直下の穴子リングも削除される', () => {
      // 飛び地A → 穴A → 飛び地B → 穴B → 飛び地C
      const rings = [
        new Ring('terr-A', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('hole-A', ['v4', 'v5', 'v6'], 'hole', 'terr-A'),
        new Ring('terr-B', ['v7', 'v8', 'v9'], 'territory', 'hole-A'),
        new Ring('hole-B', ['v10', 'v11', 'v12'], 'hole', 'terr-B'),
        new Ring('terr-C', ['v13', 'v14', 'v15'], 'territory', 'hole-B'),
      ];

      const result = deleteRing(rings, 'terr-A');

      // terr-A と hole-A が削除される
      expect(result.deletedRingIds).toContain('terr-A');
      expect(result.deletedRingIds).toContain('hole-A');
      expect(result.deletedRingIds.length).toBe(2);

      // terr-B がトップレベルに昇格
      const terrB = result.rings.find(r => r.id === 'terr-B')!;
      expect(terrB.parentId).toBeNull();

      // hole-B と terr-C はそのまま
      expect(result.rings.find(r => r.id === 'hole-B')!.parentId).toBe('terr-B');
      expect(result.rings.find(r => r.id === 'terr-C')!.parentId).toBe('hole-B');

      expect(result.shouldDeleteFeature).toBe(false);
    });

    it('唯一のトップレベル領土を削除して孫が昇格しない場合は地物削除', () => {
      const rings = [
        makeRing('terr-A', 'territory', null),
      ];
      const result = deleteRing(rings, 'terr-A');
      expect(result.shouldDeleteFeature).toBe(true);
    });

    it('唯一のトップレベル領土でも孫が昇格すれば地物は残る', () => {
      const rings = [
        new Ring('terr-A', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('hole-A', ['v4', 'v5', 'v6'], 'hole', 'terr-A'),
        new Ring('terr-B', ['v7', 'v8', 'v9'], 'territory', 'hole-A'),
      ];
      const result = deleteRing(rings, 'terr-A');
      expect(result.shouldDeleteFeature).toBe(false);
      const terrB = result.rings.find(r => r.id === 'terr-B')!;
      expect(terrB.parentId).toBeNull();
    });

    it('複数のトップレベル領土がある場合、一つを削除しても地物は残る', () => {
      const rings = [
        new Ring('terr-A', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('terr-B', ['v4', 'v5', 'v6'], 'territory', null),
      ];
      const result = deleteRing(rings, 'terr-A');
      expect(result.shouldDeleteFeature).toBe(false);
      expect(result.rings.length).toBe(1);
      expect(result.rings[0].id).toBe('terr-B');
    });

    it('子リングがない場合は対象リングのみ削除される', () => {
      const rings = [
        new Ring('terr-A', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('hole-A', ['v4', 'v5', 'v6'], 'hole', 'terr-A'),
      ];
      const result = deleteRing(rings, 'hole-A');
      expect(result.deletedRingIds).toEqual(['hole-A']);
      expect(result.rings.length).toBe(1);
      expect(result.rings[0].id).toBe('terr-A');
    });

    it('存在しないリングIDの場合はエラー', () => {
      expect(() => deleteRing([], 'r-missing')).toThrow(RingEditError);
    });

    it('複数の子リングが再接続される', () => {
      // terr-A → hole-A, hole-B (2つの穴)
      // hole-A → terr-B, hole-B → terr-C
      // terr-A を削除すると hole-A, hole-B が削除され、terr-B, terr-C がトップレベルへ
      const rings = [
        new Ring('terr-A', ['v1', 'v2', 'v3'], 'territory', null),
        new Ring('hole-A', ['v4', 'v5', 'v6'], 'hole', 'terr-A'),
        new Ring('hole-B', ['v7', 'v8', 'v9'], 'hole', 'terr-A'),
        new Ring('terr-B', ['v10', 'v11', 'v12'], 'territory', 'hole-A'),
        new Ring('terr-C', ['v13', 'v14', 'v15'], 'territory', 'hole-B'),
      ];
      const result = deleteRing(rings, 'terr-A');

      expect(result.deletedRingIds).toContain('terr-A');
      expect(result.deletedRingIds).toContain('hole-A');
      expect(result.deletedRingIds).toContain('hole-B');
      expect(result.deletedRingIds.length).toBe(3);

      expect(result.rings.length).toBe(2);
      expect(result.rings.find(r => r.id === 'terr-B')!.parentId).toBeNull();
      expect(result.rings.find(r => r.id === 'terr-C')!.parentId).toBeNull();

      expect(result.shouldDeleteFeature).toBe(false);
    });
  });

  describe('validateRingPlacement', () => {
    const outerSquare: RingCoords = [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ];
    const innerSquare: RingCoords = [
      { x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 },
    ];

    it('有効な穴配置ではエラーなし', () => {
      const errors = validateRingPlacement(innerSquare, outerSquare, []);
      expect(errors).toEqual([]);
    });

    it('自己交差するリングはエラー', () => {
      const bowTie: RingCoords = [
        { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 },
      ];
      const errors = validateRingPlacement(bowTie, null, []);
      expect(errors.some(e => e.type === 'self_intersecting')).toBe(true);
    });

    it('親リングからはみ出すとエラー', () => {
      const outside: RingCoords = [
        { x: 15, y: 15 }, { x: 25, y: 15 }, { x: 25, y: 25 }, { x: 15, y: 25 },
      ];
      const errors = validateRingPlacement(outside, outerSquare, []);
      expect(errors.some(e => e.type === 'not_contained')).toBe(true);
    });

    it('親リングの境界と交差するとエラー', () => {
      const crossing: RingCoords = [
        { x: -5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 15 }, { x: -5, y: 15 },
      ];
      const errors = validateRingPlacement(crossing, outerSquare, []);
      expect(errors.some(e => e.type === 'boundary_crossing')).toBe(true);
    });

    it('兄弟リングと重なるとエラー', () => {
      const sibling: RingCoords = [
        { x: 3, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 12 }, { x: 3, y: 12 },
      ];
      const errors = validateRingPlacement(innerSquare, outerSquare, [sibling]);
      expect(errors.some(e => e.type === 'sibling_overlap')).toBe(true);
    });

    it('兄弟リングと重ならなければエラーなし', () => {
      const sibling: RingCoords = [
        { x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 },
      ];
      const errors = validateRingPlacement(innerSquare, outerSquare, [sibling]);
      expect(errors).toEqual([]);
    });

    it('親リングなしの場合、包含チェックはスキップ', () => {
      const errors = validateRingPlacement(innerSquare, null, []);
      expect(errors).toEqual([]);
    });
  });

  describe('resolveRingDrawingPlacement', () => {
    it('領土内部から始めると穴モードになり、その領土リングが親になる', () => {
      const { rings, vertices } = createNestedRingFixture();

      const result = resolveRingDrawingPlacement(rings, vertices, { x: 2, y: 2 });

      expect(result.message).toBeNull();
      expect(result.placement).toEqual({
        type: 'hole',
        parentRingId: 'outer',
        constraint: { kind: 'territory', ringId: 'outer' },
      });
    });

    it('穴内部から始めると飛び地モードになり、その穴リングが親になる', () => {
      const { rings, vertices } = createNestedRingFixture();

      const result = resolveRingDrawingPlacement(rings, vertices, { x: 5, y: 5 });

      expect(result.message).toBeNull();
      expect(result.placement).toEqual({
        type: 'exclave',
        parentRingId: 'hole',
        constraint: { kind: 'hole', ringId: 'hole' },
      });
    });

    it('穴の中の飛び地内部から始めると、その飛び地を親にした穴モードになる', () => {
      const { rings, vertices } = createNestedRingFixture();

      const result = resolveRingDrawingPlacement(rings, vertices, { x: 7, y: 7 });

      expect(result.message).toBeNull();
      expect(result.placement).toEqual({
        type: 'hole',
        parentRingId: 'island',
        constraint: { kind: 'territory', ringId: 'island' },
      });
    });

    it('ポリゴン外部から始めるとトップレベル飛び地モードになる', () => {
      const { rings, vertices } = createNestedRingFixture();

      const result = resolveRingDrawingPlacement(rings, vertices, { x: 30, y: 30 });

      expect(result.message).toBeNull();
      expect(result.placement).toEqual({
        type: 'exclave',
        parentRingId: null,
        constraint: { kind: 'outside' },
      });
    });

    it('リング境界上からは開始できない', () => {
      const { rings, vertices } = createNestedRingFixture();

      const result = resolveRingDrawingPlacement(rings, vertices, { x: 0, y: 10 });

      expect(result.placement).toBeNull();
      expect(result.message).toContain('リング境界上');
    });
  });

  describe('isRingDrawingPointAllowed', () => {
    it('穴モードでは開始した領土リングの内部かつ既存の穴の外側だけを許可する', () => {
      const { rings, vertices } = createNestedRingFixture();
      const placement = resolveRingDrawingPlacement(rings, vertices, { x: 2, y: 2 }).placement!;

      expect(isRingDrawingPointAllowed({ x: 3, y: 3 }, placement, rings, vertices)).toBe(true);
      expect(isRingDrawingPointAllowed({ x: 5, y: 5 }, placement, rings, vertices)).toBe(false);
    });

    it('穴内飛び地モードでは開始した穴リングの内部だけを許可する', () => {
      const { rings, vertices } = createNestedRingFixture();
      const placement = resolveRingDrawingPlacement(rings, vertices, { x: 5, y: 5 }).placement!;

      expect(isRingDrawingPointAllowed({ x: 12, y: 12 }, placement, rings, vertices)).toBe(true);
      expect(isRingDrawingPointAllowed({ x: 7, y: 7 }, placement, rings, vertices)).toBe(false);
      expect(isRingDrawingPointAllowed({ x: 2, y: 2 }, placement, rings, vertices)).toBe(false);
    });

    it('トップレベル飛び地モードでは選択ポリゴンの外側だけを許可する', () => {
      const { rings, vertices } = createNestedRingFixture();
      const placement = resolveRingDrawingPlacement(rings, vertices, { x: 30, y: 30 }).placement!;

      expect(isRingDrawingPointAllowed({ x: 35, y: 35 }, placement, rings, vertices)).toBe(true);
      expect(isRingDrawingPointAllowed({ x: 5, y: 5 }, placement, rings, vertices)).toBe(false);
    });
  });

  describe('validateNewRingPlacement', () => {
    it('穴内飛び地を追加する座標列を受け入れる', () => {
      const { rings, vertices } = createNestedRingFixture();
      const placement = resolveRingDrawingPlacement(rings, vertices, { x: 5, y: 5 }).placement!;
      const coords: RingCoords = [
        { x: 11, y: 11 },
        { x: 15, y: 11 },
        { x: 15, y: 15 },
        { x: 11, y: 15 },
      ];

      const errors = validateNewRingPlacement(rings, vertices, placement, coords);

      expect(errors).toEqual([]);
    });
  });

  describe('validatePolygonRingHierarchy', () => {
    it('有効なネスト構造ならエラーなし', () => {
      const { rings, vertices } = createNestedRingFixture();

      expect(validatePolygonRingHierarchy(rings, vertices)).toEqual([]);
    });

    it('穴リングが親領土からはみ出すとエラーになる', () => {
      const { rings, vertices } = createNestedRingFixture();
      const invalidVertices = new Map(vertices);
      invalidVertices.set('h3', makeVertex('h3', 24, 16));

      const errors = validatePolygonRingHierarchy(rings, invalidVertices);

      expect(errors.some((error) => error.type === 'not_contained' || error.type === 'boundary_crossing')).toBe(true);
    });

    it('飛び地リングの親が穴でない場合はエラーになる', () => {
      const { vertices } = createNestedRingFixture();
      const rings = [
        new Ring('outer', ['o1', 'o2', 'o3', 'o4'], 'territory', null),
        new Ring('island', ['i1', 'i2', 'i3', 'i4'], 'territory', 'outer'),
      ];

      const errors = validatePolygonRingHierarchy(rings, vertices);

      expect(errors.some((error) => error.message.includes('飛び地リングの親'))).toBe(true);
    });
  });

  describe('resolveRingCoords', () => {
    it('リングの頂点座標を解決する', () => {
      const ring = new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null);
      const vertices = verticesMap(
        makeVertex('v1', 0, 0),
        makeVertex('v2', 10, 0),
        makeVertex('v3', 5, 10),
      );
      const coords = resolveRingCoords(ring, vertices);
      expect(coords).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ]);
    });

    it('頂点が見つからない場合はエラー', () => {
      const ring = new Ring('r1', ['v1', 'v-missing'], 'territory', null);
      const vertices = verticesMap(makeVertex('v1', 0, 0));
      expect(() => resolveRingCoords(ring, vertices)).toThrow(RingEditError);
    });
  });

  describe('getDirectChildren', () => {
    it('指定リングの直下の子リングを取得する', () => {
      const rings = [
        makeRing('r1', 'territory', null),
        makeRing('r2', 'hole', 'r1'),
        makeRing('r3', 'hole', 'r1'),
        makeRing('r4', 'territory', 'r2'),
      ];
      const children = getDirectChildren(rings, 'r1');
      expect(children.length).toBe(2);
      expect(children.map(r => r.id).sort()).toEqual(['r2', 'r3']);
    });

    it('子リングがない場合は空配列', () => {
      const rings = [makeRing('r1', 'territory', null)];
      expect(getDirectChildren(rings, 'r1')).toEqual([]);
    });
  });

  describe('getDescendants', () => {
    it('全子孫リングを取得する', () => {
      const rings = [
        makeRing('r1', 'territory', null),
        makeRing('r2', 'hole', 'r1'),
        makeRing('r3', 'territory', 'r2'),
        makeRing('r4', 'hole', 'r3'),
      ];
      const desc = getDescendants(rings, 'r1');
      expect(desc.length).toBe(3);
      expect(desc.map(r => r.id).sort()).toEqual(['r2', 'r3', 'r4']);
    });

    it('子孫がない場合は空配列', () => {
      const rings = [makeRing('r1', 'territory', null)];
      expect(getDescendants(rings, 'r1')).toEqual([]);
    });
  });
});
