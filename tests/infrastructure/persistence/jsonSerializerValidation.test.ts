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

/**
 * Phase 2-D-7c-1 で `jsonSerializerMigration.ts` から旧形式変換ロジック（anchors 欠落の
 * 単一地物変換、`shape.type: 'Line'` → `'LineString'` 変換、`ringType` 推測、`timeRange` /
 * `property` 直下 fallback など）を撤去した。`resolveVersion` で旧バージョン（0.x / version 欠落）は
 * 先に拒否されるため migration 経路には到達しないが、`version: '1.0.0'` のまま旧構造を含む
 * 入力（手編集 JSON / 外部生成 JSON）は migration 内部で `SerializationError` 即拒否となる。
 *
 * 開発ガイド §6.4.15「永続化 shim は read / write / validate / round-trip test を
 * 同じ変更単位で同期する」に従い、削除した分岐の拒否挙動を直接固定する。
 */
describe('v1.0.0 旧構造の拒否 (Phase 2-D-7c-1)', () => {
  function baseV1Payload(): Record<string, unknown> {
    return {
      version: '1.0.0',
      layers: [{ id: 'l1', name: 'L1', order: 0, visible: true, opacity: 1.0 }],
      vertices: [
        { id: 'v1', x: 0, y: 0 },
        { id: 'v2', x: 10, y: 0 },
        { id: 'v3', x: 0, y: 10 },
      ],
      sharedVertexGroups: [],
      timelineMarkers: [],
      metadata: DEFAULT_METADATA,
    };
  }

  it('features[].anchors 欠落（旧形式の単一地物構造）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Point',
        // anchors フィールド自体を欠落させる（旧 normalizeLegacyFeatureAnchor の入力経路）
        timeRange: { start: { year: 100 } },
        property: { name: 'test', description: '' },
        shape: { type: 'Point', vertexId: 'v1' },
        placement: { parentId: null, childIds: [], isTopLevel: true },
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    expect(() => deserialize(payload)).toThrow('features[0].anchors must be an array');
  });

  it('shape.type: "Line"（旧形式の shape タイプ表記）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Line',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          // 旧形式の shape.type: 'Line'。新形式は 'LineString'
          shape: { type: 'Line', vertexIds: ['v1', 'v2'] },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    // 新コードの normalizeShape は shape.type === 'Line' をそのまま { type: 'Line' } として返し、
    // 後段の validateShapePresence で featureType: 'Line' に対応する 'LineString' との不整合として拒否される
    // （migration sweep 後に shape.type 検証が validation 側で動いていることを明示）
    expect(() => deserialize(payload)).toThrow('shape.type "Line" does not match featureType "Line"');
  });

  it('Polygon リングの ringType 欠落（旧形式の位置依存推測）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Polygon',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          shape: {
            type: 'Polygon',
            rings: [{
              id: 'r1',
              vertexIds: ['v1', 'v2', 'v3'],
              // ringType フィールド欠落
              parentId: null,
            }],
          },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
    expect(() => deserialize(payload)).toThrow('ringType');
  });

  // 旧 normalizeTimeRange は anchor.timeRange が無いとき、地物・錨直下の `time` /
  // `startYear` / `endYear` フィールドへフォールバックしていた。これらは Phase 2-D-7c-1 で
  // 全削除済み。各バリアント（timeRange 欠落のみ / 旧 time フィールド存在 / 旧 startYear 存在）
  // を直接押さえる。
  describe('anchor の timeRange / 旧 time / 旧 startYear（旧形式の時間 fallback）', () => {
    function payloadWithTimeOverride(timeFields: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            ...timeFields,
            property: { name: 'test', description: '' },
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('timeRange フィールド欠落のみは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({});

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });

    it('旧形式 time フィールド（timeRange なし + time: { year } 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({ time: { year: 100 } });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });

    it('旧形式 startYear / endYear フィールド（timeRange なし + startYear/endYear 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithTimeOverride({ startYear: 1200, endYear: 1500 });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('timeRange');
    });
  });

  // 旧 normalizeAnchorProperty は anchor.property が無いとき、地物直下の `properties[0]`
  // 配列の先頭要素へフォールバックしていた。Phase 2-D-7c-1 で削除済み。
  describe('anchor の property / 旧 properties[0] 配列（旧形式の property fallback）', () => {
    function payloadWithPropertyOverride(extra: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType: 'Point',
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            ...extra,
            shape: { type: 'Point', vertexId: 'v1' },
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('property フィールド欠落のみは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithPropertyOverride({});

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('property');
    });

    it('旧形式 properties[0] 配列（property なし + properties: [{ name }] 直書き）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithPropertyOverride({
        properties: [{ name: 'legacy-name', description: 'legacy-desc' }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('property');
    });
  });

  // 旧 normalizeFeatureType は `'LineString'` / `'point'` / `'line'` / `'polygon'` を
  // 新形式の PascalCase へ補正していた。Phase 2-D-7c-1 で削除済み。
  describe('featureType の旧形式表記（LineString / 小文字）', () => {
    function payloadWithFeatureType(featureType: string, shape: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType,
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            shape,
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('featureType: "LineString" は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('LineString', { type: 'LineString', vertexIds: ['v1', 'v2'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: LineString');
    });

    it('featureType: "point" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('point', { type: 'Point', vertexId: 'v1' });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: point');
    });

    it('featureType: "line" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('line', { type: 'LineString', vertexIds: ['v1', 'v2'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: line');
    });

    it('featureType: "polygon" （小文字）は SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithFeatureType('polygon', {
        type: 'Polygon',
        rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('Unknown feature type: polygon');
    });
  });

  // 旧 hasShapeSource は anchor.shape が無くても、anchor 直下の `vertexIds` / `rings` /
  // `vertexId` を「shape 直書き」として認識し、`normalizeShape(shape=undefined, fallbackSource=record)`
  // で fallbackSource からリングや頂点を読みに行く経路を持っていた。Phase 2-D-7c-1 で削除済み。
  describe('anchor 直下の旧形式 shape 表現（shape 欠落 + 直下 vertexIds / rings / vertexId）', () => {
    function payloadWithAnchorShapeFields(featureType: string, anchorShapeFields: Record<string, unknown>): string {
      return JSON.stringify({
        ...baseV1Payload(),
        features: [{
          id: 'f1',
          featureType,
          anchors: [{
            id: 'a1',
            timeRange: { start: { year: 100 } },
            property: { name: 'test', description: '' },
            // shape フィールド自体は欠落させ、旧形式の anchor 直下フィールドで形状を表現
            ...anchorShapeFields,
            placement: { parentId: null, childIds: [], isTopLevel: true },
          }],
        }],
      });
    }

    it('Polygon + anchor 直下 vertexIds 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Polygon', { vertexIds: ['v1', 'v2', 'v3'] });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      // shape 欠落 + childIds 空 → 「is not a container」エラー
      expect(() => deserialize(payload)).toThrow('has no shape but is not a container');
    });

    it('Polygon + anchor 直下 rings 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Polygon', {
        rings: [{ id: 'r1', vertexIds: ['v1', 'v2', 'v3'], ringType: 'territory', parentId: null }],
      });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      expect(() => deserialize(payload)).toThrow('has no shape but is not a container');
    });

    it('Point + anchor 直下 vertexId 直書きは SerializationError で拒否される', async () => {
      const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
      const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
      const payload = payloadWithAnchorShapeFields('Point', { vertexId: 'v1' });

      expect(() => deserialize(payload)).toThrow(SerializationError);
      // shape 欠落 + Point → 「requires a shape」エラー
      expect(() => deserialize(payload)).toThrow('requires a shape');
    });
  });

  it('Polygon の vertexIds 直下指定（旧形式の領土リング直書き、shape 内）は SerializationError で拒否される', async () => {
    const { deserialize } = await import('@infrastructure/persistence/JSONSerializer');
    const { SerializationError } = await import('@infrastructure/persistence/jsonSerializerErrors');
    const payload = JSON.stringify({
      ...baseV1Payload(),
      features: [{
        id: 'f1',
        featureType: 'Polygon',
        anchors: [{
          id: 'a1',
          timeRange: { start: { year: 100 } },
          property: { name: 'test', description: '' },
          // 旧形式: shape.rings ではなく shape.vertexIds で領土リングを直書き
          // 新コードでは shape.rings 配列が無いため normalizeShape は空 Polygon（{ type: 'Polygon' }、
          // rings undefined）を返し、後段の validation で領土リング欠落として拒否される
          shape: { type: 'Polygon', vertexIds: ['v1', 'v2', 'v3'] },
          placement: { parentId: null, childIds: [], isTopLevel: true },
        }],
      }],
    });

    expect(() => deserialize(payload)).toThrow(SerializationError);
  });
});
