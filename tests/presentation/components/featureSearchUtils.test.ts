import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  buildFeatureSearchItems,
  filterFeatureSearchItems,
  getHighlightSegments,
  tokenizeFeatureSearch,
} from '@presentation/components/featureSearchUtils';

function makeFeature(
  id: string,
  startYear: number,
  property: {
    name: string;
    description: string;
    attributes?: Record<string, unknown>;
  }
): Feature {
  return new Feature(
    id,
    'Point',
    [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(startYear) },
        property,
        { type: 'Point', vertexId: `${id}-vertex` },
        { layerId: 'layer-1', parentId: null, childIds: [], isTopLevel: true }
      ),
    ]
  );
}

describe('featureSearchUtils', () => {
  it('現在時点のアンカーから検索対象を組み立てる', () => {
    const items = buildFeatureSearchItems(
      [
        makeFeature('feature-1', 100, {
          name: 'Alpha City',
          description: 'Harbor capital',
          attributes: { ruler: 'Aster', population: 12_000 },
        }),
      ],
      new TimePoint(120)
    );

    expect(items).toEqual([
      {
        id: 'feature-1',
        featureType: 'Point',
        displayName: 'Alpha City',
        description: 'Harbor capital',
        attributeSummary: 'ruler: Aster / population: 12000',
        isActiveAtCurrentTime: true,
      },
    ]);
  });

  it('currentTimeを渡さない場合は現在時点未解決として扱う', () => {
    const items = buildFeatureSearchItems([
      makeFeature('feature-1', 100, {
        name: 'Alpha City',
        description: 'Harbor capital',
      }),
    ]);

    expect(items).toEqual([
      {
        id: 'feature-1',
        featureType: 'Point',
        displayName: 'feature-1',
        description: '',
        attributeSummary: '',
        isActiveAtCurrentTime: false,
      },
    ]);
  });

  it('IDと名前と説明と属性値で地物を絞り込める', () => {
    const items = buildFeatureSearchItems(
      [
        makeFeature('feature-1', 100, {
          name: 'Alpha City',
          description: 'Harbor capital',
          attributes: { ruler: 'Aster' },
        }),
        makeFeature('feature-2', 100, {
          name: 'Beta Fort',
          description: 'Mountain border',
          attributes: { ruler: 'Beryl' },
        }),
      ],
      new TimePoint(120)
    );

    expect(filterFeatureSearchItems(items, 'alpha')).toHaveLength(1);
    expect(filterFeatureSearchItems(items, 'harbor')).toHaveLength(1);
    expect(filterFeatureSearchItems(items, 'aster')).toHaveLength(1);
    expect(filterFeatureSearchItems(items, 'feature-2')).toHaveLength(1);
  });

  it('空白区切りの複数語はAND条件で扱う', () => {
    const items = buildFeatureSearchItems(
      [
        makeFeature('feature-1', 100, {
          name: 'Alpha City',
          description: 'Harbor capital',
        }),
        makeFeature('feature-2', 100, {
          name: 'Alpha Fort',
          description: 'Harbor frontier',
        }),
      ],
      new TimePoint(120)
    );

    expect(tokenizeFeatureSearch('  alpha   harbor  alpha ')).toEqual(['alpha', 'harbor']);
    expect(filterFeatureSearchItems(items, 'alpha capital')).toEqual([items[0]]);
  });

  it('一致箇所をマージしてハイライト区間へ分解する', () => {
    expect(getHighlightSegments('Alpha Harbor', 'ha al')).toEqual([
      { text: 'Al', match: true },
      { text: 'p', match: false },
      { text: 'ha', match: true },
      { text: ' ', match: false },
      { text: 'Ha', match: true },
      { text: 'rbor', match: false },
    ]);
  });

  it('空文字列はハイライト区間を返さない', () => {
    expect(getHighlightSegments('', 'alpha')).toEqual([]);
  });

  it('属性値の配列・オブジェクト・null・booleanを検索対象へ文字列化する', () => {
    const items = buildFeatureSearchItems(
      [
        makeFeature('feature-1', 100, {
          name: 'Alpha City',
          description: 'Harbor capital',
          attributes: {
            flags: [true, false],
            meta: { region: 'north' },
            empty: null,
            coastal: true,
          },
        }),
      ],
      new TimePoint(120)
    );

    expect(items[0].attributeSummary).toBe(
      'flags: true, false / meta: {"region":"north"} / empty: null / coastal: true'
    );
  });
});
