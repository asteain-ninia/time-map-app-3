import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';

/** 経度 → SVG x座標 */
export function geoToSvgX(lon: number): number {
  return lon + 180;
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

/** 頂点IDリストからSVGパス文字列を生成（閉じたリング用） */
export function buildRingPath(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>,
  referenceLon?: number
): string {
  const coords: Array<{ lon: number; lat: number }> = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) {
      coords.push({ lon: v.x, lat: v.y });
    }
  }
  if (coords.length < 3) return '';

  const unwrappedLongitudes = unwrapLongitudeSequence(coords.map((coord) => coord.lon));
  const alignedLongitudes =
    referenceLon === undefined
      ? unwrappedLongitudes
      : shiftLongitudeSequenceNearReference(unwrappedLongitudes, referenceLon);
  const points = coords.map((coord, index) => ({
    x: geoToSvgX(alignedLongitudes[index]),
    y: geoToSvgY(coord.lat),
  }));

  return (
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
      .join(' ') + ' Z'
  );
}

/** ポリゴンの全リングを結合したSVGパス文字列を生成（fill-rule="evenodd"用） */
export function buildPolygonPath(
  shape: FeatureShape & { type: 'Polygon' },
  vertices: ReadonlyMap<string, Vertex>
): string {
  const paths: string[] = [];
  let referenceLon: number | undefined;

  for (const ring of shape.rings) {
    const path = buildRingPath(ring.vertexIds, vertices, referenceLon);
    if (!path) continue;

    if (referenceLon === undefined) {
      const firstVertexId = ring.vertexIds.find((vertexId) => vertices.has(vertexId));
      const firstVertex = firstVertexId ? vertices.get(firstVertexId) : undefined;
      if (firstVertex) {
        referenceLon = firstVertex.x;
      }
    }

    paths.push(path);
  }

  return paths.join(' ');
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
  const unwrappedLongitudes = unwrapLongitudeSequence(coords.map((coord) => coord.lon));
  const points = coords.map(
    (coord, index) => `${geoToSvgX(unwrappedLongitudes[index])},${geoToSvgY(coord.lat)}`
  );
  return points.join(' ');
}

/** デフォルトの塗り色 */
export const DEFAULT_POINT_COLOR = '#ff6600';
export const DEFAULT_LINE_COLOR = '#ff6600';
export const DEFAULT_POLYGON_FILL = 'rgba(100, 150, 255, 0.4)';
export const DEFAULT_POLYGON_STROKE = '#6496ff';
