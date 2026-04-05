import { describe, it, expect } from 'vitest';
import {
  greatCircleDistance,
  equirectangularDistance,
  calculateDistance,
  greatCirclePath,
  sphericalPolygonArea,
  toDMS,
  formatCoordinate,
  DEFAULT_PLANET,
} from '@domain/services/SurveyService';

describe('SurveyService', () => {
  describe('greatCircleDistance', () => {
    it('同一点間の距離は0', () => {
      expect(greatCircleDistance(0, 0, 0, 0)).toBe(0);
    });

    it('赤道上で90度離れた2点（地球近似）', () => {
      // 赤道長40000km → 半径 ≈ 6366.2km
      // 90度 → 距離 ≈ 10000km
      const d = greatCircleDistance(0, 0, 90, 0);
      expect(d).toBeCloseTo(10000, -2); // ±100km精度
    });

    it('北極から赤道まで（90度）', () => {
      const d = greatCircleDistance(0, 90, 0, 0);
      expect(d).toBeCloseTo(10000, -2);
    });

    it('対蹠点間は赤道の半分', () => {
      const d = greatCircleDistance(0, 0, 180, 0);
      expect(d).toBeCloseTo(20000, -2);
    });

    it('カスタム惑星パラメータ', () => {
      const d = greatCircleDistance(0, 0, 90, 0, {
        equatorLength: 20000,
        oblateness: 0,
      });
      expect(d).toBeCloseTo(5000, -2);
    });
  });

  describe('equirectangularDistance', () => {
    it('同一点間の距離は0', () => {
      expect(equirectangularDistance(0, 0, 0, 0)).toBe(0);
    });

    it('赤道上で1度離れた2点', () => {
      // 40000/360 ≈ 111.11 km/度
      const d = equirectangularDistance(0, 0, 1, 0);
      expect(d).toBeCloseTo(111.11, 0);
    });

    it('緯度方向に1度', () => {
      const d = equirectangularDistance(0, 0, 0, 1);
      expect(d).toBeCloseTo(111.11, 0);
    });

    it('高緯度では経度方向の距離が短くなる', () => {
      const dEquator = equirectangularDistance(0, 0, 1, 0);
      const d60 = equirectangularDistance(0, 60, 1, 60);
      // cos(60°) ≈ 0.5 → 約半分
      expect(d60).toBeCloseTo(dEquator * 0.5, 0);
    });
  });

  describe('calculateDistance', () => {
    it('両方の距離を返す', () => {
      const result = calculateDistance(0, 0, 90, 0);
      expect(result.greatCircleKm).toBeGreaterThan(0);
      expect(result.equirectangularKm).toBeGreaterThan(0);
    });
  });

  describe('greatCirclePath', () => {
    it('同一点では1点のパスを返す', () => {
      const path = greatCirclePath(0, 0, 0, 0);
      expect(path.length).toBe(1);
    });

    it('指定されたセグメント数+1の点を返す', () => {
      const path = greatCirclePath(0, 0, 90, 0, 10);
      expect(path.length).toBe(11);
    });

    it('始点と終点が正しい', () => {
      const path = greatCirclePath(0, 0, 90, 45, 50);
      expect(path[0].lon).toBeCloseTo(0, 5);
      expect(path[0].lat).toBeCloseTo(0, 5);
      expect(path[path.length - 1].lon).toBeCloseTo(90, 5);
      expect(path[path.length - 1].lat).toBeCloseTo(45, 5);
    });

    it('最短経路を選ぶ（日付変更線をまたぐ）', () => {
      // 170°E → 170°W は -20度（東回りでなく西回り）
      const path = greatCirclePath(170, 0, -170, 0, 10);
      // 中間点は180度付近を通るはず
      const midLon = path[5].lon;
      expect(Math.abs(midLon)).toBeGreaterThan(170);
    });
  });

  describe('sphericalPolygonArea', () => {
    it('3頂点未満は面積0', () => {
      const result = sphericalPolygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
      expect(result.areaKm2).toBe(0);
    });

    it('赤道上の1度×1度の正方形', () => {
      const ring = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const result = sphericalPolygonArea(ring);
      // 1度×1度 ≈ 111.11² ≈ 12346 km² (赤道付近)
      expect(result.areaKm2).toBeGreaterThan(10000);
      expect(result.areaKm2).toBeLessThan(15000);
    });

    it('図法上の面積も返す', () => {
      const ring = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const result = sphericalPolygonArea(ring);
      expect(result.areaDeg2).toBeCloseTo(100, 1);
    });
  });

  describe('toDMS', () => {
    it('0度', () => {
      const r = toDMS(0);
      expect(r.d).toBe(0);
      expect(r.m).toBe(0);
      expect(r.s).toBe(0);
    });

    it('35.6812度', () => {
      const r = toDMS(35.6812);
      expect(r.d).toBe(35);
      expect(r.m).toBe(40);
      expect(r.s).toBeCloseTo(52.3, 0);
    });

    it('負の値は絶対値で計算', () => {
      const r = toDMS(-45.5);
      expect(r.d).toBe(45);
      expect(r.m).toBe(30);
    });
  });

  describe('formatCoordinate', () => {
    it('十進表記が正しい', () => {
      const c = formatCoordinate(139.7671, 35.6812);
      expect(c.decimal).toContain('35.6812');
      expect(c.decimal).toContain('N');
      expect(c.decimal).toContain('139.7671');
      expect(c.decimal).toContain('E');
    });

    it('DMS表記が正しい', () => {
      const c = formatCoordinate(139.7671, 35.6812);
      expect(c.dms).toContain('35°');
      expect(c.dms).toContain('N');
      expect(c.dms).toContain('139°');
      expect(c.dms).toContain('E');
    });

    it('南半球・西半球', () => {
      const c = formatCoordinate(-73.9857, -33.4489);
      expect(c.decimal).toContain('S');
      expect(c.decimal).toContain('W');
    });

    it('座標値が保持される', () => {
      const c = formatCoordinate(100, 50);
      expect(c.lon).toBe(100);
      expect(c.lat).toBe(50);
    });

    it('表示用の経度だけ主表示帯へ折り返す', () => {
      const c = formatCoordinate(200, 10);
      expect(c.lon).toBe(200);
      expect(c.decimal).toContain('160.0000');
      expect(c.decimal).toContain('W');
      expect(c.dms).toContain('160°');
      expect(c.dms).toContain('W');
    });
  });
});
