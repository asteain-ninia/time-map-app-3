/**
 * ビューポート管理
 * SVGのviewBoxを用いた座標変換、ズーム、パン操作を管理する。
 *
 * 座標系: x = 経度（-180〜180）、y = 緯度（-90〜90）
 * ただし表示用は上が北のため y を反転する。
 * SVG上の座標: x = 経度 + 180（0〜360）、y = 90 - 緯度（0〜180）
 */
export class ViewportManager {
  /** ビューポート中心のSVG座標 */
  private centerX: number;
  private centerY: number;

  /** ズーム倍率 */
  private zoom: number;

  /** 表示領域のピクセルサイズ */
  private viewWidth: number;
  private viewHeight: number;

  /** ズーム範囲 */
  private zoomMin: number;
  private zoomMax: number;

  constructor(
    zoomMin: number = 1,
    zoomMax: number = 50
  ) {
    this.centerX = 180;
    this.centerY = 90;
    this.zoom = 1;
    this.viewWidth = 800;
    this.viewHeight = 600;
    this.zoomMin = zoomMin;
    this.zoomMax = zoomMax;
  }

  /** 表示領域サイズを更新 */
  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  /** viewBox文字列を生成 */
  getViewBox(): string {
    const w = 360 / this.zoom;
    const h = (this.viewHeight / this.viewWidth) * w;
    const x = this.centerX - w / 2;
    const y = this.centerY - h / 2;
    return `${x} ${y} ${w} ${h}`;
  }

  /** viewBoxの数値配列を取得 */
  getViewBoxValues(): { x: number; y: number; width: number; height: number } {
    const w = 360 / this.zoom;
    const h = (this.viewHeight / this.viewWidth) * w;
    return {
      x: this.centerX - w / 2,
      y: this.centerY - h / 2,
      width: w,
      height: h
    };
  }

  /** 現在のズーム倍率を取得 */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * ズーム（カーソル位置を中心に）
   * @param delta ズーム方向（正でズームイン、負でズームアウト）
   * @param cursorScreenX カーソルのスクリーン座標X
   * @param cursorScreenY カーソルのスクリーン座標Y
   */
  zoomAtCursor(delta: number, cursorScreenX: number, cursorScreenY: number): void {
    const factor = delta > 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(this.zoomMin, Math.min(this.zoomMax, this.zoom * factor));

    if (newZoom === this.zoom) return;

    const cursorSvg = this.screenToSvg(cursorScreenX, cursorScreenY);

    const ratio = this.zoom / newZoom;
    this.centerX = cursorSvg.x + (this.centerX - cursorSvg.x) * ratio;
    this.centerY = cursorSvg.y + (this.centerY - cursorSvg.y) * ratio;
    this.zoom = newZoom;
  }

  /**
   * パン（ドラッグ移動）
   * @param dx スクリーン座標の移動量X
   * @param dy スクリーン座標の移動量Y
   */
  pan(dx: number, dy: number): void {
    const vb = this.getViewBoxValues();
    const scaleX = vb.width / this.viewWidth;
    const scaleY = vb.height / this.viewHeight;
    this.centerX -= dx * scaleX;
    this.centerY -= dy * scaleY;
  }

  /** スクリーン座標→SVG座標に変換 */
  screenToSvg(screenX: number, screenY: number): { x: number; y: number } {
    const vb = this.getViewBoxValues();
    return {
      x: vb.x + (screenX / this.viewWidth) * vb.width,
      y: vb.y + (screenY / this.viewHeight) * vb.height
    };
  }

  /** SVG座標→地理座標に変換 */
  svgToGeo(svgX: number, svgY: number): { lon: number; lat: number } {
    return {
      lon: svgX - 180,
      lat: 90 - svgY
    };
  }

  /** 地理座標→SVG座標に変換 */
  geoToSvg(lon: number, lat: number): { x: number; y: number } {
    return {
      x: lon + 180,
      y: 90 - lat
    };
  }

  /** スクリーン座標→地理座標に変換 */
  screenToGeo(screenX: number, screenY: number): { lon: number; lat: number } {
    const svg = this.screenToSvg(screenX, screenY);
    return this.svgToGeo(svg.x, svg.y);
  }

  /** 地図全体が収まるようにズームをリセット */
  fitToWorld(): void {
    this.centerX = 180;
    this.centerY = 90;
    this.zoom = 1;
  }

  /** ズーム範囲を設定 */
  setZoomLimits(min: number, max: number): void {
    this.zoomMin = min;
    this.zoomMax = max;
    this.zoom = Math.max(min, Math.min(max, this.zoom));
  }
}
