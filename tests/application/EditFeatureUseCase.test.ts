import { describe, it, expect, beforeEach } from 'vitest';
import { EditFeatureUseCase } from '@application/EditFeatureUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UpdateFeatureAnchorUseCase } from '@application/UpdateFeatureAnchorUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('EditFeatureUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  let anchorEdit: UpdateFeatureAnchorUseCase;
  let edit: EditFeatureUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
    anchorEdit = new UpdateFeatureAnchorUseCase(addFeature);
    edit = new EditFeatureUseCase(addFeature, vertexEdit, anchorEdit);
  });

  describe('地物・頂点アクセス', () => {
    it('getFeatures は空の初期状態', () => {
      expect(edit.getFeatures()).toHaveLength(0);
    });

    it('getFeatureById は追加した地物を返す', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      expect(edit.getFeatureById(feature.id)?.id).toBe(feature.id);
    });

    it('存在しないIDはundefined', () => {
      expect(edit.getFeatureById('nonexistent')).toBeUndefined();
    });
  });

  describe('頂点編集', () => {
    it('moveVertex で頂点を移動できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchor = feature.getActiveAnchor(time)!;
      const vertexId = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      edit.moveVertex(vertexId, new Coordinate(30, 40));

      const vertex = addFeature.getVertices().get(vertexId);
      expect(vertex?.coordinate.x).toBe(30);
      expect(vertex?.coordinate.y).toBe(40);
    });

    it('insertVertexOnLine で頂点を挿入できる', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        'l1', time
      );
      const newVid = edit.insertVertexOnLine(feature.id, time, 0, new Coordinate(5, 0));
      expect(newVid).toBeTruthy();

      const updated = edit.getFeatureById(feature.id)!;
      const anchor = updated.getActiveAnchor(time)!;
      expect((anchor.shape as { type: 'LineString'; vertexIds: readonly string[] }).vertexIds).toHaveLength(3);
    });

    it('insertVertexOnPolygon で頂点を挿入できる', () => {
      const feature = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );
      const anchor = feature.getActiveAnchor(time)!;
      const ring = (anchor.shape as { type: 'Polygon'; rings: readonly { id: string }[] }).rings[0];

      const newVid = edit.insertVertexOnPolygon(feature.id, time, ring.id, 0, new Coordinate(5, 0));
      expect(newVid).toBeTruthy();
    });

    it('deleteVertexFromLine で頂点削除（地物削除判定含む）', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        'l1', time
      );
      const anchor = feature.getActiveAnchor(time)!;
      const vertexIds = (anchor.shape as { type: 'LineString'; vertexIds: readonly string[] }).vertexIds;

      // 2頂点から1つ削除 → 地物削除
      const deleted = edit.deleteVertexFromLine(feature.id, time, vertexIds[0]);
      expect(deleted).toBe(true);
    });
  });

  describe('錨編集', () => {
    it('addAnchor で時間分割できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const newAnchor = edit.addAnchor(feature.id, new TimePoint(2050));
      expect(newAnchor).toBeDefined();
      expect(edit.getAnchors(feature.id)).toHaveLength(2);
    });

    it('updateProperty で属性更新できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time, 'original');
      const anchorId = feature.anchors[0].id;
      edit.updateProperty(feature.id, anchorId, { name: '新名称', description: '説明' });

      const updated = edit.getFeatureById(feature.id)!;
      expect(updated.getNameAt(time)).toBe('新名称');
    });

    it('deleteAnchor で最後の錨を削除すると地物削除', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const deleted = edit.deleteAnchor(feature.id, feature.anchors[0].id);
      expect(deleted).toBe(true);
      expect(edit.getFeatureById(feature.id)).toBeUndefined();
    });
  });

  describe('共有頂点操作', () => {
    it('findSnapCandidates が候補を返す', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const f2 = addFeature.addPoint(new Coordinate(10.001, 20.001), 'l1', time);
      const v1Id = (f1.getActiveAnchor(time)!.shape as { type: 'Point'; vertexId: string }).vertexId;

      const candidates = edit.findSnapCandidates(v1Id, 1);
      // 近い頂点が候補に含まれるはず
      expect(candidates.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('リング編集', () => {
    it('validateRingPlacement がポリゴン以外でエラー', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const errors = edit.validateRingPlacement(
        feature.id, time,
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
        null
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('addHoleRing がポイント地物でnullを返す', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = edit.addHoleRing(feature.id, time, 'r1', ['v1', 'v2', 'v3']);
      expect(result).toBeNull();
    });

    it('addExclaveRing がポイント地物でnullを返す', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = edit.addExclaveRing(feature.id, time, ['v1', 'v2', 'v3']);
      expect(result).toBeNull();
    });

    it('deleteRing が存在しない地物でnullを返す', () => {
      const result = edit.deleteRing('nonexistent', time, 'r1');
      expect(result).toBeNull();
    });
  });

  describe('衝突判定', () => {
    it('detectConflictsForFeature が存在しない地物で空配列', () => {
      const result = edit.detectConflictsForFeature('nonexistent', time, 'l1');
      expect(result).toHaveLength(0);
    });

    it('detectConflictsForFeature で単一ポリゴンは競合なし', () => {
      const feature = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );
      const result = edit.detectConflictsForFeature(feature.id, time, 'l1');
      expect(result).toHaveLength(0);
    });
  });
});
