import { describe, expect, it } from 'vitest';
import type { Layer } from '@domain/entities/Layer';
import {
  DEFAULT_METADATA,
  DEFAULT_SETTINGS,
} from '@domain/entities/World';
import {
  areLayersEqual,
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

  it('zoomMinとzoomMaxが同値ならその値を維持する', () => {
    const normalized = normalizeWorldSettings({
      ...DEFAULT_SETTINGS,
      zoomMin: 12,
      zoomMax: 12,
    });

    expect(normalized.zoomMin).toBe(12);
    expect(normalized.zoomMax).toBe(12);
  });

  it('有効な設定値はそのまま保持する', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      zoomMin: 2,
      zoomMax: 24,
      gridInterval: 15,
      gridColor: '#123456',
      gridOpacity: 0.75,
      autoSaveInterval: 42,
      labelAreaThreshold: 0.25,
      customPalettes: ['海洋::#112244,#335577'],
    };

    expect(normalizeWorldSettings(settings)).toEqual(settings);
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

  it('customPalettesの長さだけが異なる場合も差分とみなす', () => {
    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      [createLayer()],
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      [createLayer()]
    )).toBe(false);

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      [createLayer()],
      DEFAULT_METADATA,
      {
        ...DEFAULT_SETTINGS,
        customPalettes: ['海洋::#112244,#335577'],
      },
      [createLayer()]
    )).toBe(true);
  });

  it('customPalettesの要素だけが異なる場合も差分とみなす', () => {
    const currentSettings = {
      ...DEFAULT_SETTINGS,
      customPalettes: ['海洋::#112244,#335577'],
    };
    const nextSettings = {
      ...DEFAULT_SETTINGS,
      customPalettes: ['砂漠::#c49b38,#7d5a18'],
    };

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      currentSettings,
      [createLayer()],
      DEFAULT_METADATA,
      nextSettings,
      [createLayer()]
    )).toBe(true);
  });

  it('空レイヤー配列同士は等価と判定する', () => {
    expect(areLayersEqual([], [])).toBe(true);
  });
});
