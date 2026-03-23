import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('DeleteFeatureUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let deleteFeature: DeleteFeatureUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    deleteFeature = new DeleteFeatureUseCase(addFeature);
  });

  describe('基本削除', () => {
    it('ポイント地物を削除できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = deleteFeature.deleteFeature(feature.id);

      expect(result).not.toBeNull();
      expect(result!.deletedFeatureIds).toContain(feature.id);
      expect(addFeature.getFeatureById(feature.id)).toBeUndefined();
    });

    it('ライン地物を削除できる', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        'l1', time
      );
      const result = deleteFeature.deleteFeature(feature.id);

      expect(result).not.toBeNull();
      expect(result!.deletedFeatureIds).toContain(feature.id);
    });

    it('ポリゴン地物を削除できる', () => {
      const feature = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );
      const result = deleteFeature.deleteFeature(feature.id);

      expect(result).not.toBeNull();
      expect(result!.deletedFeatureIds).toContain(feature.id);
    });

    it('存在しない地物はnullを返す', () => {
      expect(deleteFeature.deleteFeature('nonexistent')).toBeNull();
    });
  });

  describe('頂点クリーンアップ', () => {
    it('使用されなくなった頂点を削除する', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchor = feature.getActiveAnchor(time)!;
      const vertexId = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      const result = deleteFeature.deleteFeature(feature.id);

      expect(result!.deletedVertexIds).toContain(vertexId);
      expect(addFeature.getVertices().has(vertexId)).toBe(false);
    });

    it('他の地物で使用されている頂点は削除しない', () => {
      // 2つのポイントを同じ位置に追加（異なる頂点ID）
      const f1 = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      addFeature.addPoint(new Coordinate(10, 20), 'l1', time);

      const verticesBefore = addFeature.getVertices().size;
      deleteFeature.deleteFeature(f1.id);

      // 1つの頂点のみ削除（f2の頂点は残る）
      expect(addFeature.getVertices().size).toBe(verticesBefore - 1);
    });
  });

  describe('削除結果', () => {
    it('削除されたfeatureIdを含む', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const result = deleteFeature.deleteFeature(feature.id);
      expect(result!.deletedFeatureIds).toEqual([feature.id]);
    });

    it('削除された頂点IDを含む', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        'l1', time
      );
      const result = deleteFeature.deleteFeature(feature.id);
      expect(result!.deletedVertexIds.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('親子関係の処理', () => {
    it('子を削除しても親はまだ他の子があれば存続する', () => {
      // 手動で親子関係を構成
      const parent = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(20, 0), new Coordinate(20, 20)],
        'l1', time
      );
      const child1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );
      const child2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        'l1', time
      );

      // 親子関係設定
      const featuresMap = addFeature.getFeaturesMap() as Map<string, any>;
      const parentFeature = featuresMap.get(parent.id)!;
      const parentAnchor = parentFeature.getActiveAnchor(time)!;
      const updatedParentAnchor = parentAnchor.withPlacement({
        ...parentAnchor.placement,
        childIds: [child1.id, child2.id],
      });
      featuresMap.set(parent.id, parentFeature.withAnchors([updatedParentAnchor]));

      const c1Feature = featuresMap.get(child1.id)!;
      const c1Anchor = c1Feature.getActiveAnchor(time)!;
      featuresMap.set(child1.id, c1Feature.withAnchors([
        c1Anchor.withPlacement({ ...c1Anchor.placement, parentId: parent.id }),
      ]));

      const c2Feature = featuresMap.get(child2.id)!;
      const c2Anchor = c2Feature.getActiveAnchor(time)!;
      featuresMap.set(child2.id, c2Feature.withAnchors([
        c2Anchor.withPlacement({ ...c2Anchor.placement, parentId: parent.id }),
      ]));

      // child1を削除
      deleteFeature.deleteFeature(child1.id, time);

      // 親はまだ存在（child2がいるため）
      expect(addFeature.getFeatureById(parent.id)).toBeDefined();
      // child2はまだ存在
      expect(addFeature.getFeatureById(child2.id)).toBeDefined();
    });

    it('最後の子を削除すると親も自動削除される', () => {
      const parent = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(20, 0), new Coordinate(20, 20)],
        'l1', time
      );
      const child = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );

      // 親子関係設定
      const featuresMap = addFeature.getFeaturesMap() as Map<string, any>;
      const parentFeature = featuresMap.get(parent.id)!;
      const parentAnchor = parentFeature.getActiveAnchor(time)!;
      featuresMap.set(parent.id, parentFeature.withAnchors([
        parentAnchor.withPlacement({ ...parentAnchor.placement, childIds: [child.id] }),
      ]));

      const childFeature = featuresMap.get(child.id)!;
      const childAnchor = childFeature.getActiveAnchor(time)!;
      featuresMap.set(child.id, childFeature.withAnchors([
        childAnchor.withPlacement({ ...childAnchor.placement, parentId: parent.id }),
      ]));

      // childを削除 → 親も自動削除
      const result = deleteFeature.deleteFeature(child.id, time);

      expect(result!.deletedFeatureIds).toContain(child.id);
      expect(result!.deletedFeatureIds).toContain(parent.id);
      expect(addFeature.getFeatureById(parent.id)).toBeUndefined();
    });
  });
});
