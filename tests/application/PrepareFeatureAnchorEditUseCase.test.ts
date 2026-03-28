import { describe, it, expect, beforeEach } from 'vitest';
import { PrepareFeatureAnchorEditUseCase, PrepareError } from '@application/PrepareFeatureAnchorEditUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('PrepareFeatureAnchorEditUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let prepare: PrepareFeatureAnchorEditUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    prepare = new PrepareFeatureAnchorEditUseCase(addFeature);
  });

  describe('prepare', () => {
    it('プロパティのみの編集案を生成できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time, 'original');

      const result = prepare.prepare(feature.id, 'property_only', time, {
        property: { name: '新名称', description: '説明' },
      });

      expect(result.draftId).toBeTruthy();
      expect(result.status).toBe('ready_to_commit');
      expect(result.candidateAnchors).toHaveLength(1);
      expect(result.candidateAnchors[0].property.name).toBe('新名称');
    });

    it('形状付き編集案を生成できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const result = prepare.prepare(feature.id, 'shape_and_property', time, {
        shape: { type: 'Point', vertexId: 'v-new' },
        property: { name: '移動後', description: '' },
      });

      expect(result.status).toBe('ready_to_commit');
      expect(result.candidateAnchors[0].shape).toEqual({ type: 'Point', vertexId: 'v-new' });
    });

    it('property_only モードでは形状変更を無視する', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const originalShape = feature.anchors[0].shape;

      const result = prepare.prepare(feature.id, 'property_only', time, {
        shape: { type: 'Point', vertexId: 'v-new' },
        property: { name: '変更', description: '' },
      });

      expect(result.candidateAnchors[0].shape).toEqual(originalShape);
    });

    it('配置の更新を適用できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const result = prepare.prepare(feature.id, 'property_only', time, {
        placement: { layerId: 'l2' },
      });

      expect(result.candidateAnchors[0].placement.layerId).toBe('l2');
    });

    it('境界編集を適用できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchorId = feature.anchors[0].id;

      const result = prepare.prepare(feature.id, 'property_only', time, {
        boundaryEdit: {
          targetAnchorId: anchorId,
          newEnd: new TimePoint(2100),
        },
      });

      expect(result.candidateAnchors[0].timeRange.end?.year).toBe(2100);
    });

    it('存在しない地物はエラー', () => {
      expect(() =>
        prepare.prepare('nonexistent', 'property_only', time, {})
      ).toThrow(PrepareError);
    });

    it('draftIdがユニークである', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const r1 = prepare.prepare(feature.id, 'property_only', time, {});
      const r2 = prepare.prepare(feature.id, 'property_only', time, {});

      expect(r1.draftId).not.toBe(r2.draftId);
    });

    it('affectedTimeRange を正しく計算する', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const result = prepare.prepare(feature.id, 'property_only', time, {});

      expect(result.affectedTimeRange.start.year).toBe(2000);
    });
  });

  describe('getDraft', () => {
    it('準備したドラフトを取得できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = prepare.prepare(feature.id, 'property_only', time, {});

      const draft = prepare.getDraft(result.draftId);
      expect(draft).toBeDefined();
      expect(draft!.featureId).toBe(feature.id);
    });

    it('存在しないdraftIdはundefined', () => {
      expect(prepare.getDraft('nonexistent')).toBeUndefined();
    });
  });

  describe('discardDraft', () => {
    it('ドラフトを破棄できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = prepare.prepare(feature.id, 'property_only', time, {});

      prepare.discardDraft(result.draftId);
      expect(prepare.getDraft(result.draftId)).toBeUndefined();
    });
  });

  describe('ポリゴン競合検出', () => {
    it('重なるポリゴンがあると競合を検出する', () => {
      // 2つの重なるポリゴンを作成
      addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time, 'poly1'
      );
      const poly2 = addFeature.addPolygon(
        [new Coordinate(5, 0), new Coordinate(15, 0), new Coordinate(15, 10)],
        'l1', time, 'poly2'
      );

      const result = prepare.prepare(poly2.id, 'property_only', time, {});

      expect(result.status).toBe('requires_resolution');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].featureIdA).toBe(poly2.id);
    });

    it('ポイント地物は競合なし', () => {
      const point = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const result = prepare.prepare(point.id, 'property_only', time, {});

      expect(result.conflicts).toHaveLength(0);
      expect(result.status).toBe('ready_to_commit');
    });
  });
});
