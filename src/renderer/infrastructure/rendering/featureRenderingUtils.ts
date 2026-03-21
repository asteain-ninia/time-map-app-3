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

/** 頂点IDリストからSVGパス文字列を生成（閉じたリング用） */
export function buildRingPath(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): string {
  const points: Array<{ x: number; y: number }> = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) {
      points.push({ x: geoToSvgX(v.x), y: geoToSvgY(v.y) });
    }
  }
  if (points.length < 3) return '';
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
  return shape.rings
    .map((ring) => buildRingPath(ring.vertexIds, vertices))
    .filter((d) => d !== '')
    .join(' ');
}

/** ラインストリングのSVGポリライン用ポイント文字列を生成 */
export function buildLinePoints(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): string {
  const points: string[] = [];
  for (const id of vertexIds) {
    const v = vertices.get(id);
    if (v) {
      points.push(`${geoToSvgX(v.x)},${geoToSvgY(v.y)}`);
    }
  }
  return points.join(' ');
}

/** デフォルトの塗り色 */
export const DEFAULT_POINT_COLOR = '#ff6600';
export const DEFAULT_LINE_COLOR = '#ff6600';
export const DEFAULT_POLYGON_FILL = 'rgba(100, 150, 255, 0.4)';
export const DEFAULT_POLYGON_STROKE = '#6496ff';
