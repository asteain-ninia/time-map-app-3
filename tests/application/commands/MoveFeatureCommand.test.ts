import { describe, it, expect, beforeEach } from 'vitest';
import { MoveFeatureCommand } from '@application/commands/MoveFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('MoveFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
  });

  describe('ポイント地物の移動', () => {
    it('dx, dy だけ頂点が移動する', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchor = feature.getActiveAnchor(time)!;
      const vid = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: feature.id, dx: 5, dy: -3, currentTime: time,
      });
      cmd.execute();

      const vertex = addFeature.getVertices().get(vid)!;
      expect(vertex.coordinate.x).toBe(15);
      expect(vertex.coordinate.y).toBe(17);
    });

    it('Undoで元の座標に戻る', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchor = feature.getActiveAnchor(time)!;
      const vid = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: feature.id, dx: 5, dy: -3, currentTime: time,
      });
      cmd.execute();
      cmd.undo();

      const vertex = addFeature.getVertices().get(vid)!;
      expect(vertex.coordinate.x).toBe(10);
      expect(vertex.coordinate.y).toBe(20);
    });

    it('横方向ラップをまたぐ移動でも生値経度を保持する', () => {
      const feature = addFeature.addPoint(new Coordinate(170, 20), 'l1', time);
      const anchor = feature.getActiveAnchor(time)!;
      const vid = (anchor.shape as { type: 'Point'; vertexId: string }).vertexId;

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: feature.id, dx: 30, dy: 0, currentTime: time,
      });
      cmd.execute();

      const vertex = addFeature.getVertices().get(vid)!;
      expect(vertex.coordinate.x).toBe(200);
      expect(vertex.coordinate.y).toBe(20);
    });
  });

  describe('ライン地物の移動', () => {
    it('全頂点が同じベクトルで移動する', () => {
      const feature = addFeature.addLine(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );
      const anchor = feature.getActiveAnchor(time)!;
      const vertexIds = (anchor.shape as { type: 'LineString'; vertexIds: readonly string[] }).vertexIds;

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: feature.id, dx: 3, dy: 7, currentTime: time,
      });
      cmd.execute();

      const v0 = addFeature.getVertices().get(vertexIds[0])!;
      const v1 = addFeature.getVertices().get(vertexIds[1])!;
      const v2 = addFeature.getVertices().get(vertexIds[2])!;
      expect(v0.coordinate.x).toBe(3);
      expect(v0.coordinate.y).toBe(7);
      expect(v1.coordinate.x).toBe(13);
      expect(v1.coordinate.y).toBe(7);
      expect(v2.coordinate.x).toBe(13);
      expect(v2.coordinate.y).toBe(17);
    });
  });

  describe('ポリゴン地物の移動', () => {
    it('全リングの頂点が移動する', () => {
      const feature = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10)],
        'l1', time
      );

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: feature.id, dx: 1, dy: 2, currentTime: time,
      });
      cmd.execute();

      // 少なくとも3頂点が移動しているはず
      const anchor = addFeature.getFeatureById(feature.id)!.getActiveAnchor(time)!;
      const ring = (anchor.shape as { type: 'Polygon'; rings: readonly { vertexIds: readonly string[] }[] }).rings[0];
      const v0 = addFeature.getVertices().get(ring.vertexIds[0])!;
      expect(v0.coordinate.x).toBe(1);
      expect(v0.coordinate.y).toBe(2);
    });

    it('他のポリゴンと重なる移動は拒否する', () => {
      const featureA = addFeature.addPolygon(
        [new Coordinate(0, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(0, 10)],
        'l1',
        time
      );
      addFeature.addPolygon(
        [new Coordinate(20, 0), new Coordinate(30, 0), new Coordinate(30, 10), new Coordinate(20, 10)],
        'l1',
        time
      );

      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: featureA.id, dx: 15, dy: 0, currentTime: time,
      });

      expect(() => cmd.execute()).toThrow('重なっています');

      const anchor = featureA.getActiveAnchor(time)!;
      const ring = (anchor.shape as { type: 'Polygon'; rings: readonly { vertexIds: readonly string[] }[] }).rings[0];
      const vertex = addFeature.getVertices().get(ring.vertexIds[0])!;
      expect(vertex.coordinate.x).toBe(0);
      expect(vertex.coordinate.y).toBe(0);
    });
  });

  describe('存在しない地物', () => {
    it('存在しない地物は何もしない', () => {
      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: 'nonexistent', dx: 1, dy: 2, currentTime: time,
      });
      // エラーにならない
      cmd.execute();
      cmd.undo();
    });
  });

  describe('description', () => {
    it('説明文を持つ', () => {
      const cmd = new MoveFeatureCommand(addFeature, {
        featureId: 'f1', dx: 1, dy: 2, currentTime: time,
      });
      expect(cmd.description).toContain('f1');
    });
  });
});
