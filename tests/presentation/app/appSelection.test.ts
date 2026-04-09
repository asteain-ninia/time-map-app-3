import { describe, expect, it } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import {
  buildPropertyPanelSelectionState,
  collectAnchorVertexIds,
} from '@presentation/app/appSelection';

function createFeature(id: string, name: string): Feature {
  return new Feature(id, 'Polygon', [
    new FeatureAnchor(
      `${id}-anchor`,
      { start: new TimePoint(100) },
      { name, description: '' },
      {
        type: 'Polygon',
        rings: [
          new Ring(`${id}-outer`, [`${id}-v1`, `${id}-v2`, `${id}-v3`], 'territory', null),
          new Ring(`${id}-hole`, [`${id}-v4`, `${id}-v5`, `${id}-v6`], 'hole', `${id}-outer`),
        ],
      },
      { layerId: 'layer-1', parentId: null, childIds: [] }
    ),
  ]);
}

describe('appSelection', () => {
  it('複数所有者の選択状態をプロパティパネル向けに整形する', () => {
    const features = [
      createFeature('f1', '第一国'),
      createFeature('f2', '第二国'),
      createFeature('f3', '第三国'),
    ];

    const selectionState = buildPropertyPanelSelectionState(
      features,
      null,
      { kind: 'multiple', featureIds: ['f1', 'f2', 'f3'] },
      new TimePoint(150)
    );

    expect(selectionState.kind).toBe('multiple');
    expect(selectionState.featureSummaries).toEqual([
      { id: 'f1', name: '第一国' },
      { id: 'f2', name: '第二国' },
      { id: 'f3', name: '第三国' },
    ]);
    expect(selectionState.remainingCount).toBe(0);
  });

  it('アンカーから全頂点IDを収集する', () => {
    const anchor = createFeature('f1', '第一国').anchors[0];
    expect(collectAnchorVertexIds(anchor)).toEqual([
      'f1-v1',
      'f1-v2',
      'f1-v3',
      'f1-v4',
      'f1-v5',
      'f1-v6',
    ]);
  });
});
