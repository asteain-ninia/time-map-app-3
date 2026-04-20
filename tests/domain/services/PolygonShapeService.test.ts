import { describe, it, expect } from 'vitest';
import { Vertex } from '@domain/entities/Vertex';
import {
  buildPolygonRingDrafts,
  rebuildTerritoryHierarchy,
  resolvePolygonShapePolygons,
} from '@domain/services/PolygonShapeService';
import { Ring } from '@domain/value-objects/Ring';
import { Coordinate } from '@domain/value-objects/Coordinate';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { RingCoords } from '@domain/services/GeometryService';

describe('PolygonShapeService', () => {
  it('多段の穴内島territoryを最も内側のholeへ再接続する', () => {
    let nextId = 0;
    const drafts = buildPolygonRingDrafts(
      [
        [square(0, 0, 20, 20), square(5, 5, 15, 15)],
        [square(8, 8, 12, 12), square(9, 9, 11, 11)],
        [square(9.25, 9.25, 10.75, 10.75)],
      ],
      () => `ring-${nextId++}`
    );

    const rebuilt = rebuildTerritoryHierarchy(drafts);

    expect(rebuilt.find((ring) => ring.id === 'ring-0')?.parentId).toBeNull();
    expect(rebuilt.find((ring) => ring.id === 'ring-1')?.parentId).toBe('ring-0');
    expect(rebuilt.find((ring) => ring.id === 'ring-2')?.parentId).toBe('ring-1');
    expect(rebuilt.find((ring) => ring.id === 'ring-3')?.parentId).toBe('ring-2');
    expect(rebuilt.find((ring) => ring.id === 'ring-4')?.parentId).toBe('ring-3');
  });

  it('親付きterritoryを独立したpolygonとして解決し直下のholeだけを含める', () => {
    const vertices = new Map<string, Vertex>();
    const outerIds = createVertices(vertices, 'outer', square(0, 0, 20, 20));
    const holeIds = createVertices(vertices, 'hole', square(5, 5, 15, 15));
    const islandIds = createVertices(vertices, 'island', square(8, 8, 12, 12));
    const islandHoleIds = createVertices(vertices, 'island-hole', square(9, 9, 11, 11));
    const shape: FeatureShape & { type: 'Polygon' } = {
      type: 'Polygon',
      rings: [
        new Ring('outer', outerIds, 'territory', null),
        new Ring('hole', holeIds, 'hole', 'outer'),
        new Ring('island', islandIds, 'territory', 'hole'),
        new Ring('island-hole', islandHoleIds, 'hole', 'island'),
      ],
    };

    const polygons = resolvePolygonShapePolygons(shape, vertices);

    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveLength(2);
    expect(polygons[1]).toHaveLength(2);
    expect(polygons[0][0]).toEqual(square(0, 0, 20, 20));
    expect(polygons[0][1]).toEqual(square(5, 5, 15, 15));
    expect(polygons[1][0]).toEqual(square(8, 8, 12, 12));
    expect(polygons[1][1]).toEqual(square(9, 9, 11, 11));
  });
});

function square(minX: number, minY: number, maxX: number, maxY: number): RingCoords {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createVertices(
  vertices: Map<string, Vertex>,
  prefix: string,
  coords: RingCoords
): string[] {
  return coords.map((coord, index) => {
    const id = `${prefix}-${index}`;
    vertices.set(id, new Vertex(id, new Coordinate(coord.x, coord.y)));
    return id;
  });
}
