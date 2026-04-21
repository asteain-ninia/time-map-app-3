import type { World } from '../entities/World';

export interface LoadWorldResult {
  readonly world: World;
  readonly compatibilityWarnings: readonly string[];
}

/**
 * World永続化リポジトリインターフェース
 * §5.4: インフラストラクチャ層がこのインターフェースを実装する
 */
export interface WorldRepository {
  /** ファイルからWorldを読み込む */
  load(filePath: string): Promise<World>;

  /** ファイルからWorldを読み込み、互換性警告も返す */
  loadWithReport?(filePath: string): Promise<LoadWorldResult>;

  /** WorldをJSONファイルに保存する */
  save(filePath: string, world: World): Promise<void>;
}
