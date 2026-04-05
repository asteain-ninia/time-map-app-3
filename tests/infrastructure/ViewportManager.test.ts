import { describe, it, expect, beforeEach } from 'vitest';
import { ViewportManager } from '@infrastructure/ViewportManager';

describe('ViewportManager', () => {
  let vm: ViewportManager;

  beforeEach(() => {
    vm = new ViewportManager();
  });

  describe('初期状態', () => {
    it('ズーム倍率が1', () => {
      expect(vm.getZoom()).toBe(1);
    });

    it('viewBoxが全世界を表示する', () => {
      const vb = vm.getViewBoxValues();
      expect(vb.width).toBe(360);
      expect(vb.x).toBe(0);
    });

    it('viewBox文字列を生成できる', () => {
      const str = vm.getViewBox();
      expect(str).toMatch(/^[\d.\-e]+ [\d.\-e]+ [\d.\-e]+ [\d.\-e]+$/);
    });
  });

  describe('setViewSize', () => {
    it('表示サイズ変更がviewBoxに反映される', () => {
      vm.setViewSize(1000, 500);
      const vb = vm.getViewBoxValues();
      // 幅360、高さ = (500/1000) * 360 = 180
      expect(vb.width).toBe(360);
      expect(vb.height).toBe(180);
    });

    it('正方形の場合、高さ＝幅', () => {
      vm.setViewSize(800, 800);
      const vb = vm.getViewBoxValues();
      expect(vb.width).toBe(vb.height);
    });
  });

  describe('zoomAtCursor', () => {
    it('正のdeltaでズームインする', () => {
      vm.zoomAtCursor(1, 400, 300);
      expect(vm.getZoom()).toBeGreaterThan(1);
    });

    it('負のdeltaでズームアウトする', () => {
      // 先にズームインしてから
      vm.zoomAtCursor(1, 400, 300);
      const zoomIn = vm.getZoom();
      vm.zoomAtCursor(-1, 400, 300);
      expect(vm.getZoom()).toBeLessThan(zoomIn);
    });

    it('ズーム上限を超えない', () => {
      const vmLimited = new ViewportManager(1, 2);
      for (let i = 0; i < 100; i++) {
        vmLimited.zoomAtCursor(1, 400, 300);
      }
      expect(vmLimited.getZoom()).toBeLessThanOrEqual(2);
    });

    it('ズーム下限を下回らない', () => {
      const vmLimited = new ViewportManager(1, 50);
      for (let i = 0; i < 100; i++) {
        vmLimited.zoomAtCursor(-1, 400, 300);
      }
      expect(vmLimited.getZoom()).toBeGreaterThanOrEqual(1);
    });

    it('viewBox幅がズームに反比例する', () => {
      vm.zoomAtCursor(1, 400, 300);
      const vb = vm.getViewBoxValues();
      expect(vb.width).toBeCloseTo(360 / vm.getZoom(), 5);
    });
  });

  describe('pan', () => {
    it('右へパンするとviewBoxのxが減少する', () => {
      const before = vm.getViewBoxValues().x;
      vm.pan(100, 0);
      const after = vm.getViewBoxValues().x;
      expect(after).toBeLessThan(before);
    });

    it('下へパンするとviewBoxのyが減少する', () => {
      const before = vm.getViewBoxValues().y;
      vm.pan(0, 100);
      const after = vm.getViewBoxValues().y;
      expect(after).toBeLessThan(before);
    });
  });

  describe('座標変換', () => {
    describe('svgToGeo / geoToSvg', () => {
      it('SVG(180, 90) → 地理(0, 0)（原点）', () => {
        const geo = vm.svgToGeo(180, 90);
        expect(geo.lon).toBe(0);
        expect(geo.lat).toBe(0);
      });

      it('SVG(0, 0) → 地理(-180, 90)（左上）', () => {
        const geo = vm.svgToGeo(0, 0);
        expect(geo.lon).toBe(-180);
        expect(geo.lat).toBe(90);
      });

      it('SVG(360, 180) → 地理(180, -90)（右下）', () => {
        const geo = vm.svgToGeo(360, 180);
        expect(geo.lon).toBe(180);
        expect(geo.lat).toBe(-90);
      });

      it('geoToSvgとsvgToGeoが逆変換', () => {
        const svg = vm.geoToSvg(35, 45);
        const geo = vm.svgToGeo(svg.x, svg.y);
        expect(geo.lon).toBeCloseTo(35, 10);
        expect(geo.lat).toBeCloseTo(45, 10);
      });
    });

    describe('screenToSvg', () => {
      it('スクリーン中央がSVG中央に対応する', () => {
        vm.setViewSize(800, 600);
        const svg = vm.screenToSvg(400, 300);
        // 中央 = centerX=180, centerY=90
        expect(svg.x).toBeCloseTo(180, 5);
        expect(svg.y).toBeCloseTo(90, 5);
      });

      it('スクリーン左上がviewBox左上に対応する', () => {
        vm.setViewSize(800, 600);
        const svg = vm.screenToSvg(0, 0);
        const vb = vm.getViewBoxValues();
        expect(svg.x).toBeCloseTo(vb.x, 5);
        expect(svg.y).toBeCloseTo(vb.y, 5);
      });
    });

    describe('screenToGeo', () => {
      it('スクリーン中央が地理座標原点付近', () => {
        vm.setViewSize(800, 600);
        const geo = vm.screenToGeo(400, 300);
        expect(geo.lon).toBeCloseTo(0, 5);
        expect(geo.lat).toBeCloseTo(0, 5);
      });
    });
  });

  describe('fitToWorld', () => {
    it('ズームとセンターをリセットする', () => {
      vm.zoomAtCursor(1, 400, 300);
      vm.pan(200, 100);

      vm.fitToWorld();

      expect(vm.getZoom()).toBe(1);
      const vb = vm.getViewBoxValues();
      expect(vb.x).toBe(0);
      expect(vb.width).toBe(360);
    });
  });

  describe('center longitude', () => {
    it('中心経度を取得・設定できる', () => {
      expect(vm.getCenterLongitude()).toBe(0);
      vm.setCenterLongitude(150);
      expect(vm.getCenterLongitude()).toBe(150);
    });

    it('中心経度を相対シフトできる', () => {
      vm.shiftCenterLongitude(20);
      expect(vm.getCenterLongitude()).toBe(20);
      vm.shiftCenterLongitude(-30);
      expect(vm.getCenterLongitude()).toBe(-10);
    });
  });

  describe('setZoomLimits', () => {
    it('新しい上限を設定できる', () => {
      vm.setZoomLimits(1, 5);
      for (let i = 0; i < 100; i++) {
        vm.zoomAtCursor(1, 400, 300);
      }
      expect(vm.getZoom()).toBeLessThanOrEqual(5);
    });

    it('現在のズームが範囲外ならクランプされる', () => {
      // ズームインして2以上にする
      for (let i = 0; i < 20; i++) {
        vm.zoomAtCursor(1, 400, 300);
      }
      expect(vm.getZoom()).toBeGreaterThan(2);

      vm.setZoomLimits(1, 2);
      expect(vm.getZoom()).toBe(2);
    });
  });

  describe('getWrapOffsets（横方向無限スクロール）', () => {
    it('初期状態でも隣接タイルを描画余白として含む', () => {
      expect(vm.getWrapOffsets()).toEqual([-360, 0, 360]);
    });

    it('左にパンするとオフセット-360が追加される', () => {
      vm.setViewSize(800, 600);
      // 左隣の世界が見え始める程度にパン
      for (let i = 0; i < 3; i++) {
        vm.pan(100, 0);
      }
      const offsets = vm.getWrapOffsets();
      expect(offsets).toContain(0);
      expect(offsets).toContain(-360);
      expect(offsets).toContain(-720);
    });

    it('右にパンするとオフセット360が追加される', () => {
      vm.setViewSize(800, 600);
      // 右隣の世界が見え始める程度にパン
      for (let i = 0; i < 3; i++) {
        vm.pan(-100, 0);
      }
      const offsets = vm.getWrapOffsets();
      expect(offsets).toContain(0);
      expect(offsets).toContain(360);
      expect(offsets).toContain(720);
    });

    it('1周以上パンすると必要なタイル範囲まで再計算される', () => {
      vm.setViewSize(800, 600);
      for (let i = 0; i < 20; i++) {
        vm.pan(100, 0);
      }
      const offsets = vm.getWrapOffsets();
      expect(offsets).toContain(-1080);
      expect(offsets).toContain(-720);
      expect(offsets).not.toContain(0);
    });
  });

  describe('svgToGeo生値経度', () => {
    it('SVG座標が360を超えても経度をラップしない', () => {
      const geo = vm.svgToGeo(600, 90);
      expect(geo.lon).toBe(420);
    });

    it('SVG座標が負の場合も経度をラップしない', () => {
      const geo = vm.svgToGeo(-180, 90);
      expect(geo.lon).toBe(-360);
    });
  });
});
