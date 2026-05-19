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
 * Phase 2-D-6-3c で `JsonAnchorPlacement.layerId` を JSON 型から完全撤去した。
 * 要件定義書 §2.5.2「旧モデル（レイヤー概念を含む形式バージョン）のファイルは
 * 互換性なしとして読み込みエラーで拒否する。マイグレーションは提供しない。」
 * 現状.md §6.2「既存 .gimoza 互換性は破棄する（移行マイグレーションは実装しない）」。
 *
 * 旧 .gimoza（anchor.placement.layerId フィールドを含む形式）は本サブフェーズで
 * 互換破棄が完成する地点となり、読み込み時に `SerializationError` で拒否される。
 *
 * 開発ガイド §6.4.15「永続化 shim は read / write / validate / round-trip test を
 * 同じ変更単位で同期する」に従い、本テストでは
 *   - 旧形式（layerId 含む）→ 読み込み拒否
 *   - 新形式（layerId なし）→ 読込 → 再保存 → 再読み込みが通る
 *   - 新形式の再保存ファイルに `placement.layerId` フィールドが残っていない
 * を固定する。
 */
describe('互換破棄の検証 (Phase 2-D-6-3c)', () => {
  it('旧形式（placement.layerId を含む）は読み込みエラーで拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
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

    expect(() => deserialize(oldJsonString)).toThrow(SerializationError);
    expect(() => deserialize(oldJsonString)).toThrow('placement.layerId を含む形式');
    expect(() => deserialize(oldJsonString)).toThrow('新規プロジェクトを開始してください');
  });

  it('カスタムレイヤーを持つ旧形式も同様に拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
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

    expect(() => deserialize(oldJsonString)).toThrow(SerializationError);
    expect(() => deserialize(oldJsonString)).toThrow('placement.layerId を含む形式');
  });

  it('新形式（layerId なし）→ 再保存 → 再読み込みは正常に往復する', async () => {
    const { serialize, deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const newJsonString = JSON.stringify({
      version: '1.0.0',
      layers: [{ id: 'default', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
      vertices: [{ id: 'v1', x: 0, y: 0 }],
      features: [{
        id: 'f1',
        featureType: 'Point',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: { type: 'Point', vertexId: 'v1' },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    });

    // 新形式 → in-memory World
    const world = deserialize(newJsonString);
    // in-memory → 再保存
    const resavedJsonString = serialize(world);
    const resaved = JSON.parse(resavedJsonString);

    // 再保存ファイルの placement に layerId が含まれない
    const resavedPlacement = resaved.features[0].anchors[0].placement;
    expect('layerId' in resavedPlacement).toBe(false);

    // 再保存ファイルが validateJsonWorld を通る
    const errors = validateJsonWorld(resaved);
    expect(errors).toEqual([]);

    // さらにこのファイルを再ロードできる（例外を投げない）
    expect(() => deserialize(resavedJsonString)).not.toThrow();
  });
});
