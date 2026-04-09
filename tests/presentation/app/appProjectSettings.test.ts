import { describe, expect, it } from 'vitest';
import type { Layer } from '@domain/entities/Layer';
import {
  DEFAULT_METADATA,
  DEFAULT_SETTINGS,
} from '@domain/entities/World';
import {
  hasProjectSettingsChanged,
  normalizeWorldSettings,
} from '@presentation/app/appProjectSettings';

function createLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'layer-1',
    name: 'レイヤー1',
    order: 0,
    visible: true,
    opacity: 1,
    ...overrides,
  };
}

describe('appProjectSettings', () => {
  it('設定値を安全な範囲へ正規化する', () => {
    const normalized = normalizeWorldSettings({
      ...DEFAULT_SETTINGS,
      zoomMin: 80,
      zoomMax: Number.NaN,
      gridOpacity: 2,
      labelAreaThreshold: -1,
      autoSaveInterval: 0.4,
    });

    expect(normalized.zoomMin).toBe(50);
    expect(normalized.zoomMax).toBe(80);
    expect(normalized.gridOpacity).toBe(1);
    expect(normalized.labelAreaThreshold).toBe(0);
    expect(normalized.autoSaveInterval).toBe(1);
  });

  it('メタデータ・設定・レイヤーの差分を検出する', () => {
    const currentLayers = [createLayer()];
    const nextLayers = [createLayer({ opacity: 0.5 })];

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      currentLayers,
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      currentLayers
    )).toBe(false);

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      currentLayers,
      {
        ...DEFAULT_METADATA,
        worldName: '別世界',
      },
      {
        ...DEFAULT_SETTINGS,
        zoomMax: 64,
      },
      nextLayers
    )).toBe(true);
  });
});
