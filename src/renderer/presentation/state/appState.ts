/**
 * アプリケーション全体で共有する状態
 *
 * 各ユースケースのシングルトンインスタンスを提供する。
 * コンポーネント内で個別にインスタンスを作成する代わりに、
 * ここから取得することで状態の一貫性を保つ。
 */

import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';

export const manageLayers = new ManageLayersUseCase();
export const navigateTime = new NavigateTimeUseCase();
export const addFeature = new AddFeatureUseCase();

/** 選択中の地物ID */
export let selectedFeatureId: string | null = null;

export function setSelectedFeatureId(id: string | null): void {
  selectedFeatureId = id;
}
