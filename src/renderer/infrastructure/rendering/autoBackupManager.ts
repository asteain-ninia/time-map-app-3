/**
 * 自動バックアップマネージャー（純粋ユーティリティ）
 *
 * 要件定義書 §2.5.4:
 * - デフォルト5分間隔
 * - /savebackup/<保存ファイル名>/ 配下に保存
 * - 最大10世代保持
 * - タイムスタンプ付きファイル名
 */

const BACKUP_FILE_NAME_PATTERN = /^\d{8}-\d{6}-\d{3}(?:-\d+)?\.json$/;

/** バックアップ設定 */
export interface AutoBackupConfig {
  /** バックアップ間隔（ミリ秒） */
  readonly intervalMs: number;
  /** 保持する世代数 */
  readonly maxGenerations: number;
}

/** デフォルト設定：5分間隔、10世代 */
export const DEFAULT_BACKUP_CONFIG: AutoBackupConfig = {
  intervalMs: 5 * 60 * 1000,
  maxGenerations: 10,
};

/** 自動バックアップで使用するファイルI/O */
export interface BackupFilePort {
  writeFile(filePath: string, data: string): Promise<void>;
  listFiles(dirPath: string): Promise<readonly string[]>;
  deleteFile(filePath: string): Promise<void>;
  getAutoBackupRootPath(): Promise<string>;
}

function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/';
}

function joinPath(basePath: string, childPath: string): string {
  if (basePath.length === 0) return childPath;
  if (basePath.endsWith('/') || basePath.endsWith('\\')) {
    return `${basePath}${childPath}`;
  }
  return `${basePath}${getPathSeparator(basePath)}${childPath}`;
}

/**
 * バックアップ対象サブフォルダ名を取得する
 * 例: /path/to/world.json -> world.json
 */
export function getBackupDirectoryName(originalPath: string): string {
  const parts = originalPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? originalPath;
}

/**
 * savebackup 配下のバックアップ用ディレクトリを生成する
 */
export function buildBackupDirectoryPath(
  backupRootPath: string,
  originalPath: string
): string {
  return joinPath(backupRootPath, getBackupDirectoryName(originalPath));
}

/**
 * UTCベースのバックアップ用タイムスタンプを生成する
 * 例: 20260331-102530-123
 */
export function createBackupTimestamp(date: Date = new Date()): string {
  const pad = (value: number, digits: number): string =>
    value.toString().padStart(digits, '0');

  return [
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`,
    `${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}`,
    pad(date.getUTCMilliseconds(), 3),
  ].join('-');
}

/**
 * バックアップファイル名を生成する
 * 例: 20260331-102530-123.json
 * 重複時: 20260331-102530-123-1.json
 */
export function getBackupFileName(
  timestamp: string,
  duplicateIndex: number = 0
): string {
  return duplicateIndex === 0
    ? `${timestamp}.json`
    : `${timestamp}-${duplicateIndex}.json`;
}

/**
 * 保持上限を超えた古いバックアップを返す
 */
export function getBackupFilesToDelete(
  fileNames: readonly string[],
  maxGenerations: number
): string[] {
  const sortedBackupFiles = [...fileNames]
    .filter((fileName) => BACKUP_FILE_NAME_PATTERN.test(fileName))
    .sort((left, right) => left.localeCompare(right));

  const overflowCount = sortedBackupFiles.length - maxGenerations;
  return overflowCount > 0
    ? sortedBackupFiles.slice(0, overflowCount)
    : [];
}

/**
 * 要件定義書 §2.5.4 準拠の自動バックアップを1件作成する
 */
export async function createAutoBackup(
  originalPath: string,
  data: string,
  maxGenerations: number,
  filePort: BackupFilePort,
  now: Date = new Date()
): Promise<string> {
  const backupRootPath = await filePort.getAutoBackupRootPath();
  const backupDirectoryPath = buildBackupDirectoryPath(
    backupRootPath,
    originalPath
  );
  const existingFileNames = await filePort.listFiles(backupDirectoryPath);

  const timestamp = createBackupTimestamp(now);
  let duplicateIndex = 0;
  let backupFileName = getBackupFileName(timestamp, duplicateIndex);
  while (existingFileNames.includes(backupFileName)) {
    duplicateIndex += 1;
    backupFileName = getBackupFileName(timestamp, duplicateIndex);
  }

  const backupFilePath = joinPath(backupDirectoryPath, backupFileName);
  await filePort.writeFile(backupFilePath, data);

  const filesToDelete = getBackupFilesToDelete(
    [...existingFileNames, backupFileName],
    maxGenerations
  );

  for (const fileName of filesToDelete) {
    await filePort.deleteFile(joinPath(backupDirectoryPath, fileName));
  }

  return backupFilePath;
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
