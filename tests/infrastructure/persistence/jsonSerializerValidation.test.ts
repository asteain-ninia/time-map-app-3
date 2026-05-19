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

/**
 * Phase 2-D-6-3b で in-memory `placement.layerId` を撤去し、
 * `serializeAnchorPlacement` は `'default'` を固定値出力する shim を持つ。
 * 旧 .gimoza（layers: [l1, l2]、anchor.placement.layerId: 'l1' など）を
 * 読込→再保存すると anchor 側だけ `'default'` に置き換わり、`world.layers` には
 * `'default'` が含まれない状態が生まれる。`validateLayerReferences` を残したままだと
 * その再保存ファイルが「next open で reject」になり、ユーザーから観たら「保存できるが次に開けない」
 * という壊れた挙動になる。本サブフェーズで `validateLayerReferences` を撤去し、
 * 開発ガイド §6.4.15「永続化 shim は read/write/validate/round-trip を同期する」を新規教訓として追加した。
 *
 * このテストは「保存後に同じファイルを再ロードできる」往復不変条件を固定する。
 */
describe('永続化 shim の round-trip 整合性 (Phase 2-D-6-3b)', () => {
  it('複数 layers を持つ旧形式 → 再保存ファイルが validateJsonWorld を通る', async () => {
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const oldJsonString = JSON.stringify({
      version: '1.0.0',
      layers: [
        { id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 },
        { id: 'l2', name: 'L2', order: 1, visible: true, opacity: 1.0 },
      ],
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { layerId: 'l1', parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    // 旧形式 → in-memory World
    const world = deserialize(oldJsonString);
    // in-memory → 再保存
    const resavedJsonString = serialize(world);
    const resaved = JSON.parse(resavedJsonString);

    // 再保存ファイルが validateJsonWorld を通る（layerId が 'default' に置き換わっても reject されない）
    const errors = validateJsonWorld(resaved);
    expect(errors).toEqual([]);

    // さらにこのファイルを再ロードできる（例外を投げない）
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });

  it('default layer を持たない旧形式でも再保存後に再ロードできる', async () => {
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const oldJsonString = JSON.stringify({
      version: '1.0.0',
      layers: [{ id: 'custom-layer', name: 'Custom', order: 0, visible: true, opacity: 1.0 }],
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { layerId: 'custom-layer', parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    const world = deserialize(oldJsonString);
    const resavedJsonString = serialize(world);
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });
});
