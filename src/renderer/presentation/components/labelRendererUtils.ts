import type { Vertex } from '@domain/entities/Vertex';
import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { PolygonRings } from '@presentation/components/mapSceneEntries';
import {
  geoToWrappedSvgX,
  geoToSvgY,
} from '@infrastructure/rendering/featureRenderingUtils';

export interface LabelPosition {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_LABEL_MIN_ZOOM = 2;

function getVertexCoordinates(
  vertexIds: readonly string[],
  vertices: ReadonlyMap<string, Vertex>
): Array<{ lon: number; lat: number }> {
  const coordinates: Array<{ lon: number; lat: number }> = [];

  for (const vertexId of vertexIds) {
    const vertex = vertices.get(vertexId);
    if (vertex) {
      coordinates.push({ lon: vertex.x, lat: vertex.y });
    }
  }

  return coordinates;
}

/**
 * 当該錨が「Polygon として扱う対象」（リーフ・集約地物・移行期間ノード）かを判定する。
 *
 * 開発ガイド §6.6.9 適用パターン: 判定をデータ側に寄せる。`polygonRings` が呼び出し側から
 * 渡されているならそれ自体が「sceneEntries 経由 = Polygon entry」のシグナル
 * （MapSceneEntry 規約: Polygon entry は必ず `polygonRings !== null`、Point/LineString は
 * 必ず `null`）。描画 (`FeatureRenderer`) / hitTest (`hitTestUtils`) と同じ判定で動かす
 * ことで、判定基準のドリフトを構造的に排除する。
 *
 * `polygonRings === undefined`（既存の単独呼び出し fallback）の場合のみ anchor.shape ベースの
 * 旧判定にフォールバックする。
 */
function isPolygonLikeAnchor(anchor: FeatureAnchor, polygonRings?: PolygonRings | null): boolean {
  if (polygonRings !== undefined) return polygonRings !== null;
  return anchor.shape?.type === 'Polygon';
}

/**
 * Polygon ラベル算出に使う外周リング座標を、`polygonRings`（解決済み）優先で取得する。
 *
 * 開発ガイド §6.6.9: 「LabelRenderer のラベル位置・面積判定も `containerPolygons` 引数で
 * 同じ派生形状を受け取り、描画と一致させる」。shape あり + childIds 非空 の移行期間ノードで
 * `polygonRings` には派生形状（または shape fallback）が解決済みで渡されるため、ラベル位置と
 * 描画領域がずれない。集約地物（shape なし）も `polygonRings` が派生形状を保持するため
 * 同じ経路で重心・面積を算出できる。`polygonRings` が無い経路（既存の単独呼び出し）は
 * anchor.shape を fallback。
 */
function getPolygonOuterCoords(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>,
  polygonRings?: PolygonRings | null
): Array<{ lon: number; lat: number }> {
  if (polygonRings && polygonRings.length > 0 && polygonRings[0].length > 0) {
    return polygonRings[0].map((c) => ({ lon: c.x, lat: c.y }));
  }
  if (!anchor.shape || anchor.shape.type !== 'Polygon') return [];
  const outerRing = anchor.shape.rings[0];
  if (!outerRing) return [];
  return getVertexCoordinates(outerRing.vertexIds, vertices);
}

export function getFeatureLabelPosition(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>,
  polygonRings?: PolygonRings | null
): LabelPosition | null {
  if (anchor.shape?.type === 'Point') {
    const vertex = vertices.get(anchor.shape.vertexId);
    return vertex
      ? { x: geoToWrappedSvgX(vertex.x), y: geoToSvgY(vertex.y) }
      : null;
  }

  if (anchor.shape?.type === 'LineString') {
    const midpointVertexId = anchor.shape.vertexIds[Math.floor(anchor.shape.vertexIds.length / 2)];
    if (!midpointVertexId) return null;

    const vertex = vertices.get(midpointVertexId);
    return vertex
      ? { x: geoToWrappedSvgX(vertex.x), y: geoToSvgY(vertex.y) }
      : null;
  }

  if (!isPolygonLikeAnchor(anchor, polygonRings)) return null;

  const coordinates = getPolygonOuterCoords(anchor, vertices, polygonRings);
  if (coordinates.length === 0) return null;

  const longitudeSum = coordinates.reduce((sum, coordinate) => sum + coordinate.lon, 0);
  const latitudeSum = coordinates.reduce((sum, coordinate) => sum + coordinate.lat, 0);

  return {
    x: geoToWrappedSvgX(longitudeSum / coordinates.length),
    y: geoToSvgY(latitudeSum / coordinates.length),
  };
}

export function measureFeatureLabelArea(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>,
  polygonRings?: PolygonRings | null
): number {
  if (!isPolygonLikeAnchor(anchor, polygonRings)) return 0;

  const coordinates = getPolygonOuterCoords(anchor, vertices, polygonRings);
  if (coordinates.length < 3) return 0;

  let signedArea = 0;
  for (let index = 0; index < coordinates.length; index++) {
    const nextIndex = (index + 1) % coordinates.length;
    signedArea +=
      coordinates[index].lon * coordinates[nextIndex].lat -
      coordinates[nextIndex].lon * coordinates[index].lat;
  }

  return Math.abs(signedArea) / 2;
}

export function measureFeatureLabelLength(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>
): number {
  if (!anchor.shape || anchor.shape.type !== 'LineString') return 0;

  const coordinates = getVertexCoordinates(anchor.shape.vertexIds, vertices);
  if (coordinates.length < 2) return 0;

  let length = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const dx = coordinates[index].lon - coordinates[index - 1].lon;
    const dy = coordinates[index].lat - coordinates[index - 1].lat;
    length += Math.hypot(dx, dy);
  }

  return length;
}

export function shouldRenderFeatureLabel(
  anchor: FeatureAnchor,
  vertices: ReadonlyMap<string, Vertex>,
  zoom: number,
  labelAreaThreshold: number,
  polygonRings?: PolygonRings | null
): boolean {
  if (!anchor.property.name) return false;

  // 集約地物（shape なし）も派生形状を polygonRings で受け取れば Polygon として扱う。
  // それ以外で shape が無いケースは仕様上ありえない壊れたデータの保険。
  if (!anchor.shape && !(polygonRings && polygonRings.length > 0)) return false;

  const minZoom = anchor.property.labelVisibility?.minZoom ?? DEFAULT_LABEL_MIN_ZOOM;
  if (zoom < minZoom) return false;

  const minDisplayLength = anchor.property.labelVisibility?.minDisplayLength;
  if (
    anchor.shape?.type === 'LineString' &&
    minDisplayLength !== undefined &&
    measureFeatureLabelLength(anchor, vertices) < minDisplayLength
  ) {
    return false;
  }

  if (
    isPolygonLikeAnchor(anchor, polygonRings) &&
    labelAreaThreshold > 0 &&
    measureFeatureLabelArea(anchor, vertices, polygonRings) < labelAreaThreshold
  ) {
    return false;
  }

  return getFeatureLabelPosition(anchor, vertices, polygonRings) !== null;
}
