import { describe, it, expect, afterEach } from 'vitest';
import { DIContainer, getContainer, resetContainer } from '@infrastructure/DIContainer';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('DIContainer', () => {
  afterEach(() => {
    resetContainer();
  });

  it('全サービスが初期化される', () => {
    const container = new DIContainer();

    expect(container.addFeature).toBeDefined();
    expect(container.vertexEdit).toBeDefined();
    expect(container.anchorEdit).toBeDefined();
    expect(container.editFeature).toBeDefined();
    expect(container.deleteFeature).toBeDefined();
    expect(container.navigateTime).toBeDefined();
    expect(container.manageLayers).toBeDefined();
    expect(container.undoRedo).toBeDefined();
    expect(container.prepareAnchorEdit).toBeDefined();
    expect(container.resolveConflicts).toBeDefined();
    expect(container.commitAnchorEdit).toBeDefined();
    expect(container.configManager).toBeDefined();
  });

  it('getContainerがシングルトンを返す', () => {
    const c1 = getContainer();
    const c2 = getContainer();
    expect(c1).toBe(c2);
  });

  it('resetContainerで新しいインスタンスが作成される', () => {
    const c1 = getContainer();
    resetContainer();
    const c2 = getContainer();
    expect(c1).not.toBe(c2);
  });

  it('サービス間の依存関係が正しい', () => {
    const container = new DIContainer();
    // editFeatureがvertexEditと同じaddFeatureを共有していることを確認
    const feature = container.addFeature.addPoint(
      new Coordinate(10, 20),
      'l1',
      new TimePoint(2000)
    );
    // editFeatureからも同じ地物が取得できる
    expect(container.editFeature.getFeatureById(feature.id)).toBeDefined();
  });
});
