import { describe, it, expect, beforeEach } from 'vitest';
import { DeleteFeatureCommand } from '@application/commands/DeleteFeatureCommand';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { eventBus } from '@application/EventBus';
import type { Feature } from '@domain/entities/Feature';
import { createAnchorPlacement } from '@domain/value-objects/FeatureAnchor';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('DeleteFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  let deleteFeatureUseCase: DeleteFeatureUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(1000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    deleteFeatureUseCase = new DeleteFeatureUseCase(addFeature);
    undoRedo = new UndoRedoManager();
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

  describe('点の削除', () => {
    it('executeで点が削除される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで点と頂点が復元される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);
      const featureId = feature.id;

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, featureId);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].id).toBe(featureId);
      expect(addFeature.getVertices().size).toBe(1);
    });

    it('redo で再削除される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);
      undoRedo.undo();
      undoRedo.redo();

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });
  });

  describe('線の削除', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 10), new Coordinate(20, 20)];

    it('executeで線が削除される', () => {
      const feature = addFeature.addLine(coords, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで線と全頂点が復元される', () => {
      const feature = addFeature.addLine(coords, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Line');
      expect(addFeature.getVertices().size).toBe(3);
    });
  });

  describe('面の削除', () => {
    const coords = [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)];

    it('executeで面が削除される', () => {
      const feature = addFeature.addPolygon(coords, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(0);
      expect(addFeature.getVertices().size).toBe(0);
    });

    it('undoで面と全頂点が復元される', () => {
      const feature = addFeature.addPolygon(coords, time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, feature.id);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].featureType).toBe('Polygon');
      expect(addFeature.getVertices().size).toBe(3);
    });
  });

  describe('存在しない地物', () => {
    it('存在しない地物IDでは何も起こらない', () => {
      addFeature.addPoint(new Coordinate(10, 20), time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, 'nonexistent');
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
    });
  });

  describe('既存地物への影響なし', () => {
    it('削除時に他の地物は影響を受けない', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), time);
      addFeature.addPoint(new Coordinate(30, 40), time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, f1.id);
      undoRedo.execute(cmd);

      expect(addFeature.getFeatures()).toHaveLength(1);
      expect(addFeature.getFeatures()[0].id).not.toBe(f1.id);
    });

    it('undo時に他の地物は影響を受けない', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), time);
      addFeature.addPoint(new Coordinate(30, 40), time);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, f1.id);
      undoRedo.execute(cmd);
      undoRedo.undo();

      expect(addFeature.getFeatures()).toHaveLength(2);
    });
  });

  describe('階層整合の復元（B32: スナップショット undo）', () => {
    it('子削除の undo で親の childIds と子の parentId が相互整合のまま復元される', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, c1.id);
      undoRedo.execute(cmd);
      undoRedo.undo();

      const parent = addFeature.getFeatureById(container.id)!;
      expect(parent.anchors[0].placement.childIds).toEqual([c1.id, c2.id]);
      const restored = addFeature.getFeatureById(c1.id)!;
      expect(restored.anchors[0].placement.parentId).toBe(container.id);
    });

    it('親削除の undo で子の parentId が復元される（変更済み子地物の復元）', () => {
      const c1 = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const c2 = addFeature.addPolygon(
        [new Coordinate(10, 0), new Coordinate(20, 0), new Coordinate(20, 10)],
        time
      );
      const container = addContainer([c1.id, c2.id]);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, container.id);
      undoRedo.execute(cmd);

      // execute 後: 子は最上位へ
      expect(addFeature.getFeatureById(c1.id)!.anchors[0].placement.parentId).toBeNull();

      undoRedo.undo();

      // undo 後: 親子相互整合が完全復元（保存→再ロード可能な状態）
      const parent = addFeature.getFeatureById(container.id)!;
      expect(parent.anchors[0].placement.childIds).toEqual([c1.id, c2.id]);
      for (const childId of [c1.id, c2.id]) {
        const child = addFeature.getFeatureById(childId)!;
        expect(child.anchors[0].placement.parentId).toBe(container.id);
        expect(child.anchors[0].placement.isTopLevel).toBe(false);
      }
    });

    it('連鎖消滅（子削除 → 集約親も消滅）の undo/redo が全地物を復元・再削除する', () => {
      const child = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        time
      );
      const container = addContainer([child.id]);

      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, child.id);
      undoRedo.execute(cmd);
      expect(addFeature.getFeaturesMap().size).toBe(0);

      undoRedo.undo();
      expect(addFeature.getFeatureById(child.id)).toBeDefined();
      expect(addFeature.getFeatureById(container.id)).toBeDefined();
      expect(addFeature.getFeatureById(container.id)!.anchors[0].placement.childIds)
        .toEqual([child.id]);

      undoRedo.redo();
      expect(addFeature.getFeaturesMap().size).toBe(0);
    });
  });

  describe('イベント発火（§6.4.16: execute / undo / redo で対称）', () => {
    it('execute / undo / redo の各経路で touch した全地物へ過不足なくイベントを発火する', () => {
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
        const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, c1.id);

        // execute: 削除地物は removed、参照掃除された親は added
        undoRedo.execute(cmd);
        expect([...events].sort()).toEqual(
          [`removed:${c1.id}`, `added:${container.id}`].sort()
        );

        // undo: 削除地物の復元は added、変更されていた親の復元も added
        events.length = 0;
        undoRedo.undo();
        expect([...events].sort()).toEqual(
          [`added:${c1.id}`, `added:${container.id}`].sort()
        );

        // redo: execute と同じイベント集合
        events.length = 0;
        undoRedo.redo();
        expect([...events].sort()).toEqual(
          [`removed:${c1.id}`, `added:${container.id}`].sort()
        );
      } finally {
        unsubscribeAdded();
        unsubscribeRemoved();
      }
    });
  });

  describe('descriptionの生成', () => {
    it('削除コマンドの説明', () => {
      const cmd = new DeleteFeatureCommand(deleteFeatureUseCase, addFeature, 'any-id');
      expect(cmd.description).toBe('地物を削除');
    });
  });
});
