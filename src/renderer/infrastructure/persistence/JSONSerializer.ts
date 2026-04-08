/**
 * JSONシリアライザ
 * §4.2: World ↔ JSON変換。ファイルスキーマに準拠。
 * §2.5: 保存時はバージョンフィールド必須、読み込み時はバージョン検証。
 */

import { World } from '@domain/entities/World';
import { SerializationError } from './jsonSerializerErrors';
import { deserializeJsonWorld, serializeWorldToJson } from './jsonSerializerTransforms';
import { SUPPORTED_VERSION, type JsonWorld } from './jsonSerializerTypes';
import { validateJsonWorld } from './jsonSerializerValidation';

export { SerializationError } from './jsonSerializerErrors';

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
  let json: JsonWorld;
  try {
    json = JSON.parse(jsonString) as JsonWorld;
  } catch {
    throw new SerializationError('Invalid JSON format');
  }

  if (!json.version) {
    throw new SerializationError('Missing version field');
  }
  if (json.version !== SUPPORTED_VERSION) {
    throw new SerializationError(
      `Unsupported version "${json.version}" (expected "${SUPPORTED_VERSION}")`
    );
  }

  const errors = validateJsonWorld(json);
  if (errors.length > 0) {
    throw new SerializationError(`Data validation failed:\n${errors.join('\n')}`);
  }

  return deserializeJsonWorld(json);
}
