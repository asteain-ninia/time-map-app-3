import { describe, it, expect } from 'vitest';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  createSurveyState,
  addSurveyPoint,
  resetSurvey,
  hasTwoPoints,
  computeSurveyResult,
  type SurveyModeState,
} from '@infrastructure/rendering/surveyModeManager';
import { DEFAULT_PLANET } from '@domain/services/SurveyService';

describe('surveyModeManager', () => {
  const coordA = new Coordinate(139.7671, 35.6812); // 東京
  const coordB = new Coordinate(-0.1276, 51.5074);  // ロンドン

  describe('createSurveyState', () => {
    it('初期状態は両方null', () => {
      const state = createSurveyState();
      expect(state.pointA).toBeNull();
      expect(state.pointB).toBeNull();
      expect(state.planet).toBe(DEFAULT_PLANET);
    });

    it('惑星パラメータを指定できる', () => {
      const planet = { equatorLength: 20000, oblateness: 0 };
      const state = createSurveyState(planet);
      expect(state.planet).toBe(planet);
    });
  });

  describe('addSurveyPoint', () => {
    it('始点未設定 → 始点を設定', () => {
      const state = createSurveyState();
      const next = addSurveyPoint(state, coordA);
      expect(next.pointA).toBe(coordA);
      expect(next.pointB).toBeNull();
    });

    it('始点設定済み → 終点を設定', () => {
      let state = createSurveyState();
      state = addSurveyPoint(state, coordA);
      const next = addSurveyPoint(state, coordB);
      expect(next.pointA).toBe(coordA);
      expect(next.pointB).toBe(coordB);
    });

    it('両方設定済み → リセットして新しい始点', () => {
      let state = createSurveyState();
      state = addSurveyPoint(state, coordA);
      state = addSurveyPoint(state, coordB);
      const newCoord = new Coordinate(0, 0);
      const next = addSurveyPoint(state, newCoord);
      expect(next.pointA).toBe(newCoord);
      expect(next.pointB).toBeNull();
    });

    it('イミュータブル: 元の状態は変化しない', () => {
      const state = createSurveyState();
      const next = addSurveyPoint(state, coordA);
      expect(state.pointA).toBeNull();
      expect(next.pointA).toBe(coordA);
    });
  });

  describe('resetSurvey', () => {
    it('状態をリセットする', () => {
      let state = createSurveyState();
      state = addSurveyPoint(state, coordA);
      state = addSurveyPoint(state, coordB);
      const reset = resetSurvey(state);
      expect(reset.pointA).toBeNull();
      expect(reset.pointB).toBeNull();
      expect(reset.planet).toBe(state.planet);
    });
  });

  describe('hasTwoPoints', () => {
    it('0点: false', () => {
      expect(hasTwoPoints(createSurveyState())).toBe(false);
    });

    it('1点: false', () => {
      const state = addSurveyPoint(createSurveyState(), coordA);
      expect(hasTwoPoints(state)).toBe(false);
    });

    it('2点: true', () => {
      let state = addSurveyPoint(createSurveyState(), coordA);
      state = addSurveyPoint(state, coordB);
      expect(hasTwoPoints(state)).toBe(true);
    });
  });

  describe('computeSurveyResult', () => {
    it('2点未満ではnull', () => {
      expect(computeSurveyResult(createSurveyState())).toBeNull();
      expect(computeSurveyResult(addSurveyPoint(createSurveyState(), coordA))).toBeNull();
    });

    it('2点揃ったら結果を返す', () => {
      let state = addSurveyPoint(createSurveyState(), coordA);
      state = addSurveyPoint(state, coordB);
      const result = computeSurveyResult(state);
      expect(result).not.toBeNull();
      expect(result!.distance.greatCircleKm).toBeGreaterThan(0);
      expect(result!.distance.equirectangularKm).toBeGreaterThan(0);
      expect(result!.greatCirclePoints.length).toBeGreaterThan(0);
    });

    it('座標表示が含まれる', () => {
      let state = addSurveyPoint(createSurveyState(), coordA);
      state = addSurveyPoint(state, coordB);
      const result = computeSurveyResult(state)!;
      expect(result.displayA.lat).toBeCloseTo(35.6812, 3);
      expect(result.displayA.lon).toBeCloseTo(139.7671, 3);
      expect(result.displayB.lat).toBeCloseTo(51.5074, 3);
    });

    it('大円パスは始点と終点を含む', () => {
      let state = addSurveyPoint(createSurveyState(), coordA);
      state = addSurveyPoint(state, coordB);
      const result = computeSurveyResult(state)!;
      const first = result.greatCirclePoints[0];
      const last = result.greatCirclePoints[result.greatCirclePoints.length - 1];
      expect(first.lon).toBeCloseTo(coordA.x, 1);
      expect(first.lat).toBeCloseTo(coordA.y, 1);
      expect(last.lon).toBeCloseTo(coordB.x, 1);
      expect(last.lat).toBeCloseTo(coordB.y, 1);
    });

    it('東京-ロンドン間は約9500km', () => {
      let state = addSurveyPoint(createSurveyState(), coordA);
      state = addSurveyPoint(state, coordB);
      const result = computeSurveyResult(state)!;
      expect(result.distance.greatCircleKm).toBeGreaterThan(9000);
      expect(result.distance.greatCircleKm).toBeLessThan(10000);
    });
  });
});
