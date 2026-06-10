import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { eventBus } from '@application/EventBus';
import type { Feature } from '@domain/entities/Feature';
import { World, DEFAULT_METADATA } from '@domain/entities/World';
import { createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { serialize, deserialize } from '@infrastructure/persistence/JSONSerializer';

describe('DeleteFeatureUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let deleteFeature: DeleteFeatureUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    deleteFeature = new DeleteFeatureUseCase(addFeature);
  });

  /** 全錨の placement を一括設定する（isTopLevel は createAnchorPlacement で再派生） */
  function setPlacement(featureId: string, parentId: string | null, childIds: string[]): void {
    const featuresMap = addFeature.getFeaturesMap() as Map<string, Feature>;
    const feature = featuresMap.get(featureId)!;
    const updatedAnchors = feature.anchors.map(a =>
      a.withPlacement(createAnchorPlacement(parentId, childIds))
    );
    featuresMap.set(featureId, feature.withAnchors(updatedAnchors));
  }

  /** 集約地物（shape なしコンテナ）を生成して登録し、子の parentId を設定する（子の childIds は保持） */
  function addContainer(childIds: string[], name = 'コンテナ'): Feature {
    const container = addFeature.buildContainerFeature(time, childIds, { name, description: '' });
    const featuresMap = addFeature.getFeaturesMap() as Map<string, Feature>;
    featuresMap.set(container.id, container);
    for (const childId of childIds) {
      const child = featuresMap.get(childId)!;
      setPlacement(childId, container.id, [...child.anchors[0].placement.childIds]);
    }
    return container;
  }

  describe('基本削除', () => {
    it('ポイント地物を削除できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);
      const result = deleteFeature.deleteFeature(feature.id);

      expect(result).not.toBeNull();
      expect(result!.deletedFeatureIds).toContain(feature.id);
      expect(addFeature.getFeatureById(feature.id)).toBeUndefined();
    });

    it('ライン地物を削除できる', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        time
      );
      const result = deleteFeature.deleteFeature(feature.id);

      expect(result).not.toBeNull();
      expect(result!.deletedFeatureIds).toContain(feature.id);
    });

    it('ポリゴン地物を削除できる', () => {
      const feature = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
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
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);
      const anchor = feature.getActiveAnchor(time)!;
      const vertexId = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      const result = deleteFeature.deleteFeature(feature.id);

      expect(result!.deletedVertexIds).toContain(vertexId);
      expect(addFeature.getVertices().has(vertexId)).toBe(false);
    });

    it('他の地物で使用されている頂点は削除しない', () => {
      // 2つのポイントを同じ位置に追加（異なる頂点ID）
      const f1 = addFeature.addPoint(new Coordinate(10, 20), time);
      addFeature.addPoint(new Coordinate(10, 20), time);

      const verticesBefore = addFeature.getVertices().size;
      deleteFeature.deleteFeature(f1.id);

      // 1つの頂点のみ削除（f2の頂点は残る）
      expect(addFeature.getVertices().size).toBe(verticesBefore - 1);
    });
  });

  describe('削除結果', () => {
    it('削除されたfeatureIdを含む', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);
      const result = deleteFeature.deleteFeature(feature.id);
      expect(result!.deletedFeatureIds).toEqual([feature.id]);
    });

    it('削除された頂点IDを含む', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        time
      );
      const result = deleteFeature.deleteFeature(feature.id);
      expect(result!.deletedVertexIds.length).toBeGreaterThanOrEqual(2);
    });

    it('参照掃除で更新された地物IDを modifiedFeatureIds に含む', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      const result = deleteFeature.deleteFeature(c1.id);

      expect(result!.modifiedFeatureIds).toEqual([container.id]);
    });
  });

  describe('親子関係の処理（削除 = 全時間軸からの消滅）', () => {
    it('子を削除すると親の childIds から除去される（B31）', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      deleteFeature.deleteFeature(c1.id);

      // 親は存続し、childIds に削除 ID が残らない（dangling 子参照なし）
      const parent = addFeature.getFeatureById(container.id)!;
      for (const anchor of parent.anchors) {
        expect(anchor.placement.childIds).toEqual([c2.id]);
      }
      expect(addFeature.getFeatureById(c2.id)).toBeDefined();
    });

    it('親を削除すると子の parentId が全錨でクリアされる', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      deleteFeature.deleteFeature(container.id);

      for (const childId of [c1.id, c2.id]) {
        const child = addFeature.getFeatureById(childId)!;
        for (const anchor of child.anchors) {
          expect(anchor.placement.parentId).toBeNull();
          expect(anchor.placement.isTopLevel).toBe(true);
        }
      }
    });

    it('最後の子を削除すると集約地物の親も自動削除される（§2.1）', () => {
      const child = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const container = addContainer([child.id]);

      const result = deleteFeature.deleteFeature(child.id);

      expect(result!.deletedFeatureIds).toContain(child.id);
      expect(result!.deletedFeatureIds).toContain(container.id);
      expect(addFeature.getFeatureById(container.id)).toBeUndefined();
    });

    it('連鎖消滅は上位へ伝播し、参照も掃除される', () => {
      // 祖父母 g（集約）→ 親 p（集約）→ 子 x（末端）
      const x = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const p = addContainer([x.id], '親');
      const g = addContainer([p.id], '祖父母');

      const result = deleteFeature.deleteFeature(x.id);

      expect([...result!.deletedFeatureIds].sort()).toEqual([g.id, p.id, x.id].sort());
      expect(addFeature.getFeaturesMap().size).toBe(0);
    });

    it('shape を持つ親（移行期間ノード）は最後の子を失っても末端地物として存続する', () => {
      const parent = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(20, 0), new Coordinate(20, 20)],
        time
      );
      const child = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      setPlacement(parent.id, null, [child.id]);
      setPlacement(child.id, parent.id, []);

      const result = deleteFeature.deleteFeature(child.id);

      expect(result!.deletedFeatureIds).toEqual([child.id]);
      const survived = addFeature.getFeatureById(parent.id)!;
      expect(survived.anchors[0].placement.childIds).toEqual([]);
      expect(survived.anchors[0].shape).toBeDefined();
    });

    it('削除後の状態は保存→再ロードで拒否されない（§6.4.15 round-trip）', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      addContainer([c1.id, c2.id]);

      deleteFeature.deleteFeature(c1.id);

      const world = new World(
        '1.0.0',
        new Map(addFeature.getVertices()),
        new Map(addFeature.getFeaturesMap()),
        new Map(addFeature.getSharedVertexGroups()),
        [],
        DEFAULT_METADATA
      );
      expect(() => deserialize(serialize(world))).not.toThrow();
    });
  });

  describe('イベント発火（§6.4.16: touch した全地物へ対称に通知）', () => {
    it('削除地物は feature:removed、参照掃除で変更された地物は feature:added を過不足なく発火する', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
        events.push(`added:${featureId}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
        events.push(`removed:${featureId}`);
      });

      try {
        deleteFeature.deleteFeature(c1.id);
        expect([...events].sort()).toEqual(
          [`removed:${c1.id}`, `added:${container.id}`].sort()
        );
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });

    it('連鎖消滅した集約地物も feature:removed を発火する', () => {
      const child = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const container = addContainer([child.id]);

      const events: string[] = [];
      const unsubscribeAdded = eventBus.on('feature:added', ({ featureId }) => {
        events.push(`added:${featureId}`);
      });
      const unsubscribeRemoved = eventBus.on('feature:removed', ({ featureId }) => {
        events.push(`removed:${featureId}`);
      });

      try {
        deleteFeature.deleteFeature(child.id);
        expect([...events].sort()).toEqual(
          [`removed:${child.id}`, `removed:${container.id}`].sort()
        );
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });
  });
});
