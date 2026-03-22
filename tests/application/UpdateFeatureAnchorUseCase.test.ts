import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UpdateFeatureAnchorUseCase, AnchorEditError } from '@application/UpdateFeatureAnchorUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { eventBus } from '@application/EventBus';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('UpdateFeatureAnchorUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let anchorEdit: UpdateFeatureAnchorUseCase;
  const layerId = 'l1';

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    anchorEdit = new UpdateFeatureAnchorUseCase(addFeature);
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('addAnchor', () => {
    it('アクティブな錨を分割して新しい錨を作成できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      const newAnchor = anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors).toHaveLength(2);

      // 最初の錨の終了時刻が分割時刻に設定される
      expect(updated.anchors[0].timeRange.end!.year).toBe(1500);

      // 新しい錨の開始時刻が分割時刻
      expect(newAnchor.timeRange.start.year).toBe(1500);
      expect(updated.anchors[1].id).toBe(newAnchor.id);
    });

    it('分割された錨は元の錨の状態をコピーする', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000),
        '城'
      );

      const newAnchor = anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      expect(newAnchor.property.name).toBe('城');
      expect(newAnchor.shape.type).toBe('Point');
      expect(newAnchor.placement.layerId).toBe(layerId);
    });

    it('元の錨に終了時刻がある場合、新しい錨に引き継がれる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      // 終了時刻を設定
      anchorEdit.updateTimeRange(feature.id, feature.anchors[0].id, {
        start: new TimePoint(1000),
        end: new TimePoint(2000),
      });

      const newAnchor = anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      expect(newAnchor.timeRange.end!.year).toBe(2000);
    });

    it('分割時刻が既存錨の開始時刻と同じだとエラー', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      expect(() => {
        anchorEdit.addAnchor(feature.id, new TimePoint(1000));
      }).toThrow('already starts at time');
    });

    it('アクティブな錨がない時刻だとエラー', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      // 終了時刻を設定して範囲を制限
      anchorEdit.updateTimeRange(feature.id, feature.anchors[0].id, {
        start: new TimePoint(1000),
        end: new TimePoint(1500),
      });

      expect(() => {
        anchorEdit.addAnchor(feature.id, new TimePoint(2000));
      }).toThrow('No active anchor');
    });

    it('存在しない地物でエラー', () => {
      expect(() => {
        anchorEdit.addAnchor('nonexistent', new TimePoint(1000));
      }).toThrow(AnchorEditError);
    });

    it('3回分割して4つの錨を持てる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      anchorEdit.addAnchor(feature.id, new TimePoint(1200));
      anchorEdit.addAnchor(feature.id, new TimePoint(1500));
      anchorEdit.addAnchor(feature.id, new TimePoint(1800));

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors).toHaveLength(4);
      expect(updated.anchors[0].timeRange.start.year).toBe(1000);
      expect(updated.anchors[0].timeRange.end!.year).toBe(1200);
      expect(updated.anchors[1].timeRange.start.year).toBe(1200);
      expect(updated.anchors[1].timeRange.end!.year).toBe(1500);
      expect(updated.anchors[2].timeRange.start.year).toBe(1500);
      expect(updated.anchors[2].timeRange.end!.year).toBe(1800);
      expect(updated.anchors[3].timeRange.start.year).toBe(1800);
    });
  });

  describe('updateProperty', () => {
    it('錨のプロパティを更新できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000),
        '旧名'
      );
      const anchorId = feature.anchors[0].id;

      anchorEdit.updateProperty(feature.id, anchorId, {
        name: '新名',
        description: '説明追加',
      });

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors[0].property.name).toBe('新名');
      expect(updated.anchors[0].property.description).toBe('説明追加');
    });

    it('存在しない錨でエラー', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      expect(() => {
        anchorEdit.updateProperty(feature.id, 'nonexistent', {
          name: 'test',
          description: '',
        });
      }).toThrow('not found');
    });
  });

  describe('updateTimeRange', () => {
    it('錨の時間範囲を更新できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      const anchorId = feature.anchors[0].id;

      anchorEdit.updateTimeRange(feature.id, anchorId, {
        start: new TimePoint(500),
        end: new TimePoint(2000),
      });

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors[0].timeRange.start.year).toBe(500);
      expect(updated.anchors[0].timeRange.end!.year).toBe(2000);
    });

    it('終了時刻が開始時刻より前だとエラー', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      const anchorId = feature.anchors[0].id;

      expect(() => {
        anchorEdit.updateTimeRange(feature.id, anchorId, {
          start: new TimePoint(2000),
          end: new TimePoint(1000),
        });
      }).toThrow('End time cannot be before start time');
    });
  });

  describe('updateShape', () => {
    it('錨の形状を更新できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      const anchorId = feature.anchors[0].id;

      anchorEdit.updateShape(feature.id, anchorId, {
        type: 'Point',
        vertexId: 'v-new',
      });

      const updated = addFeature.getFeatureById(feature.id)!;
      if (updated.anchors[0].shape.type === 'Point') {
        expect(updated.anchors[0].shape.vertexId).toBe('v-new');
      }
    });
  });

  describe('updatePlacement', () => {
    it('錨の配置を更新できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      const anchorId = feature.anchors[0].id;

      anchorEdit.updatePlacement(feature.id, anchorId, {
        layerId: 'l2',
        parentId: 'parent1',
        childIds: ['child1'],
      });

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors[0].placement.layerId).toBe('l2');
      expect(updated.anchors[0].placement.parentId).toBe('parent1');
      expect(updated.anchors[0].placement.childIds).toEqual(['child1']);
    });
  });

  describe('deleteAnchor', () => {
    it('錨を削除できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      // 2つ目の錨を追加
      anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors).toHaveLength(2);

      const deleted = anchorEdit.deleteAnchor(feature.id, updated.anchors[0].id);

      expect(deleted).toBe(false);
      const final = addFeature.getFeatureById(feature.id)!;
      expect(final.anchors).toHaveLength(1);
    });

    it('最後の錨を削除すると地物自体が削除される', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      const anchorId = feature.anchors[0].id;

      const deleted = anchorEdit.deleteAnchor(feature.id, anchorId);

      expect(deleted).toBe(true);
      expect(addFeature.getFeatureById(feature.id)).toBeUndefined();
    });

    it('地物削除時にfeature:removedイベントが発行される', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      let removedId: string | null = null;
      const unsub = eventBus.on('feature:removed', (e) => { removedId = e.featureId; });

      anchorEdit.deleteAnchor(feature.id, feature.anchors[0].id);

      expect(removedId).toBe(feature.id);
      unsub();
    });

    it('存在しない錨でエラー', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      expect(() => {
        anchorEdit.deleteAnchor(feature.id, 'nonexistent');
      }).toThrow('not found');
    });
  });

  describe('getAnchors', () => {
    it('地物の全錨を取得できる', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );
      anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      const anchors = anchorEdit.getAnchors(feature.id);
      expect(anchors).toHaveLength(2);
    });
  });

  describe('イベント通知', () => {
    it('錨追加時にfeature:addedイベントが発行される', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      let emitted = false;
      const unsub = eventBus.on('feature:added', () => { emitted = true; });

      anchorEdit.addAnchor(feature.id, new TimePoint(1500));

      expect(emitted).toBe(true);
      unsub();
    });

    it('プロパティ更新時にfeature:addedイベントが発行される', () => {
      const feature = addFeature.addPoint(
        new Coordinate(10, 20),
        layerId,
        new TimePoint(1000)
      );

      let emitted = false;
      const unsub = eventBus.on('feature:added', () => { emitted = true; });

      anchorEdit.updateProperty(feature.id, feature.anchors[0].id, {
        name: 'new',
        description: '',
      });

      expect(emitted).toBe(true);
      unsub();
    });
  });
});
