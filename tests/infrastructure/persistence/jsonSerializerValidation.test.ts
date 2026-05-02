import { describe, it, expect } from 'vitest';
import { DEFAULT_METADATA } from '@domain/entities/World';
import { validateJsonWorld } from '@infrastructure/persistence/jsonSerializerValidation';
import type {
  JsonAnchorPlacement,
  JsonAnchorProperty,
  JsonFeature,
  JsonFeatureAnchor,
  JsonFeatureShape,
  JsonWorld,
} from '@infrastructure/persistence/jsonSerializerTypes';

const LAYER_ID = 'l1';
const TIME_RANGE = { start: { year: 100 } };
const PROPERTY: JsonAnchorProperty = { name: 'test', description: '' };

function createPlacement(overrides: Partial<JsonAnchorPlacement> = {}): JsonAnchorPlacement {
  return {
    layerId: LAYER_ID,
    parentId: null,
    childIds: [],
    isTopLevel: true,
    ...overrides,
  };
}

function createAnchor(
  shape: JsonFeatureShape | undefined,
  placement: JsonAnchorPlacement
): JsonFeatureAnchor {
  return {
    id: 'a1',
    timeRange: TIME_RANGE,
    property: PROPERTY,
    shape,
    placement,
  };
}

function createFeature(
  featureType: string,
  anchors: JsonFeatureAnchor[],
  id = 'f1'
): JsonFeature {
  return { id, featureType, anchors };
}

function createWorld(features: JsonFeature[]): JsonWorld {
  return {
    version: '1.0.0',
    layers: [{ id: LAYER_ID, name: 'L1', order: 0, visible: true, opacity: 1.0 }],
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 10, y: 0 },
      { id: 'v3', x: 0, y: 10 },
      { id: 'v4', x: 10, y: 10 },
    ],
    sharedVertexGroups: [],
    timelineMarkers: [],
    features,
    metadata: DEFAULT_METADATA,
  };
}

const TRIANGLE_RING = {
  id: 'r1',
  vertexIds: ['v1', 'v2', 'v3'],
  ringType: 'territory',
  parentId: null,
};

describe('validateJsonWorld - shape 保持規則 (Phase 2-C-4)', () => {
  describe('合格ケース', () => {
    it('Point feature が Point shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'Point', vertexId: 'v1' },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('Line feature が LineString shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('Polygon feature が Polygon shape を持つ場合は shape 規則エラーが出ない', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });

    it('集約地物（Polygon + shape 欠落 + childIds 非空）はエラーが出ない', () => {
      const containerAnchor = createAnchor(
        undefined,
        createPlacement({ childIds: ['f-child'] })
      );
      const childAnchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement({ parentId: 'f-container', isTopLevel: false })
      );
      const world = createWorld([
        createFeature('Polygon', [containerAnchor], 'f-container'),
        createFeature('Polygon', [childAnchor], 'f-child'),
      ]);

      const errors = validateJsonWorld(world);

      expect(errors.filter((e) => e.includes('shape'))).toEqual([]);
    });
  });

  describe('shape 欠落のエラー', () => {
    it('Polygon feature で shape 欠落かつ childIds 空の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" has no shape but is not a container (childIds is empty)'
      );
    });

    it('Point feature で shape 欠落の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" of type "Point" requires a shape'
      );
    });

    it('Line feature で shape 欠落の場合はエラー', () => {
      const anchor = createAnchor(undefined, createPlacement());
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" of type "Line" requires a shape'
      );
    });
  });

  describe('featureType と shape.type の不整合エラー', () => {
    it('Point feature に LineString shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'LineString', vertexIds: ['v1', 'v2', 'v3'] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Point', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "LineString" does not match featureType "Point"'
      );
    });

    it('Line feature に Polygon shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'Polygon', rings: [TRIANGLE_RING] },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Line', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "Polygon" does not match featureType "Line"'
      );
    });

    it('Polygon feature に Point shape を入れるとエラー', () => {
      const anchor = createAnchor(
        { type: 'Point', vertexId: 'v1' },
        createPlacement()
      );
      const errors = validateJsonWorld(createWorld([createFeature('Polygon', [anchor])]));

      expect(errors).toContain(
        'Feature "f1" anchor "a1" shape.type "Point" does not match featureType "Polygon"'
      );
    });
  });
});
