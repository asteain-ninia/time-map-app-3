import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotFeatureEditCommand } from '@application/commands/SnapshotFeatureEditCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { UpdateFeatureAnchorUseCase } from '@application/UpdateFeatureAnchorUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { eventBus } from '@application/EventBus';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { addExclaveRing } from '@domain/services/RingEditService';

/**
 * SnapshotFeatureEditCommand の回帰テスト（B35 / B36）。
 *
 * B35: 穴/飛び地リング追加の確定（features / vertices Map 直接変異）を undo 履歴に乗せる。
 * B36: プロパティ編集の確定（features Map 直接変異）を undo 履歴に乗せる。
 *
 * §6.4.16: execute / undo / redo の各経路で発火イベント集合を厳密一致検証する。
 * §6.4.12: redo は afterState 復元で生成 ID（頂点 ID・リング ID）を採番し直さない。
 */
describe('SnapshotFeatureEditCommand', () => {
  let addFeature: AddFeatureUseCase;
  let anchorEdit: UpdateFeatureAnchorUseCase;
  let undoRedo: UndoRedoManager;
  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    anchorEdit = new UpdateFeatureAnchorUseCase(addFeature);
    undoRedo = new UndoRedoManager();
  });

  /** feature:added / feature:removed を時系列で収集する */
  function collectEvents(): { events: string[]; dispose: () => void } {
    const events: string[] = [];
    const unsubAdded = eventBus.on('feature:added', ({ featureId }) => {
      events.push(`added:${featureId}`);
    });
    const unsubRemoved = eventBus.on('feature:removed', ({ featureId }) => {
      events.push(`removed:${featureId}`);
    });
    return {
      events,
      dispose: () => {
        unsubAdded();
        unsubRemoved();
      },
    };
  }

  describe('プロパティ編集の確定（B36）', () => {
    it('プロパティ変更が undo / redo できる', () => {
      const f = addFeature.addPoint(new Coordinate(10, 20), time, 'A');
      const anchorId = f.anchors[0].id;
      const baseProperty = f.anchors[0].property;

      undoRedo.execute(
        new SnapshotFeatureEditCommand(addFeature, {
          description: 'プロパティを編集',
          mutate: () => {
            anchorEdit.updateProperty(f.id, anchorId, { ...baseProperty, name: 'B' });
            return [f.id];
          },
        })
      );
      expect(addFeature.getFeatureById(f.id)?.anchors[0].property.name).toBe('B');

      undoRedo.undo();
      expect(addFeature.getFeatureById(f.id)?.anchors[0].property.name).toBe('A');

      undoRedo.redo();
      expect(addFeature.getFeatureById(f.id)?.anchors[0].property.name).toBe('B');
    });

    it('execute / undo / redo でイベントを対称に発火する', () => {
      const f = addFeature.addPoint(new Coordinate(10, 20), time, 'A');
      const anchorId = f.anchors[0].id;
      const baseProperty = f.anchors[0].property;

      const { events, dispose } = collectEvents();
      try {
        undoRedo.execute(
          new SnapshotFeatureEditCommand(addFeature, {
            description: 'プロパティを編集',
            mutate: () => {
              anchorEdit.updateProperty(f.id, anchorId, { ...baseProperty, name: 'B' });
              return [f.id];
            },
          })
        );
        // 更新 = feature:added（存在し続ける地物）
        expect(events).toEqual([`added:${f.id}`]);

        events.length = 0;
        undoRedo.undo();
        expect(events).toEqual([`added:${f.id}`]);

        events.length = 0;
        undoRedo.redo();
        expect(events).toEqual([`added:${f.id}`]);
      } finally {
        dispose();
      }
    });
  });

  describe('リング追加の確定（B35）', () => {
    /** 飛び地リング（新頂点 + 新リング）を追加する mutate を組む */
    function buildAddExclaveMutate(featureId: string): {
      mutate: () => string[];
      capturedVertexIds: () => readonly string[];
      capturedRingId: () => string | null;
    } {
      let vertexIds: string[] = [];
      let ringId: string | null = null;
      const exclaveCoords = [
        new Coordinate(20, 20),
        new Coordinate(25, 20),
        new Coordinate(25, 25),
      ];
      return {
        capturedVertexIds: () => vertexIds,
        capturedRingId: () => ringId,
        mutate: () => {
          const feature = addFeature.getFeatureById(featureId)!;
          const anchor = feature.anchors[0];
          if (!anchor.shape || anchor.shape.type !== 'Polygon') throw new Error('not a polygon');
          const vertexMap = addFeature.getVertices() as Map<string, Vertex>;
          vertexIds = exclaveCoords.map((coord, i) => {
            const id = `v-ring-test-${i}`;
            vertexMap.set(id, new Vertex(id, coord.clampLatitude()));
            return id;
          });
          ringId = 'ring-test-exclave';
          const result = addExclaveRing(anchor.shape.rings, null, ringId, vertexIds);
          const newAnchor = anchor.withShape({ type: 'Polygon', rings: result.rings });
          const updated = feature.withAnchors(
            feature.anchors.map((a) => (a.id === anchor.id ? newAnchor : a))
          );
          (addFeature.getFeaturesMap() as Map<string, typeof feature>).set(feature.id, updated);
          eventBus.emit('feature:added', { featureId: feature.id });
          return [feature.id];
        },
      };
    }

    it('リング追加が undo / redo できる', () => {
      const f = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
        time, '面'
      );
      const ringsBefore = (() => {
        const s = f.anchors[0].shape;
        return s && s.type === 'Polygon' ? s.rings.length : 0;
      })();
      const verticesBefore = addFeature.getVertices().size;

      const { mutate } = buildAddExclaveMutate(f.id);
      undoRedo.execute(
        new SnapshotFeatureEditCommand(addFeature, { description: '飛び地リングを追加', mutate })
      );

      const ringsAfter = (() => {
        const s = addFeature.getFeatureById(f.id)?.anchors[0].shape;
        return s && s.type === 'Polygon' ? s.rings.length : 0;
      })();
      expect(ringsAfter).toBe(ringsBefore + 1);
      expect(addFeature.getVertices().size).toBe(verticesBefore + 3);

      undoRedo.undo();
      const ringsUndo = (() => {
        const s = addFeature.getFeatureById(f.id)?.anchors[0].shape;
        return s && s.type === 'Polygon' ? s.rings.length : 0;
      })();
      expect(ringsUndo).toBe(ringsBefore);
      expect(addFeature.getVertices().size).toBe(verticesBefore);
    });

    it('redo は生成した頂点 ID / リング ID を採番し直さない（§6.4.12）', () => {
      const f = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
        time, '面'
      );
      const { mutate, capturedVertexIds, capturedRingId } = buildAddExclaveMutate(f.id);
      undoRedo.execute(
        new SnapshotFeatureEditCommand(addFeature, { description: '飛び地リングを追加', mutate })
      );
      const vertexIds = [...capturedVertexIds()];
      const ringId = capturedRingId();

      undoRedo.undo();
      undoRedo.redo();

      // redo 後も同一 ID が復元される
      for (const id of vertexIds) {
        expect(addFeature.getVertices().has(id)).toBe(true);
      }
      const shape = addFeature.getFeatureById(f.id)?.anchors[0].shape;
      const ringIds = shape && shape.type === 'Polygon' ? shape.rings.map((r) => r.id) : [];
      expect(ringIds).toContain(ringId);
    });

    it('execute / undo / redo でイベントを対称に発火する', () => {
      const f = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
        time, '面'
      );
      const { mutate } = buildAddExclaveMutate(f.id);

      const { events, dispose } = collectEvents();
      try {
        undoRedo.execute(
          new SnapshotFeatureEditCommand(addFeature, { description: '飛び地リングを追加', mutate })
        );
        expect(events).toEqual([`added:${f.id}`]);

        events.length = 0;
        undoRedo.undo();
        expect(events).toEqual([`added:${f.id}`]);

        events.length = 0;
        undoRedo.redo();
        expect(events).toEqual([`added:${f.id}`]);
      } finally {
        dispose();
      }
    });
  });

  describe('mutate 失敗時のロールバック（§6.4.2）', () => {
    it('mutate が部分変異の途中で throw しても beforeState へ復元し孤児を残さない', () => {
      addFeature.addPoint(new Coordinate(0, 0), time, 'A');
      const featuresBefore = addFeature.getFeatures().length;
      const verticesBefore = addFeature.getVertices().size;

      const cmd = new SnapshotFeatureEditCommand(addFeature, {
        description: '失敗する編集',
        mutate: () => {
          // 部分変異: 孤児になりうる頂点を Map へ追加した直後に throw する
          const vertexMap = addFeature.getVertices() as Map<string, Vertex>;
          vertexMap.set('orphan-v', new Vertex('orphan-v', new Coordinate(9, 9)));
          throw new Error('mutate failed');
        },
      });

      expect(() => cmd.execute()).toThrow('mutate failed');
      // 追加した孤児頂点が復元で消える
      expect(addFeature.getVertices().has('orphan-v')).toBe(false);
      expect(addFeature.getVertices().size).toBe(verticesBefore);
      expect(addFeature.getFeatures().length).toBe(featuresBefore);
    });

    it('throw した mutate はイベントを発火しない（net 状態が execute 前と同一）', () => {
      addFeature.addPoint(new Coordinate(0, 0), time, 'A');
      const { events, dispose } = collectEvents();
      try {
        const cmd = new SnapshotFeatureEditCommand(addFeature, {
          description: '失敗する編集',
          mutate: () => {
            const vertexMap = addFeature.getVertices() as Map<string, Vertex>;
            vertexMap.set('orphan-v', new Vertex('orphan-v', new Coordinate(9, 9)));
            throw new Error('mutate failed');
          },
        });
        expect(() => cmd.execute()).toThrow('mutate failed');
        expect(events).toEqual([]);
      } finally {
        dispose();
      }
    });

    it('UndoRedoManager 経由でも throw 後にコマンドが stack へ積まれない', () => {
      addFeature.addPoint(new Coordinate(0, 0), time, 'A');
      expect(() =>
        undoRedo.execute(
          new SnapshotFeatureEditCommand(addFeature, {
            description: '失敗する編集',
            mutate: () => {
              throw new Error('mutate failed');
            },
          })
        )
      ).toThrow('mutate failed');
      // 失敗したコマンドは undo 対象にならない
      expect(undoRedo.canUndo()).toBe(false);
    });
  });

  it('mutate が touch しない地物にはイベントを発火しない', () => {
    const f1 = addFeature.addPoint(new Coordinate(0, 0), time, 'A');
    const f2 = addFeature.addPoint(new Coordinate(5, 5), time, 'B');
    const anchorId = f1.anchors[0].id;
    const baseProperty = f1.anchors[0].property;

    const { events, dispose } = collectEvents();
    try {
      undoRedo.execute(
        new SnapshotFeatureEditCommand(addFeature, {
          description: 'プロパティを編集',
          mutate: () => {
            anchorEdit.updateProperty(f1.id, anchorId, { ...baseProperty, name: 'A2' });
            return [f1.id];
          },
        })
      );
      events.length = 0;
      undoRedo.undo();
      expect(events).toEqual([`added:${f1.id}`]);
      expect(events).not.toContain(`added:${f2.id}`);
    } finally {
      dispose();
    }
  });
});
