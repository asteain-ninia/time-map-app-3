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
  buildAnchorFormValues,
  buildUpdatedAnchorProperty,
  isPolygonLikeFeature,
  DEFAULT_FILL_COLOR,
  DEFAULT_SELECTED_FILL_COLOR,
} from '@presentation/components/propertyPanelUtils';
import { DEFAULT_PALETTE_NAME } from '@infrastructure/StyleResolver';

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

describe('buildAnchorFormValues', () => {
  it('style 設定済みの錨はその値をそのまま返す', () => {
    const anchor = makeAnchor({ name: '名', description: '説明', style: formStyle }, polygonShape);
    expect(buildAnchorFormValues(anchor)).toEqual({
      name: '名',
      description: '説明',
      fillColor: formStyle.fillColor,
      selectedFillColor: formStyle.selectedFillColor,
      autoColor: formStyle.autoColor,
      palette: formStyle.palette,
    });
  });

  it('style 未設定の錨は既定値を充てる', () => {
    const anchor = makeAnchor(baseProperty, polygonShape);
    expect(buildAnchorFormValues(anchor)).toEqual({
      name: '旧名',
      description: '旧説明',
      fillColor: DEFAULT_FILL_COLOR,
      selectedFillColor: DEFAULT_SELECTED_FILL_COLOR,
      autoColor: false,
      palette: DEFAULT_PALETTE_NAME,
    });
  });

  it('no-op 判定: 未変更フォーム（baseline 自身）から構築した property は baseline と全フィールド一致する', () => {
    // applyChanges の guard は「現在のフォーム値 === buildAnchorFormValues(anchor)」を no-op とみなす。
    // baseline をそのままフォーム値として渡しても変化が出ないこと（guard が成立すること）を固定する。
    const anchor = makeAnchor(baseProperty, polygonShape);
    const baseline = buildAnchorFormValues(anchor);
    const feature = leafPolygon(baseProperty);
    const rebuilt = buildUpdatedAnchorProperty(feature, anchor, {
      name: baseline.name,
      description: baseline.description,
      style: {
        fillColor: baseline.fillColor,
        selectedFillColor: baseline.selectedFillColor,
        autoColor: baseline.autoColor,
        palette: baseline.palette,
      },
    });
    const rebuiltForm = buildAnchorFormValues(
      anchor.withProperty(rebuilt)
    );
    expect(rebuiltForm).toEqual(baseline);
  });
});
