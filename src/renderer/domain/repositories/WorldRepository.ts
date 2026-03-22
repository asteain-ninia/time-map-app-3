import type { World } from '../entities/World';

/**
 * World永続化リポジトリインターフェース
 * §5.4: インフラストラクチャ層がこのインターフェースを実装する
 */
export interface WorldRepository {
  /** ファイルからWorldを読み込む */
  load(filePath: string): Promise<World>;

  /** WorldをJSONファイルに保存する */
  save(filePath: string, world: World): Promise<void>;
}
