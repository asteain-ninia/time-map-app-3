import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  createStoredZip,
  crc32,
  decodeUtf8,
  encodeUtf8,
  readStoredZipEntries,
} from '@infrastructure/persistence/zipArchive';

describe('zipArchive', () => {
  it('CRC32を計算する', () => {
    expect(crc32(encodeUtf8('123456789')).toString(16)).toBe('cbf43926');
  });

  it('無圧縮ZIPを作成して読み戻せる', () => {
    const zip = createStoredZip([
      { name: 'project.json', data: encodeUtf8('{"version":"1.0.0"}') },
      { name: 'assets/base-map.svg', data: encodeUtf8('<svg />') },
    ]);

    const entries = readStoredZipEntries(zip);

    expect(entries.map((entry) => entry.name)).toEqual([
      'project.json',
      'assets/base-map.svg',
    ]);
    expect(decodeUtf8(entries[0].data)).toBe('{"version":"1.0.0"}');
    expect(decodeUtf8(entries[1].data)).toBe('<svg />');
  });

  it('base64へ変換して戻せる', () => {
    const bytes = encodeUtf8('gimoza');

    expect(decodeUtf8(base64ToBytes(bytesToBase64(bytes)))).toBe('gimoza');
  });
});
