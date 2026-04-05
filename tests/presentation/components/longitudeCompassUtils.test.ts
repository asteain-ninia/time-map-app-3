import { describe, expect, it } from 'vitest';
import {
  getCenterLongitudeFractionDigits,
  getJumpStep,
  getLabelEvery,
  getTickStep,
  getVisibleSpan,
  pickNearestNiceStep,
} from '@presentation/components/longitudeCompassUtils';

describe('longitudeCompassUtils', () => {
  it('ズームに応じて中心経度の表示桁数を増やす', () => {
    expect(getCenterLongitudeFractionDigits(1)).toBe(0);
    expect(getCenterLongitudeFractionDigits(4)).toBe(2);
    expect(getCenterLongitudeFractionDigits(16)).toBe(4);
    expect(getCenterLongitudeFractionDigits(128)).toBe(6);
  });

  it('可視スパンとボタン移動量をズームに応じて狭くする', () => {
    expect(getVisibleSpan(1)).toBe(180);
    expect(getVisibleSpan(16)).toBe(67.5);
    expect(getVisibleSpan(64)).toBe(24);

    expect(getJumpStep(1)).toBe(20);
    expect(getJumpStep(8)).toBe(10);
    expect(getJumpStep(16)).toBe(5);
    expect(getJumpStep(32)).toBe(2);
  });

  it('目盛り刻みもズームと表示桁数に応じて細かくする', () => {
    expect(getTickStep(1)).toBe(20);
    expect(getTickStep(4)).toBe(5);
    expect(getTickStep(16)).toBe(1);
    expect(getTickStep(64)).toBe(0.2);
    expect(getLabelEvery(1)).toBe(2);
    expect(getLabelEvery(16)).toBe(6);
  });

  it('nice step は同距離なら小さい候補を優先する', () => {
    expect(pickNearestNiceStep(15)).toBe(10);
  });
});
