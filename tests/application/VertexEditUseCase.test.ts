import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VertexEditUseCase, VertexEditError } from '@application/VertexEditUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { eventBus } from '@application/EventBus';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('VertexEditUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let vertexEdit: VertexEditUseCase;
  const time = new TimePoint(1000);
  const layerId = 'l1';

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    vertexEdit = new VertexEditUseCase(addFeature);
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('moveVertex', () => {
    it('頂点を新しい座標に移動できる', () => {
      addFeature.addPoint(new Coordinate(10, 20), layerId, time);
      const vertexId = [...addFeature.getVertices().keys()][0];

      vertexEdit.moveVertex(vertexId, new Coordinate(30, 40));

      const vertex = addFeature.getVertices().get(vertexId)!;
      expect(vertex.x).toBe(30);
      expect(vertex.y).toBe(40);
    });

    it('経度を保持したまま緯度だけを範囲内に収める', () => {
      addFeature.addPoint(new Coordinate(10, 20), layerId, time);
      const vertexId = [...addFeature.getVertices().keys()][0];

      vertexEdit.moveVertex(vertexId, new Coordinate(200, 100));

      const vertex = addFeature.getVertices().get(vertexId)!;
      expect(vertex.x).toBe(200);
      expect(vertex.y).toBe(90);   // clamped
    });

    it('存在しない頂点でエラー', () => {
      expect(() => {
        vertexEdit.moveVertex('nonexistent', new Coordinate(0, 0));
      }).toThrow(VertexEditError);
    });
  });

  describe('insertVertexOnLine', () => {
    it('線のエッジに頂点を挿入できる', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(20, 0)],
        layerId,
        time
      );

      const newVertexId = vertexEdit.insertVertexOnLine(
        line.id,
        time,
        0,
        new Coordinate(5, 0)
      );

      // 新頂点が頂点マップに登録されている
      expect(addFeature.getVertices().has(newVertexId)).toBe(true);

      // 線の頂点数が増えている
      const updated = addFeature.getFeatureById(line.id)!;
      const anchor = updated.getActiveAnchor(time)!;
      if (anchor.shape.type === 'LineString') {
        expect(anchor.shape.vertexIds).toHaveLength(4);
        expect(anchor.shape.vertexIds[1]).toBe(newVertexId);
      }
    });

    it('末尾エッジにも挿入できる', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      vertexEdit.insertVertexOnLine(line.id, time, 0, new Coordinate(5, 0));

      const updated = addFeature.getFeatureById(line.id)!;
      const anchor = updated.getActiveAnchor(time)!;
      if (anchor.shape.type === 'LineString') {
        expect(anchor.shape.vertexIds).toHaveLength(3);
      }
    });

    it('挿入頂点の経度は生値のまま保持し緯度だけクランプする', () => {
      const line = addFeature.addLine(
        [new Coordinate(170, 0), new Coordinate(190, 0)],
        layerId,
        time
      );

      const newVertexId = vertexEdit.insertVertexOnLine(
        line.id,
        time,
        0,
        new Coordinate(200, 100)
      );

      const vertex = addFeature.getVertices().get(newVertexId)!;
      expect(vertex.x).toBe(200);
      expect(vertex.y).toBe(90);
    });

    it('範囲外のエッジインデックスでエラー', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      expect(() => {
        vertexEdit.insertVertexOnLine(line.id, time, 5, new Coordinate(5, 0));
      }).toThrow(VertexEditError);
    });

    it('ポイント地物に対して実行するとエラー', () => {
      const point = addFeature.addPoint(new Coordinate(0, 0), layerId, time);

      expect(() => {
        vertexEdit.insertVertexOnLine(point.id, time, 0, new Coordinate(5, 0));
      }).toThrow('not a Line');
    });

    it('存在しない地物でエラー', () => {
      expect(() => {
        vertexEdit.insertVertexOnLine('nonexistent', time, 0, new Coordinate(5, 0));
      }).toThrow(VertexEditError);
    });
  });

  describe('insertVertexOnPolygon', () => {
    it('ポリゴンのリングエッジに頂点を挿入できる', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const ringId = (anchor.shape as { type: 'Polygon'; rings: { id: string }[] }).rings[0].id;

      const newVertexId = vertexEdit.insertVertexOnPolygon(
        polygon.id,
        time,
        ringId,
        0,
        new Coordinate(5, 0)
      );

      expect(addFeature.getVertices().has(newVertexId)).toBe(true);

      const updated = addFeature.getFeatureById(polygon.id)!;
      const updatedAnchor = updated.getActiveAnchor(time)!;
      if (updatedAnchor.shape.type === 'Polygon') {
        expect(updatedAnchor.shape.rings[0].vertexIds).toHaveLength(4);
      }
    });

    it('最後のエッジ（閉合辺）にも挿入できる', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const ringId = (anchor.shape as { type: 'Polygon'; rings: { id: string }[] }).rings[0].id;

      // edgeIndex = 2: 最後の頂点→最初の頂点のエッジ
      vertexEdit.insertVertexOnPolygon(polygon.id, time, ringId, 2, new Coordinate(0, 10));

      const updated = addFeature.getFeatureById(polygon.id)!;
      const updatedAnchor = updated.getActiveAnchor(time)!;
      if (updatedAnchor.shape.type === 'Polygon') {
        expect(updatedAnchor.shape.rings[0].vertexIds).toHaveLength(4);
      }
    });

    it('ポリゴン挿入頂点も生値経度のまま保持する', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(170, 0), new Coordinate(190, 0), new Coordinate(190, 10)],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const ringId = (anchor.shape as { type: 'Polygon'; rings: { id: string }[] }).rings[0].id;

      const newVertexId = vertexEdit.insertVertexOnPolygon(
        polygon.id,
        time,
        ringId,
        0,
        new Coordinate(200, 5)
      );

      const vertex = addFeature.getVertices().get(newVertexId)!;
      expect(vertex.x).toBe(200);
      expect(vertex.y).toBe(5);
    });

    it('存在しないリングでエラー', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        layerId,
        time
      );

      expect(() => {
        vertexEdit.insertVertexOnPolygon(polygon.id, time, 'nonexistent', 0, new Coordinate(5, 0));
      }).toThrow('not found');
    });
  });

  describe('deleteVertexFromLine', () => {
    it('線の頂点を削除できる', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(20, 0)],
        layerId,
        time
      );

      const anchor = line.getActiveAnchor(time)!;
      const vertexIds = (anchor.shape as { type: 'LineString'; vertexIds: string[] }).vertexIds;
      const middleVertexId = vertexIds[1];

      const deleted = vertexEdit.deleteVertexFromLine(line.id, time, middleVertexId);

      expect(deleted).toBe(false); // 地物は残存
      const updated = addFeature.getFeatureById(line.id)!;
      const updatedShape = updated.getActiveAnchor(time)!.shape;
      if (updatedShape.type === 'LineString') {
        expect(updatedShape.vertexIds).toHaveLength(2);
        expect(updatedShape.vertexIds).not.toContain(middleVertexId);
      }
    });

    it('2点未満になる場合は線自体が削除される', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      const anchor = line.getActiveAnchor(time)!;
      const vertexIds = (anchor.shape as { type: 'LineString'; vertexIds: string[] }).vertexIds;

      const deleted = vertexEdit.deleteVertexFromLine(line.id, time, vertexIds[0]);

      expect(deleted).toBe(true);
      expect(addFeature.getFeatureById(line.id)).toBeUndefined();
    });

    it('線に属さない頂点でエラー', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      expect(() => {
        vertexEdit.deleteVertexFromLine(line.id, time, 'nonexistent');
      }).toThrow('not in this line');
    });
  });

  describe('deleteVertexFromPolygon', () => {
    it('ポリゴンの頂点を削除できる', () => {
      const polygon = addFeature.addPolygon(
        [
          new Coordinate(0, 0),
          new Coordinate(10, 0),
          new Coordinate(10, 10),
          new Coordinate(0, 10),
        ],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const shape = anchor.shape as { type: 'Polygon'; rings: { id: string; vertexIds: string[] }[] };
      const ringId = shape.rings[0].id;
      const vertexToDelete = shape.rings[0].vertexIds[3];

      const deleted = vertexEdit.deleteVertexFromPolygon(polygon.id, time, ringId, vertexToDelete);

      expect(deleted).toBe(false);
      const updated = addFeature.getFeatureById(polygon.id)!;
      const updatedShape = updated.getActiveAnchor(time)!.shape;
      if (updatedShape.type === 'Polygon') {
        expect(updatedShape.rings[0].vertexIds).toHaveLength(3);
      }
    });

    it('3点未満になる場合は面自体が削除される', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const shape = anchor.shape as { type: 'Polygon'; rings: { id: string; vertexIds: string[] }[] };
      const ringId = shape.rings[0].id;
      const vertexToDelete = shape.rings[0].vertexIds[0];

      const deleted = vertexEdit.deleteVertexFromPolygon(polygon.id, time, ringId, vertexToDelete);

      expect(deleted).toBe(true);
      expect(addFeature.getFeatureById(polygon.id)).toBeUndefined();
    });

    it('リングに属さない頂点でエラー', () => {
      const polygon = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        layerId,
        time
      );

      const anchor = polygon.getActiveAnchor(time)!;
      const ringId = (anchor.shape as { type: 'Polygon'; rings: { id: string }[] }).rings[0].id;

      expect(() => {
        vertexEdit.deleteVertexFromPolygon(polygon.id, time, ringId, 'nonexistent');
      }).toThrow('not in ring');
    });
  });

  describe('イベント通知', () => {
    it('頂点挿入後にfeature:addedイベントが発行される', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      let emitted = false;
      const unsub = eventBus.on('feature:added', () => { emitted = true; });

      vertexEdit.insertVertexOnLine(line.id, time, 0, new Coordinate(5, 0));

      expect(emitted).toBe(true);
      unsub();
    });

    it('地物削除時にfeature:removedイベントが発行される', () => {
      const line = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0)],
        layerId,
        time
      );

      let removedId: string | null = null;
      const unsub = eventBus.on('feature:removed', (e) => { removedId = e.featureId; });

      const anchor = line.getActiveAnchor(time)!;
      const vertexIds = (anchor.shape as { type: 'LineString'; vertexIds: string[] }).vertexIds;
      vertexEdit.deleteVertexFromLine(line.id, time, vertexIds[0]);

      expect(removedId).toBe(line.id);
      unsub();
    });
  });
});
