import { wrapLongitudeToPrimaryRange } from '@infrastructure/rendering/featureRenderingUtils';

export interface GridOverlayViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PositionedLabel {
  readonly text: string;
  readonly px: number;
}

function toScreenX(
  viewBox: GridOverlayViewBox,
  viewWidthPx: number,
  svgX: number
): number {
  return ((svgX - viewBox.x) / viewBox.width) * viewWidthPx;
}

function toScreenY(
  viewBox: GridOverlayViewBox,
  viewHeightPx: number,
  svgY: number
): number {
  return ((svgY - viewBox.y) / viewBox.height) * viewHeightPx;
}

function shouldShowLongitudeLabel(lon: number, labelInterval: number): boolean {
  return lon === 0 || Math.abs(lon) === 180 || Math.abs(lon) % labelInterval === 0;
}

function shouldShowLatitudeLabel(lat: number, labelInterval: number): boolean {
  return lat === 0 || Math.abs(lat) === 90 || Math.abs(lat) % labelInterval === 0;
}

function formatLongitudeLabel(lon: number): string {
  if (lon === 0) return '0°';
  if (Math.abs(lon) === 180) return '180°';
  return `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
}

function formatLatitudeLabel(lat: number): string {
  if (lat === 0) return '0°';
  return `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
}

export function buildVisibleLongitudeLabels(
  viewBox: GridOverlayViewBox,
  viewWidthPx: number,
  interval: number
): readonly PositionedLabel[] {
  if (!Number.isFinite(interval) || interval <= 0 || viewWidthPx <= 0) {
    return [];
  }

  const labelInterval = Math.max(interval, 30);
  const labels: PositionedLabel[] = [];
  const start = Math.ceil(viewBox.x / interval) * interval;
  const end = viewBox.x + viewBox.width;

  for (let svgX = start; svgX <= end; svgX += interval) {
    const lon = wrapLongitudeToPrimaryRange(svgX - 180);
    if (!shouldShowLongitudeLabel(lon, labelInterval)) {
      continue;
    }

    labels.push({
      text: formatLongitudeLabel(lon),
      px: toScreenX(viewBox, viewWidthPx, svgX),
    });
  }

  return labels;
}

export function buildVisibleLatitudeLabels(
  viewBox: GridOverlayViewBox,
  viewHeightPx: number,
  interval: number
): readonly PositionedLabel[] {
  if (!Number.isFinite(interval) || interval <= 0 || viewHeightPx <= 0) {
    return [];
  }

  const labelInterval = Math.max(interval, 30);
  const labels: PositionedLabel[] = [];

  for (let lat = -90; lat <= 90; lat += interval) {
    if (!shouldShowLatitudeLabel(lat, labelInterval)) {
      continue;
    }

    const svgY = 90 - lat;
    if (svgY < viewBox.y || svgY > viewBox.y + viewBox.height) {
      continue;
    }

    labels.push({
      text: formatLatitudeLabel(lat),
      px: toScreenY(viewBox, viewHeightPx, svgY),
    });
  }

  return labels;
}
