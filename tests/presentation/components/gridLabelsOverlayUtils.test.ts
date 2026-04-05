import { describe, expect, it } from 'vitest';
import {
  buildVisibleLatitudeLabels,
  buildVisibleLongitudeLabels,
  type GridOverlayViewBox,
} from '@presentation/components/gridLabelsOverlayUtils';

describe('gridLabelsOverlayUtils', () => {
  it('横方向にスクロールしても可視範囲ベースで経度ラベルを返す', () => {
    const viewBox: GridOverlayViewBox = {
      x: 360,
      y: 0,
      width: 360,
      height: 180,
    };

    const labels = buildVisibleLongitudeLabels(viewBox, 720, 10);

    expect(labels.some((label) => label.text === '0°')).toBe(true);
    expect(labels.some((label) => label.text === '180°')).toBe(true);
    expect(labels.every((label) => label.px >= 0 && label.px <= 720)).toBe(true);
  });

  it('可視範囲に含まれる緯度ラベルだけを返す', () => {
    const viewBox: GridOverlayViewBox = {
      x: 0,
      y: 45,
      width: 360,
      height: 90,
    };

    const labels = buildVisibleLatitudeLabels(viewBox, 360, 10);

    expect(labels.some((label) => label.text === '0°')).toBe(true);
    expect(labels.some((label) => label.text === '30°N')).toBe(true);
    expect(labels.some((label) => label.text === '30°S')).toBe(true);
    expect(labels.every((label) => label.px >= 0 && label.px <= 360)).toBe(true);
  });

  it('不正な引数には空配列を返す', () => {
    const viewBox: GridOverlayViewBox = { x: 0, y: 0, width: 360, height: 180 };

    expect(buildVisibleLongitudeLabels(viewBox, 720, 0)).toEqual([]);
    expect(buildVisibleLongitudeLabels(viewBox, 720, -5)).toEqual([]);
    expect(buildVisibleLongitudeLabels(viewBox, 0, 10)).toEqual([]);

    expect(buildVisibleLatitudeLabels(viewBox, 360, 0)).toEqual([]);
    expect(buildVisibleLatitudeLabels(viewBox, 360, -5)).toEqual([]);
    expect(buildVisibleLatitudeLabels(viewBox, 0, 10)).toEqual([]);
  });

  it('経度ラベルに東西方向の接尾辞がつく', () => {
    const viewBox: GridOverlayViewBox = { x: 0, y: 0, width: 360, height: 180 };
    const labels = buildVisibleLongitudeLabels(viewBox, 720, 30);

    const texts = labels.map((l) => l.text);
    expect(texts).toContain('0°');
    expect(texts).toContain('180°');
    expect(texts.some((t) => t.endsWith('E'))).toBe(true);
    expect(texts.some((t) => t.endsWith('W'))).toBe(true);
  });

  it('緯度ラベルに南北方向の接尾辞がつく', () => {
    const viewBox: GridOverlayViewBox = { x: 0, y: 0, width: 360, height: 180 };
    const labels = buildVisibleLatitudeLabels(viewBox, 360, 30);

    const texts = labels.map((l) => l.text);
    expect(texts).toContain('0°');
    expect(texts.some((t) => t.endsWith('N'))).toBe(true);
    expect(texts.some((t) => t.endsWith('S'))).toBe(true);
  });

  it('viewBoxが全体表示のとき90°N/Sの緯度ラベルを含む', () => {
    const viewBox: GridOverlayViewBox = { x: 0, y: 0, width: 360, height: 180 };
    const labels = buildVisibleLatitudeLabels(viewBox, 360, 30);
    const texts = labels.map((l) => l.text);
    expect(texts).toContain('90°N');
    expect(texts).toContain('90°S');
  });
});
