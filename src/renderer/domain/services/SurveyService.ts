/**
 * 測量計算ドメインサービス
 *
 * §2.1: 測量モード — 2点間距離、座標表示
 *
 * 正距円筒図法上の座標から、
 * - 大円距離（球面上の最短距離）
 * - 正距円筒図法に基づく距離
 * - 面積（球面上）
 * - 座標表示（度分秒/十進）
 * を計算する。
 *
 * 惑星の赤道長と扁平率は WorldSettings から取得する。
 */

/** 測量に必要な惑星パラメータ */
export interface PlanetParams {
  /** 赤道長（km） */
  readonly equatorLength: number;
  /** 扁平率 */
  readonly oblateness: number;
}

/** デフォルトの惑星パラメータ（地球近似） */
export const DEFAULT_PLANET: PlanetParams = {
  equatorLength: 40000,
  oblateness: 0.00335,
};

/** 2点間距離の計算結果 */
export interface DistanceResult {
  /** 大円距離（km） */
  readonly greatCircleKm: number;
  /** 正距円筒図法に基づく距離（km） */
  readonly equirectangularKm: number;
}

/** 座標表示フォーマット */
export interface CoordinateDisplay {
  /** 十進表記（例: "35.6812° N, 139.7671° E"） */
  readonly decimal: string;
  /** 度分秒表記（例: "35° 40' 52.3" N, 139° 46' 1.6" E"） */
  readonly dms: string;
  /** 緯度（十進） */
  readonly lat: number;
  /** 経度（十進） */
  readonly lon: number;
}

/** 面積計算結果 */
export interface AreaResult {
  /** 球面上の面積（km²） */
  readonly areaKm2: number;
  /** 図法上の面積（度²） */
  readonly areaDeg2: number;
}

// ── 距離計算 ──

/**
 * 大円距離を計算する（Haversine公式）
 *
 * §2.1: 球面上の最短距離
 *
 * @param lon1 経度1（度）
 * @param lat1 緯度1（度）
 * @param lon2 経度2（度）
 * @param lat2 緯度2（度）
 * @param planet 惑星パラメータ
 * @returns 距離（km）
 */
export function greatCircleDistance(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  planet: PlanetParams = DEFAULT_PLANET
): number {
  const R = planet.equatorLength / (2 * Math.PI);

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1r) * Math.cos(lat2r) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * 正距円筒図法に基づく距離を計算する
 *
 * §2.1: 図法上の2点間のユークリッド距離をkm換算
 *
 * @param lon1 経度1（度）
 * @param lat1 緯度1（度）
 * @param lon2 経度2（度）
 * @param lat2 緯度2（度）
 * @param planet 惑星パラメータ
 * @returns 距離（km）
 */
export function equirectangularDistance(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  planet: PlanetParams = DEFAULT_PLANET
): number {
  const kmPerDegLon = planet.equatorLength / 360;
  const midLat = toRad((lat1 + lat2) / 2);
  const kmPerDegLat = planet.equatorLength / 360; // 正距円筒図法では緯度方向も同じ

  const dx = (lon2 - lon1) * kmPerDegLon * Math.cos(midLat);
  const dy = (lat2 - lat1) * kmPerDegLat;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点間距離を計算する（大円距離と正距円筒図法距離の両方）
 *
 * §2.1: 両方を計算して表示
 */
export function calculateDistance(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  planet: PlanetParams = DEFAULT_PLANET
): DistanceResult {
  return {
    greatCircleKm: greatCircleDistance(lon1, lat1, lon2, lat2, planet),
    equirectangularKm: equirectangularDistance(lon1, lat1, lon2, lat2, planet),
  };
}

// ── 大円距離のパス ──

/**
 * 大円に沿った中間点群を生成する
 *
 * §2.1: 大円距離に基づく線を描画する
 *
 * @param lon1 始点経度（度）
 * @param lat1 始点緯度（度）
 * @param lon2 終点経度（度）
 * @param lat2 終点緯度（度）
 * @param segments 分割数
 * @returns 中間点の配列 [{ lon, lat }]
 */
export function greatCirclePath(
  lon1: number, lat1: number,
  lon2: number, lat2: number,
  segments: number = 100
): { lon: number; lat: number }[] {
  const lat1r = toRad(lat1);
  const lon1r = toRad(lon1);
  const lat2r = toRad(lat2);
  const lon2r = toRad(lon2);

  // 最短経路を保証するために経度差を[-180, 180]に正規化
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const lon2Adjusted = lon1 + dLon;
  const lon2rAdj = toRad(lon2Adjusted);

  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2r - lat1r) / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin((lon2rAdj - lon1r) / 2) ** 2
  ));

  if (d < 1e-10) {
    return [{ lon: lon1, lat: lat1 }];
  }

  const points: { lon: number; lat: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(lat1r) * Math.cos(lon1r) + B * Math.cos(lat2r) * Math.cos(lon2rAdj);
    const y = A * Math.cos(lat1r) * Math.sin(lon1r) + B * Math.cos(lat2r) * Math.sin(lon2rAdj);
    const z = A * Math.sin(lat1r) + B * Math.sin(lat2r);

    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lon = toDeg(Math.atan2(y, x));
    // 正規化
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    points.push({ lon, lat });
  }
  return points;
}

// ── 面積計算 ──

/**
 * 球面上のポリゴン面積を計算する（球面余剰公式）
 *
 * @param ring 頂点配列 [{ x: 経度, y: 緯度 }]
 * @param planet 惑星パラメータ
 * @returns 面積（km²）
 */
export function sphericalPolygonArea(
  ring: readonly { x: number; y: number }[],
  planet: PlanetParams = DEFAULT_PLANET
): AreaResult {
  const R = planet.equatorLength / (2 * Math.PI);
  const n = ring.length;
  if (n < 3) return { areaKm2: 0, areaDeg2: 0 };

  // 球面余剰法
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lon1 = toRad(ring[i].x);
    const lat1 = toRad(ring[i].y);
    const lon2 = toRad(ring[j].x);
    const lat2 = toRad(ring[j].y);
    sum += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  const areaKm2 = Math.abs(sum * R * R / 2);

  // 図法上の面積（Shoelace formula）
  let areaDeg2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    areaDeg2 += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  }
  areaDeg2 = Math.abs(areaDeg2 / 2);

  return { areaKm2, areaDeg2 };
}

// ── 座標表示 ──

/**
 * 度を度分秒に変換する
 */
export function toDMS(degrees: number): { d: number; m: number; s: number } {
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return { d, m, s: Math.round(s * 10) / 10 };
}

/**
 * 座標の表示用フォーマットを生成する
 *
 * §2.1: 緯度経度は度分秒形式と十進形式の両方で表示
 *
 * @param lon 経度（度、x座標）
 * @param lat 緯度（度、y座標）
 */
export function formatCoordinate(lon: number, lat: number): CoordinateDisplay {
  const displayLon = wrapLongitudeToPrimaryRange(lon);
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = displayLon >= 0 ? 'E' : 'W';

  const latDMS = toDMS(lat);
  const lonDMS = toDMS(displayLon);

  const decimal = `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(displayLon).toFixed(4)}° ${lonDir}`;
  const dms = `${latDMS.d}° ${latDMS.m}' ${latDMS.s}" ${latDir}, ${lonDMS.d}° ${lonDMS.m}' ${lonDMS.s}" ${lonDir}`;

  return { decimal, dms, lat, lon };
}

// ── ヘルパー ──

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function toDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

function wrapLongitudeToPrimaryRange(lon: number): number {
  let wrapped = lon;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}
