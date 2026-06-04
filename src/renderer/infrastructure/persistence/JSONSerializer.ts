/**
 * JSONシリアライザ
 * §4.2: World ↔ JSON変換。ファイルスキーマに準拠。
 * §2.5: 保存時はバージョンフィールド必須、読み込み時はバージョン検証。
 */

import { World } from '@domain/entities/World';
import { SerializationError } from './jsonSerializerErrors';
import { migrateJsonWorld } from './jsonSerializerMigration';
import { deserializeJsonWorld, serializeWorldToJson } from './jsonSerializerTransforms';
import type { JsonWorld } from './jsonSerializerTypes';
import { validateJsonWorld } from './jsonSerializerValidation';
import { validateParentChildUnion } from './worldValidation';

export { SerializationError } from './jsonSerializerErrors';

export interface DeserializeWorldResult {
  readonly world: World;
  readonly compatibilityWarnings: readonly string[];
}

/**
 * WorldをJSON文字列にシリアライズする
 */
export function serialize(world: World): string {
  return JSON.stringify(serializeWorldToJson(world), null, 2);
}

/**
 * JSON文字列からWorldをデシリアライズする
 * §2.5.2: バージョン検証、データ整合性検証を行う
 *
 * @throws SerializationError バージョン不一致、データ不整合時
 */
export function deserialize(jsonString: string): World {
  return deserializeWithReport(jsonString).world;
}

/**
 * JSON文字列からWorldを復元し、旧形式から補完した差分警告も返す
 */
export function deserializeWithReport(jsonString: string): DeserializeWorldResult {
  try {
    const raw = JSON.parse(jsonString) as unknown;
    const migration = migrateJsonWorld(raw);
    const json: JsonWorld = migration.json;

    const errors = validateJsonWorld(json);
    if (errors.length > 0) {
      throw new SerializationError(`Data validation failed:\n${errors.join('\n')}`);
    }

    const world = deserializeJsonWorld(json);

    // 親 ≡ 子の和（厳密一致）はドメインの形状導出サービスを再利用するため、
    // 構造的検証が通った後のドメインオブジェクトに対して検証する（§2.5.2 line 939）。
    const domainErrors = validateParentChildUnion(world);
    if (domainErrors.length > 0) {
      throw new SerializationError(`Data validation failed:\n${domainErrors.join('\n')}`);
    }

    return {
      world,
      compatibilityWarnings: migration.compatibilityWarnings,
    };
  } catch (error) {
    if (isSerializationError(error)) {
      throw error;
    }
    throw new SerializationError('Invalid JSON format');
  }
}

function isSerializationError(error: unknown): error is SerializationError {
  return error instanceof SerializationError;
}
