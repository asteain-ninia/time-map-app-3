/**
 * 測量モード状態管理ユーティリティ
 *
 * §2.1: 測量モード — 2点間距離計算・表示
 *
 * ピュア関数で状態を管理し、テスタビリティを確保する。
 */

import type { Coordinate } from '@domain/value-objects/Coordinate';
import {
  calculateDistance,
  formatCoordinate,
  greatCirclePath,
  type DistanceResult,
  type CoordinateDisplay,
  type PlanetParams,
  DEFAULT_PLANET,
} from '@domain/services/SurveyService';

/** 測量モードの状態 */
export interface SurveyModeState {
  /** 始点（null = 未設定） */
  readonly pointA: Coordinate | null;
  /** 終点（null = 未設定） */
  readonly pointB: Coordinate | null;
  /** 惑星パラメータ */
  readonly planet: PlanetParams;
}

/** 測量結果 */
export interface SurveyResult {
  /** 始点の座標表示 */
  readonly displayA: CoordinateDisplay;
  /** 終点の座標表示 */
  readonly displayB: CoordinateDisplay;
  /** 距離計算結果 */
  readonly distance: DistanceResult;
  /** 大円パスの中間点群（SVG描画用） */
  readonly greatCirclePoints: readonly { lon: number; lat: number }[];
}

/** 初期状態を作成する */
export function createSurveyState(planet: PlanetParams = DEFAULT_PLANET): SurveyModeState {
  return { pointA: null, pointB: null, planet };
}

/**
 * クリックで点を設定する
 *
 * - 始点未設定 → 始点を設定
 * - 始点設定済み・終点未設定 → 終点を設定
 * - 両方設定済み → リセットして始点を設定
 */
export function addSurveyPoint(state: SurveyModeState, coord: Coordinate): SurveyModeState {
  if (state.pointA === null) {
    return { ...state, pointA: coord };
  }
  if (state.pointB === null) {
    return { ...state, pointB: coord };
  }
  // 両方設定済み → リセットして新しい始点
  return { ...state, pointA: coord, pointB: null };
}

/** 測量状態をリセットする */
export function resetSurvey(state: SurveyModeState): SurveyModeState {
  return { ...state, pointA: null, pointB: null };
}

/** 2点が揃っているか */
export function hasTwoPoints(state: SurveyModeState): boolean {
  return state.pointA !== null && state.pointB !== null;
}

/** 測量結果を計算する（2点が揃っている場合のみ） */
export function computeSurveyResult(state: SurveyModeState): SurveyResult | null {
  if (!state.pointA || !state.pointB) return null;

  const lonA = state.pointA.x;
  const latA = state.pointA.y;
  const lonB = state.pointB.x;
  const latB = state.pointB.y;

  return {
    displayA: formatCoordinate(lonA, latA),
    displayB: formatCoordinate(lonB, latB),
    distance: calculateDistance(lonA, latA, lonB, latB, state.planet),
    greatCirclePoints: greatCirclePath(lonA, latA, lonB, latB, 50),
  };
}
