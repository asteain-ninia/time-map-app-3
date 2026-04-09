import { beforeEach, describe, expect, it } from 'vitest';
import { ResolveFeatureAnchorConflictsUseCase, ResolveError } from '@application/ResolveFeatureAnchorConflictsUseCase';
import { PrepareFeatureAnchorEditUseCase } from '@application/PrepareFeatureAnchorEditUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('ResolveFeatureAnchorConflictsUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let prepare: PrepareFeatureAnchorEditUseCase;
  let resolve: ResolveFeatureAnchorConflictsUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    prepare = new PrepareFeatureAnchorEditUseCase(addFeature);
    resolve = new ResolveFeatureAnchorConflictsUseCase(addFeature, prepare);
  });

  describe('resolve', () => {
    it('存在しないドラフトIDはエラー', () => {
      expect(() =>
        resolve.resolve('nonexistent', [])
      ).toThrow(ResolveError);
    });

    it('競合のないドラフトはエラー', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = prepare.prepare(feature.id, 'property_only', time, {});

      expect(() =>
        resolve.resolve(result.draftId, [])
      ).toThrow(ResolveError);
    });

    it('非優先ポリゴンへ差分形状を新しい頂点で反映する', () => {
      const preferred = addFeature.addPolygon(polygon(0, 0, 10, 10), 'l1', time, 'preferred');
      const nonPreferred = addFeature.addPolygon(polygon(5, 0, 15, 10), 'l1', time, 'other');
      const originalAnchor = nonPreferred.getActiveAnchor(time)!;

      const prepared = prepare.prepare(preferred.id, 'property_only', time, {});
      expect(prepared.status).toBe('requires_resolution');

      const result = resolve.resolve(prepared.draftId, [
        { conflictIndex: 0, preferFeatureId: preferred.id },
      ]);

      const resolvedAnchor = result.resolvedAnchorsByFeature
        .get(nonPreferred.id)!
        .find((anchor) => anchor.isActiveAt(time))!;
      expect(resolvedAnchor.shape.type).toBe('Polygon');

      if (resolvedAnchor.shape.type !== 'Polygon') {
        throw new Error('Expected polygon shape');
      }

      expect(resolvedAnchor.shape.rings).toHaveLength(1);
      expect(resolvedAnchor.shape.rings[0].vertexIds).not.toEqual(originalAnchor.shape.type === 'Polygon'
        ? originalAnchor.shape.rings[0].vertexIds
        : []);

      const bounds = getRingBounds(resolvedAnchor.shape.rings[0], addFeature);
      expect(bounds).toEqual({ minX: 10, maxX: 15, minY: 0, maxY: 10 });
    });

    it('差分結果が複数片でも全territory ringを保持する', () => {
      const preferred = addFeature.addPolygon(polygon(10, 0, 20, 10), 'l1', time, 'barrier');
      const nonPreferred = addFeature.addPolygon(polygon(0, 0, 30, 10), 'l1', time, 'wide');

      const prepared = prepare.prepare(preferred.id, 'property_only', time, {});
      expect(prepared.status).toBe('requires_resolution');

      const result = resolve.resolve(prepared.draftId, [
        { conflictIndex: 0, preferFeatureId: preferred.id },
      ]);

      const resolvedAnchor = result.resolvedAnchorsByFeature
        .get(nonPreferred.id)!
        .find((anchor) => anchor.isActiveAt(time))!;

      if (resolvedAnchor.shape.type !== 'Polygon') {
        throw new Error('Expected polygon shape');
      }

      const territoryBounds = resolvedAnchor.shape.rings
        .filter((ring) => ring.ringType === 'territory')
        .map((ring) => getRingBounds(ring, addFeature))
        .map(({ minX, maxX }) => ({ minX, maxX }))
        .toSorted((a, b) => a.minX - b.minX);

      expect(territoryBounds).toEqual([
        { minX: 0, maxX: 10 },
        { minX: 20, maxX: 30 },
      ]);
    });

    it('180度超に延伸した競合でも差分形状を反映できる', () => {
      const preferred = addFeature.addPolygon(polygon(190, 0, 200, 10), 'l1', time, 'wrapped');
      const nonPreferred = addFeature.addPolygon(polygon(-175, 0, -165, 10), 'l1', time, 'primary');

      const prepared = prepare.prepare(preferred.id, 'property_only', time, {});
      expect(prepared.status).toBe('requires_resolution');

      const result = resolve.resolve(prepared.draftId, [
        { conflictIndex: 0, preferFeatureId: preferred.id },
      ]);

      const resolvedAnchor = result.resolvedAnchorsByFeature
        .get(nonPreferred.id)!
        .find((anchor) => anchor.isActiveAt(time))!;

      if (resolvedAnchor.shape.type !== 'Polygon') {
        throw new Error('Expected polygon shape');
      }

      const bounds = getRingBounds(resolvedAnchor.shape.rings[0], addFeature);
      expect(bounds).toEqual({ minX: -175, maxX: -170, minY: 0, maxY: 10 });
    });
  });
});

function polygon(minX: number, minY: number, maxX: number, maxY: number): Coordinate[] {
  return [
    new Coordinate(minX, minY),
    new Coordinate(maxX, minY),
    new Coordinate(maxX, maxY),
    new Coordinate(minX, maxY),
  ];
}

function getRingBounds(
  ring: Ring,
  addFeature: AddFeatureUseCase
): { minX: number; maxX: number; minY: number; maxY: number } {
  const vertices = addFeature.getVertices();
  const coords = ring.vertexIds.map((vertexId) => {
    const vertex = vertices.get(vertexId);
    if (!vertex) {
      throw new Error(`Vertex ${vertexId} not found`);
    }
    return vertex.coordinate;
  });

  return {
    minX: Math.min(...coords.map((coord) => coord.x)),
    maxX: Math.max(...coords.map((coord) => coord.x)),
    minY: Math.min(...coords.map((coord) => coord.y)),
    maxY: Math.max(...coords.map((coord) => coord.y)),
  };
}
