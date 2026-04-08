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

    expect(container.commands.addFeature).toBeDefined();
    expect(container.commands.vertexEdit).toBeDefined();
    expect(container.commands.anchorEdit).toBeDefined();
    expect(container.commands.editFeature).toBeDefined();
    expect(container.commands.deleteFeature).toBeDefined();
    expect(container.commands.navigateTime).toBeDefined();
    expect(container.commands.manageLayers).toBeDefined();
    expect(container.commands.undoRedo).toBeDefined();
    expect(container.commands.prepareAnchorEdit).toBeDefined();
    expect(container.commands.resolveConflicts).toBeDefined();
    expect(container.commands.commitAnchorEdit).toBeDefined();
    expect(container.commands.saveLoad).toBeDefined();
    expect(container.queries.features).toBeDefined();
    expect(container.queries.layers).toBeDefined();
    expect(container.queries.timeline).toBeDefined();
    expect(container.queries.project).toBeDefined();
    expect(container.infrastructure.configManager).toBeDefined();
    expect(container.infrastructure.repository).toBeDefined();
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
    const feature = container.commands.addFeature.addPoint(
      new Coordinate(10, 20),
      'l1',
      new TimePoint(2000)
    );
    // editFeatureからも同じ地物が取得できる
    expect(container.commands.editFeature.getFeatureById(feature.id)).toBeDefined();
    expect(container.queries.features.getFeatureById(feature.id)).toBeDefined();
  });
});
