import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';

export interface PathCoordinate {
  readonly x: number;
  readonly y: number;
}

/** 経度 → SVG x座標 */
export function geoToSvgX(lon: number): number {
  return lon + 180;
}

/** 経度を主表示帯（-180〜180）へ折り返す */
export function wrapLongitudeToPrimaryRange(lon: number): number {
  let wrapped = lon;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

/** 単一点の経度を主表示帯に折り返したSVG x座標 */
export function geoToWrappedSvgX(lon: number): number {
  return geoToSvgX(wrapLongitudeToPrimaryRange(lon));
}

/** 緯度 → SVG y座標 */
export function geoToSvgY(lat: number): number {
  return 90 - lat;
}

/**
 * 経度を参照値に最も近い周回へ寄せる。
 * 例: -170 を 175 に近い周回へ寄せると 190 になる。
 */
export function wrapLongitudeNearReference(lon: number, referenceLon: number): number {
  let adjusted = lon;
  while (adjusted - referenceLon > 180) adjusted -= 360;
  while (adjusted - referenceLon < -180) adjusted += 360;
  return adjusted;
}

/** 経度列を連続した経路になるようアンラップする */
export function unwrapLongitudeSequence(longitudes: readonly number[]): number[] {
  if (longitudes.length === 0) return [];

  const unwrapped = [longitudes[0]];
  for (let i = 1; i < longitudes.length; i++) {
    unwrapped.push(wrapLongitudeNearReference(longitudes[i], unwrapped[i - 1]));
  }
  return unwrapped;
}

/**
 * 連続化済み経度列を参照値に近い周回へまとめて平行移動する。
 * 主に穴リングや複数パスを同じラップに揃える用途。
 */
export function shiftLongitudeSequenceNearReference(
  longitudes: readonly number[],
  referenceLon: number
): number[] {
  if (longitudes.length === 0) return [];
  const shift = wrapLongitudeNearReference(longitudes[0], referenceLon) - longitudes[0];
  return longitudes.map((lon) => lon + shift);
}

/** 連続化済み経度列を主表示帯へ寄せる */
export function shiftLongitudeSequenceToPrimaryRange(longitudes: readonly number[]): number[] {
  if (longitudes.length === 0) return [];
  return shiftLongitudeSequenceNearReference(
    longitudes,
    wrapLongitudeToPrimaryRange(longitudes[0])
  );
}

/** 頂点IDリストからSVGパス文字列を生成（閉じたリング用） */
export function buildRingPath(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): string {
  const coords: Array<{ lon: number; lat: number }> = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) {
      coords.push({ lon: v.x, lat: v.y });
    }
  }
  if (coords.length < 3) return '';

  const points = coords.map((coord) => ({
    x: geoToSvgX(coord.lon),
    y: geoToSvgY(coord.lat),
  }));

  return (
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
      .join(' ') + ' Z'
  );
}

export function buildRingPathFromCoords(coords: readonly PathCoordinate[]): string {
  if (coords.length < 3) return '';

  return (
    coords
      .map((coord, index) =>
        `${index === 0 ? 'M' : 'L'}${geoToSvgX(coord.x)} ${geoToSvgY(coord.y)}`
      )
      .join(' ') + ' Z'
  );
}

/** ポリゴンの全リングを結合したSVGパス文字列を生成（fill-rule="evenodd"用） */
export function buildPolygonPath(
  shape: FeatureShape & { type: 'Polygon' },
  vertices: ReadonlyMap<string, Vertex>
): string {
  const paths: string[] = [];

  for (const ring of shape.rings) {
    const path = buildRingPath(ring.vertexIds, vertices);
    if (!path) continue;

    paths.push(path);
  }

  return paths.join(' ');
}

export function buildPolygonPathFromCoords(
  rings: readonly (readonly PathCoordinate[])[]
): string {
  return rings
    .map((ring) => buildRingPathFromCoords(ring))
    .filter((path) => path.length > 0)
    .join(' ');
}

/** ラインストリングのSVGポリライン用ポイント文字列を生成 */
export function buildLinePoints(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): string {
  const coords: Array<{ lon: number; lat: number }> = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) {
      coords.push({ lon: v.x, lat: v.y });
    }
  }
  const points = coords.map(
    (coord) => `${geoToSvgX(coord.lon)},${geoToSvgY(coord.lat)}`
  );
  return points.join(' ');
}

/** デフォルトの塗り色 */
export const DEFAULT_POINT_COLOR = '#ff6600';
export const DEFAULT_LINE_COLOR = '#ff6600';
export const DEFAULT_POLYGON_FILL = 'rgba(100, 150, 255, 0.4)';
export const DEFAULT_POLYGON_STROKE = '#6496ff';
