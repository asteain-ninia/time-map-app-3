/**
 * 自動バックアップマネージャー（純粋ユーティリティ）
 *
 * §2.5: 5分間隔、5世代のローテーションバックアップ。
 * バックアップファイル名の生成とローテーション管理を行う。
 */

/** バックアップ設定 */
export interface AutoBackupConfig {
  /** バックアップ間隔（ミリ秒） */
  readonly intervalMs: number;
  /** 保持する世代数 */
  readonly maxGenerations: number;
}

/** デフォルト設定：5分間隔、5世代 */
export const DEFAULT_BACKUP_CONFIG: AutoBackupConfig = {
  intervalMs: 5 * 60 * 1000,
  maxGenerations: 5,
};

/** 自動バックアップで使用するファイルI/O */
export interface BackupFilePort {
  existsFile(filePath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
}

/**
 * バックアップファイル名を生成する
 * 元ファイル: /path/to/file.json → /path/to/file.backup-1.json
 */
export function getBackupFileName(
  originalPath: string,
  generation: number
): string {
  const dotIndex = originalPath.lastIndexOf('.');
  if (dotIndex === -1) {
    return `${originalPath}.backup-${generation}`;
  }
  const base = originalPath.substring(0, dotIndex);
  const ext = originalPath.substring(dotIndex);
  return `${base}.backup-${generation}${ext}`;
}

/**
 * ローテーション対象の世代番号リストを取得する（古い順）
 * generation 1が最新、maxGenerationsが最古。
 * ローテーション時は maxGenerations → 削除, N → N+1 へリネーム, 1 に新規保存。
 */
export function getRotationPlan(
  maxGenerations: number
): Array<{ from: number; to: number }> {
  const plan: Array<{ from: number; to: number }> = [];
  // 古い方から順にシフト（最古は削除されるので含まない）
  for (let i = maxGenerations - 1; i >= 1; i--) {
    plan.push({ from: i, to: i + 1 });
  }
  return plan;
}

/**
 * 既存バックアップのみをローテーションする
 *
 * 未生成世代に対する readFile を防ぎ、IPC handler の ENOENT ログを出さない。
 */
export async function rotateBackupFiles(
  originalPath: string,
  maxGenerations: number,
  filePort: BackupFilePort
): Promise<void> {
  const plan = getRotationPlan(maxGenerations);

  for (const { from, to } of plan) {
    const fromPath = getBackupFileName(originalPath, from);
    if (!(await filePort.existsFile(fromPath))) continue;

    const content = await filePort.readFile(fromPath);
    await filePort.writeFile(getBackupFileName(originalPath, to), content);
  }
}

/**
 * 次のバックアップが必要かどうかを判定する
 */
export function shouldBackup(
  lastBackupTime: number,
  currentTime: number,
  intervalMs: number
): boolean {
  return currentTime - lastBackupTime >= intervalMs;
}
