import { describe, expect, it } from 'vitest';
import {
  DEFAULT_METADATA,
  DEFAULT_SETTINGS,
} from '@domain/entities/World';
import {
  hasProjectSettingsChanged,
  normalizeWorldSettings,
} from '@presentation/app/appProjectSettings';

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

  it('有効なカスタムベースマップを保持する', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      baseMap: {
        mode: 'custom' as const,
        fileName: 'world.svg',
        svgText: '<svg viewBox="0 0 360 180"><path d="M0 0" /></svg>',
      },
    };

    expect(normalizeWorldSettings(settings).baseMap).toEqual(settings.baseMap);
  });

  it('空のカスタムベースマップはプリセットへ戻す', () => {
    const normalized = normalizeWorldSettings({
      ...DEFAULT_SETTINGS,
      baseMap: {
        mode: 'custom',
        fileName: 'empty.svg',
        svgText: '',
      },
    });

    expect(normalized.baseMap).toEqual(DEFAULT_SETTINGS.baseMap);
  });

  it('gimoza由来の埋め込みプリセットベースマップを保持する', () => {
    const svgText = '<svg viewBox="0 0 360 180"></svg>';
    const normalized = normalizeWorldSettings({
      ...DEFAULT_SETTINGS,
      baseMap: {
        mode: 'bundled',
        fileName: 'base-map.svg',
        svgText,
      },
    });

    expect(normalized.baseMap.svgText).toBe(svgText);
  });

  it('メタデータ・設定の差分を検出する', () => {
    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      DEFAULT_METADATA,
      DEFAULT_SETTINGS
    )).toBe(false);

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      {
        ...DEFAULT_METADATA,
        worldName: '別世界',
      },
      {
        ...DEFAULT_SETTINGS,
        zoomMax: 64,
      }
    )).toBe(true);
  });

  it('customPalettesの長さだけが異なる場合も差分とみなす', () => {
    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      DEFAULT_METADATA,
      DEFAULT_SETTINGS
    )).toBe(false);

    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      DEFAULT_METADATA,
      {
        ...DEFAULT_SETTINGS,
        customPalettes: ['海洋::#112244,#335577'],
      }
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
      DEFAULT_METADATA,
      nextSettings
    )).toBe(true);
  });

  it('ベースマップの差分を検出する', () => {
    expect(hasProjectSettingsChanged(
      DEFAULT_METADATA,
      DEFAULT_SETTINGS,
      DEFAULT_METADATA,
      {
        ...DEFAULT_SETTINGS,
        baseMap: {
          mode: 'custom',
          fileName: 'world.svg',
          svgText: '<svg viewBox="0 0 360 180"></svg>',
        },
      }
    )).toBe(true);
  });
});
