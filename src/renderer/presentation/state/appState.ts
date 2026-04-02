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
import { SaveLoadUseCase } from '@application/SaveLoadUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UpdateFeatureAnchorUseCase } from '@application/UpdateFeatureAnchorUseCase';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { ConfigManager } from '@infrastructure/ConfigManager';
import { JSONWorldRepository, createElectronFileSystem } from '@infrastructure/persistence/JSONWorldRepository';

export const manageLayers = new ManageLayersUseCase();
export const navigateTime = new NavigateTimeUseCase();
export const addFeature = new AddFeatureUseCase();
export const deleteFeature = new DeleteFeatureUseCase(addFeature);

const repository = new JSONWorldRepository(createElectronFileSystem());
const dialog = {
  showOpenDialog: () => window.api.showOpenDialog(),
  showSaveDialog: () => window.api.showSaveDialog(),
};
export const saveLoad = new SaveLoadUseCase(repository, dialog, addFeature, manageLayers, navigateTime);
export const vertexEdit = new VertexEditUseCase(addFeature);
export const anchorEdit = new UpdateFeatureAnchorUseCase(addFeature);
export const undoRedo = new UndoRedoManager();
export const configManager = new ConfigManager();

/** 選択中の地物ID */
export let selectedFeatureId: string | null = null;

export function setSelectedFeatureId(id: string | null): void {
  selectedFeatureId = id;
}
