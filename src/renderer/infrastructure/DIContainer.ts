/**
 * 依存性注入コンテナ
 *
 * 技術方針§2.2: 全サービスの初期化を一元管理
 *
 * アプリケーション内の全UseCase/サービスの生成と依存関係解決を担う。
 * 手動DIパターン（Pure DI）を採用。フレームワーク不使用。
 */

import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { VertexEditUseCase } from '@application/VertexEditUseCase';
import { UpdateFeatureAnchorUseCase } from '@application/UpdateFeatureAnchorUseCase';
import { EditFeatureUseCase } from '@application/EditFeatureUseCase';
import { DeleteFeatureUseCase } from '@application/DeleteFeatureUseCase';
import { NavigateTimeUseCase } from '@application/NavigateTimeUseCase';
import { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import { UndoRedoManager } from '@application/UndoRedoManager';
import { PrepareFeatureAnchorEditUseCase } from '@application/PrepareFeatureAnchorEditUseCase';
import { ResolveFeatureAnchorConflictsUseCase } from '@application/ResolveFeatureAnchorConflictsUseCase';
import { CommitFeatureAnchorEditUseCase } from '@application/CommitFeatureAnchorEditUseCase';
import { ConfigManager } from './ConfigManager';

/**
 * DIコンテナ — 全サービスを初期化し、シングルトンとして提供する
 */
export class DIContainer {
  // アプリケーション層
  readonly addFeature: AddFeatureUseCase;
  readonly vertexEdit: VertexEditUseCase;
  readonly anchorEdit: UpdateFeatureAnchorUseCase;
  readonly editFeature: EditFeatureUseCase;
  readonly deleteFeature: DeleteFeatureUseCase;
  readonly navigateTime: NavigateTimeUseCase;
  readonly manageLayers: ManageLayersUseCase;
  readonly undoRedo: UndoRedoManager;
  readonly prepareAnchorEdit: PrepareFeatureAnchorEditUseCase;
  readonly resolveConflicts: ResolveFeatureAnchorConflictsUseCase;
  readonly commitAnchorEdit: CommitFeatureAnchorEditUseCase;

  // インフラ層
  readonly configManager: ConfigManager;

  constructor() {
    // インフラ層
    this.configManager = new ConfigManager();

    // アプリケーション層 — 依存順に生成
    this.addFeature = new AddFeatureUseCase();
    this.vertexEdit = new VertexEditUseCase(this.addFeature);
    this.anchorEdit = new UpdateFeatureAnchorUseCase(this.addFeature);
    this.editFeature = new EditFeatureUseCase(
      this.addFeature, this.vertexEdit, this.anchorEdit
    );
    this.deleteFeature = new DeleteFeatureUseCase(this.addFeature);
    this.navigateTime = new NavigateTimeUseCase();
    this.manageLayers = new ManageLayersUseCase();
    this.undoRedo = new UndoRedoManager();
    this.prepareAnchorEdit = new PrepareFeatureAnchorEditUseCase(this.addFeature);
    this.resolveConflicts = new ResolveFeatureAnchorConflictsUseCase(
      this.addFeature, this.prepareAnchorEdit
    );
    this.commitAnchorEdit = new CommitFeatureAnchorEditUseCase(
      this.addFeature, this.prepareAnchorEdit
    );
  }
}

/** シングルトンインスタンス */
let _instance: DIContainer | null = null;

/**
 * DIコンテナのシングルトンインスタンスを取得する
 */
export function getContainer(): DIContainer {
  if (!_instance) {
    _instance = new DIContainer();
  }
  return _instance;
}

/**
 * DIコンテナをリセットする（テスト用）
 */
export function resetContainer(): void {
  _instance = null;
}
