import { describe, it, expect, beforeEach } from 'vitest';
import { MergeFeatureCommand } from '@application/commands/MergeFeatureCommand';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('MergeFeatureCommand', () => {
  let addFeature: AddFeatureUseCase;
  const time = new TimePoint(2000);

  /** 隣接する2つの正方形ポリゴンを作成 */
  function createAdjacentSquares() {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(5, 0), new Coordinate(5, 10), new Coordinate(0, 10)],
      'l1', time, '左半分'
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(5, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(5, 10)],
      'l1', time, '右半分'
    );
    return { f1, f2 };
  }

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
  });

  it('2つのポリゴンを結合する', () => {
    const { f1, f2 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();

    // 地物が1つ減っている（結合で1つに統合）
    expect(addFeature.getFeatures().length).toBe(featuresBefore - 1);
    // 最初の地物が残っている
    const merged = addFeature.getFeatureById(f1.id);
    expect(merged).toBeDefined();
    // 2番目の地物は削除されている
    expect(addFeature.getFeatureById(f2.id)).toBeUndefined();
  });

  it('Undoで元の状態に戻る', () => {
    const { f1, f2 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();
    cmd.undo();

    // 元の地物数に戻る
    expect(addFeature.getFeatures().length).toBe(featuresBefore);
    expect(addFeature.getFeatureById(f1.id)).toBeDefined();
    expect(addFeature.getFeatureById(f2.id)).toBeDefined();
  });

  it('Undoで結合追加頂点が削除される', () => {
    const { f1, f2 } = createAdjacentSquares();
    const verticesBefore = addFeature.getVertices().size;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
    });
    cmd.execute();
    cmd.undo();

    expect(addFeature.getVertices().size).toBe(verticesBefore);
  });

  it('カスタム名を設定できる', () => {
    const { f1, f2 } = createAdjacentSquares();

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id],
      currentTime: time,
      mergedName: '統合領域',
    });
    cmd.execute();

    const merged = addFeature.getFeatureById(f1.id)!;
    const anchor = merged.getActiveAnchor(time)!;
    expect(anchor.property.name).toBe('統合領域');
  });

  it('1つの地物IDでは何もしない', () => {
    const { f1 } = createAdjacentSquares();
    const featuresBefore = addFeature.getFeatures().length;

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id],
      currentTime: time,
    });
    cmd.execute();

    expect(addFeature.getFeatures().length).toBe(featuresBefore);
  });

  it('3つのポリゴンを結合する', () => {
    const f1 = addFeature.addPolygon(
      [new Coordinate(0, 0), new Coordinate(4, 0), new Coordinate(4, 10), new Coordinate(0, 10)],
      'l1', time
    );
    const f2 = addFeature.addPolygon(
      [new Coordinate(4, 0), new Coordinate(7, 0), new Coordinate(7, 10), new Coordinate(4, 10)],
      'l1', time
    );
    const f3 = addFeature.addPolygon(
      [new Coordinate(7, 0), new Coordinate(10, 0), new Coordinate(10, 10), new Coordinate(7, 10)],
      'l1', time
    );

    const cmd = new MergeFeatureCommand(addFeature, {
      featureIds: [f1.id, f2.id, f3.id],
      currentTime: time,
    });
    cmd.execute();

    // 3つが1つに統合
    expect(addFeature.getFeatures().length).toBe(1);
    expect(addFeature.getFeatureById(f1.id)).toBeDefined();
  });
});
