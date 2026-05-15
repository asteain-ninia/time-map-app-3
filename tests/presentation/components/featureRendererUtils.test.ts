import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { TimePoint } from '@domain/value-objects/TimePoint';
import type {
  AnchorPlacement,
  AnchorProperty,
  FeatureShape,
} from '@domain/value-objects/FeatureAnchor';
import { collectActiveFeatureEntries } from '@presentation/components/featureRendererUtils';

const property: AnchorProperty = { name: '地物', description: '' };

function placement(layerId: string, parentId: string | null = null, childIds: readonly string[] = []): AnchorPlacement {
  return { layerId, parentId, childIds, isTopLevel: parentId === null };
}

function pointShape(vertexId: string): FeatureShape {
  return { type: 'Point', vertexId };
}

function polygonShape(vertexIds: readonly string[]): FeatureShape {
  return {
    type: 'Polygon',
    rings: [{ type: 'territory', vertexIds: [...vertexIds] }],
  };
}

function makeAnchor(
  anchorId: string,
  start: number,
  end: number,
  shape: FeatureShape | undefined,
  layerId: string,
  options: { parentId?: string | null; childIds?: readonly string[] } = {}
): FeatureAnchor {
  return new FeatureAnchor(
    anchorId,
    { start: new TimePoint(start), end: new TimePoint(end) },
    property,
    shape,
    placement(layerId, options.parentId ?? null, options.childIds ?? [])
  );
}

describe('collectActiveFeatureEntries', () => {
  it('単一レイヤー: アクティブ錨を持つ全地物に地図全体連番を割り当てる', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'l1')]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'), 'l1')]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'), 'l1')]),
    ];

    const entries = collectActiveFeatureEntries(features, new TimePoint(1500), new Set(['l1']));

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f2', 'f3']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1, 2]);
  });

  it('非表示レイヤー所属の地物は除外し、featureIndex を詰める', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'visible')]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'), 'hidden')]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'), 'visible')]),
    ];

    const entries = collectActiveFeatureEntries(features, new TimePoint(1500), new Set(['visible']));

    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f3']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1]);
  });

  it('多レイヤー: featureIndex は地図全体（複数レイヤー横断）で連番割当される', () => {
    // Phase 2-D-5 の振る舞い変更を固定するテスト:
    // 旧仕様では「レイヤー l1 内 0, 1」「レイヤー l2 内 0, 1」のように layer 別連番だったが、
    // 新仕様では地図全体で 0, 1, 2, 3 の連番。Point / LineString の自動色割当に直接影響する。
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'l1')]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'), 'l2')]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'), 'l1')]),
      new Feature('f4', 'Point', [makeAnchor('a4', 1000, 2000, pointShape('v4'), 'l2')]),
    ];

    const entries = collectActiveFeatureEntries(
      features,
      new TimePoint(1500),
      new Set(['l1', 'l2'])
    );

    expect(entries.map((e) => e.feature.id)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(entries.map((e) => e.featureIndex)).toEqual([0, 1, 2, 3]);
  });

  it('shape を持たない錨（コンテナ）は除外する', () => {
    const features = [
      new Feature('leaf', 'Polygon', [
        makeAnchor('a1', 1000, 2000, polygonShape(['v1', 'v2', 'v3']), 'l1'),
      ]),
      new Feature('container', 'Polygon', [
        makeAnchor('a2', 1000, 2000, undefined, 'l1', { childIds: ['leaf'] }),
      ]),
    ];

    const entries = collectActiveFeatureEntries(features, new TimePoint(1500), new Set(['l1']));

    expect(entries.map((e) => e.feature.id)).toEqual(['leaf']);
  });

  it('現在時刻にアクティブ錨が無い地物は除外する', () => {
    const features = [
      // 1000..2000 に存在
      new Feature('past', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'l1')]),
      // 3000..4000 に存在
      new Feature('future', 'Point', [makeAnchor('a2', 3000, 4000, pointShape('v2'), 'l1')]),
      // 1000..4000 に存在
      new Feature('always', 'Point', [makeAnchor('a3', 1000, 4000, pointShape('v3'), 'l1')]),
    ];

    const entries = collectActiveFeatureEntries(features, new TimePoint(2500), new Set(['l1']));

    expect(entries.map((e) => e.feature.id)).toEqual(['always']);
    expect(entries[0].featureIndex).toBe(0);
  });

  it('features 空配列なら空エントリ列を返す', () => {
    expect(
      collectActiveFeatureEntries([], new TimePoint(1500), new Set(['l1']))
    ).toEqual([]);
  });

  it('visibleLayerIds が空なら全地物が除外される', () => {
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'l1')]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'), 'l2')]),
    ];

    expect(
      collectActiveFeatureEntries(features, new TimePoint(1500), new Set())
    ).toEqual([]);
  });

  it('入力順を保持する（feature 配列順 ≠ レイヤー順でも連番は入力順）', () => {
    // l1, l2, l1, l2 の混在順 → 出力も l1, l2, l1, l2 の順 + featureIndex 0..3
    const features = [
      new Feature('f1', 'Point', [makeAnchor('a1', 1000, 2000, pointShape('v1'), 'l1')]),
      new Feature('f2', 'Point', [makeAnchor('a2', 1000, 2000, pointShape('v2'), 'l2')]),
      new Feature('f3', 'Point', [makeAnchor('a3', 1000, 2000, pointShape('v3'), 'l1')]),
      new Feature('f4', 'Point', [makeAnchor('a4', 1000, 2000, pointShape('v4'), 'l2')]),
    ];

    const entries = collectActiveFeatureEntries(
      features,
      new TimePoint(1500),
      new Set(['l1', 'l2'])
    );

    expect(entries.map((e) => e.anchor.placement.layerId)).toEqual(['l1', 'l2', 'l1', 'l2']);
  });
});
