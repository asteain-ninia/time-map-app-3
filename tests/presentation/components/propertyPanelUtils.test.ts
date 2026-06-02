import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import {
  FeatureAnchor,
  type AnchorProperty,
  type FeatureShape,
  type PolygonStyle,
} from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Ring } from '@domain/value-objects/Ring';
import {
  buildUpdatedAnchorProperty,
  isPolygonLikeFeature,
} from '@presentation/components/propertyPanelUtils';

function makeAnchor(
  property: AnchorProperty,
  shape: FeatureShape | undefined,
  childIds: readonly string[] = []
): FeatureAnchor {
  return new FeatureAnchor(
    'anchor-1',
    { start: new TimePoint(100) },
    property,
    shape,
    { parentId: null, childIds, isTopLevel: true }
  );
}

const polygonShape: FeatureShape = {
  type: 'Polygon',
  rings: [new Ring('r1', ['v1', 'v2', 'v3'], 'territory', null)],
};

/** 末端ポリゴン地物（shape あり / 子なし） */
function leafPolygon(property: AnchorProperty): Feature {
  return new Feature('leaf', 'Polygon', [makeAnchor(property, polygonShape)]);
}

/** 集約地物コンテナ（shape なし / 子あり） */
function container(property: AnchorProperty): Feature {
  return new Feature('container', 'Polygon', [makeAnchor(property, undefined, ['child-a', 'child-b'])]);
}

/** 点情報地物 */
function pointFeature(property: AnchorProperty): Feature {
  return new Feature('point', 'Point', [makeAnchor(property, { type: 'Point', vertexId: 'v1' })]);
}

/** 線情報地物 */
function lineFeature(property: AnchorProperty): Feature {
  return new Feature('line', 'Line', [
    makeAnchor(property, { type: 'LineString', vertexIds: ['v1', 'v2'] }),
  ]);
}

const baseProperty: AnchorProperty = { name: '旧名', description: '旧説明' };

const formStyle: PolygonStyle = {
  fillColor: '#112233',
  selectedFillColor: '#445566',
  autoColor: true,
  palette: 'custom',
};

describe('isPolygonLikeFeature', () => {
  it('末端ポリゴン地物は面情報と判定する', () => {
    expect(isPolygonLikeFeature(leafPolygon(baseProperty))).toBe(true);
  });

  it('集約地物コンテナ（shape なし）も面情報と判定する', () => {
    expect(isPolygonLikeFeature(container(baseProperty))).toBe(true);
  });

  it('点情報・線情報は面情報ではない', () => {
    expect(isPolygonLikeFeature(pointFeature(baseProperty))).toBe(false);
    expect(isPolygonLikeFeature(lineFeature(baseProperty))).toBe(false);
  });

  it('null は面情報ではない', () => {
    expect(isPolygonLikeFeature(null)).toBe(false);
  });
});

describe('buildUpdatedAnchorProperty', () => {
  it('名前と説明はどの地物種別でも反映する', () => {
    const feature = pointFeature(baseProperty);
    const result = buildUpdatedAnchorProperty(feature, feature.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(result.name).toBe('新名');
    expect(result.description).toBe('新説明');
  });

  it('末端ポリゴン地物ではフォームの面スタイルを採用する', () => {
    const feature = leafPolygon(baseProperty);
    const result = buildUpdatedAnchorProperty(feature, feature.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(result.style).toEqual(formStyle);
  });

  it('集約地物コンテナでもフォームの面スタイルを採用する', () => {
    const feature = container(baseProperty);
    const result = buildUpdatedAnchorProperty(feature, feature.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(result.style).toEqual(formStyle);
  });

  it('点情報・線情報ではフォームの面スタイルを採用せず既存 style を保持する', () => {
    const point = pointFeature(baseProperty);
    const pointResult = buildUpdatedAnchorProperty(point, point.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(pointResult.style).toBeUndefined();

    const line = lineFeature(baseProperty);
    const lineResult = buildUpdatedAnchorProperty(line, line.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(lineResult.style).toBeUndefined();
  });

  it('既存プロパティの他フィールド（kind 等）は保持する', () => {
    const feature = container({ ...baseProperty, kind: '連邦' });
    const result = buildUpdatedAnchorProperty(feature, feature.anchors[0], {
      name: '新名',
      description: '新説明',
      style: formStyle,
    });
    expect(result.kind).toBe('連邦');
  });
});
