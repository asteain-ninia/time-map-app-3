import type { Layer } from '@domain/entities/Layer';
import {
  DEFAULT_SETTINGS,
  type BaseMapSettings,
  type WorldMetadata,
  type WorldSettings,
} from '@domain/entities/World';

export function normalizeWorldSettings(settings: WorldSettings): WorldSettings {
  const safeZoomMin = Number.isFinite(settings.zoomMin) ? settings.zoomMin : DEFAULT_SETTINGS.zoomMin;
  const safeZoomMax = Number.isFinite(settings.zoomMax) ? settings.zoomMax : DEFAULT_SETTINGS.zoomMax;
  const zoomMin = Math.max(0.1, Math.min(safeZoomMin, safeZoomMax));
  const zoomMax = Math.max(zoomMin, Math.max(safeZoomMin, safeZoomMax));

  return {
    ...settings,
    zoomMin,
    zoomMax,
    gridOpacity: Math.max(0, Math.min(1, settings.gridOpacity)),
    labelAreaThreshold: Math.max(0, settings.labelAreaThreshold),
    autoSaveInterval: Math.max(1, Math.round(settings.autoSaveInterval)),
    baseMap: normalizeBaseMapSettings(settings.baseMap),
  };
}

function normalizeBaseMapSettings(baseMap: BaseMapSettings): BaseMapSettings {
  if (baseMap.mode !== 'custom') {
    // bundled でも svgText を保持するのは .gimoza 展開後にアセットから注入された SVG を扱うため
    const svgText = typeof baseMap.svgText === 'string' ? baseMap.svgText : '';
    return {
      ...DEFAULT_SETTINGS.baseMap,
      svgText: svgText.trim() ? svgText : null,
    };
  }

  const svgText = typeof baseMap.svgText === 'string' ? baseMap.svgText : '';
  if (!svgText.trim()) {
    return { ...DEFAULT_SETTINGS.baseMap };
  }

  return {
    mode: 'custom',
    fileName: baseMap.fileName.trim() || DEFAULT_SETTINGS.baseMap.fileName,
    svgText,
  };
}

export function areLayersEqual(left: readonly Layer[], right: readonly Layer[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((layer, index) => {
    const other = right[index];
    return other !== undefined &&
      layer.id === other.id &&
      layer.name === other.name &&
      layer.order === other.order &&
      layer.visible === other.visible &&
      layer.opacity === other.opacity;
  });
}

export function hasProjectSettingsChanged(
  currentMetadata: WorldMetadata,
  currentSettings: WorldSettings,
  currentLayers: readonly Layer[],
  nextMetadata: WorldMetadata,
  nextSettings: WorldSettings,
  nextLayers: readonly Layer[]
): boolean {
  return currentMetadata.worldName !== nextMetadata.worldName ||
    currentMetadata.worldDescription !== nextMetadata.worldDescription ||
    currentMetadata.sliderMin !== nextMetadata.sliderMin ||
    currentMetadata.sliderMax !== nextMetadata.sliderMax ||
    currentSettings.zoomMin !== nextSettings.zoomMin ||
    currentSettings.zoomMax !== nextSettings.zoomMax ||
    currentSettings.gridInterval !== nextSettings.gridInterval ||
    currentSettings.gridColor !== nextSettings.gridColor ||
    currentSettings.gridOpacity !== nextSettings.gridOpacity ||
    currentSettings.autoSaveInterval !== nextSettings.autoSaveInterval ||
    currentSettings.equatorLength !== nextSettings.equatorLength ||
    currentSettings.oblateness !== nextSettings.oblateness ||
    currentSettings.labelAreaThreshold !== nextSettings.labelAreaThreshold ||
    currentSettings.defaultAutoColor !== nextSettings.defaultAutoColor ||
    currentSettings.defaultPalette !== nextSettings.defaultPalette ||
    currentSettings.customPalettes.length !== nextSettings.customPalettes.length ||
    currentSettings.customPalettes.some((palette, index) => palette !== nextSettings.customPalettes[index]) ||
    !areBaseMapsEqual(currentSettings.baseMap, nextSettings.baseMap) ||
    !areLayersEqual(currentLayers, nextLayers);
}

function areBaseMapsEqual(left: BaseMapSettings, right: BaseMapSettings): boolean {
  return left.mode === right.mode &&
    left.fileName === right.fileName &&
    left.svgText === right.svgText;
}
