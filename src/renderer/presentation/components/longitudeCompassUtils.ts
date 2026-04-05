const NICE_STEPS = [
  180, 90, 60, 45, 30, 20, 10, 5, 2, 1,
  0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001,
] as const;

export function getCenterLongitudeFractionDigits(currentZoom: number): number {
  if (currentZoom < 2) return 0;
  if (currentZoom < 4) return 1;
  if (currentZoom < 8) return 2;
  if (currentZoom < 16) return 3;
  if (currentZoom < 32) return 4;
  if (currentZoom < 64) return 5;
  return 6;
}

export function getVisibleSpan(currentZoom: number): number {
  return Math.max(24, Math.min(180, (360 / Math.max(currentZoom, 1)) * 3));
}

export function pickNearestNiceStep(rawStep: number): number {
  let nearest = NICE_STEPS[0];
  let nearestDiff = Math.abs(nearest - rawStep);

  for (const candidate of NICE_STEPS) {
    const diff = Math.abs(candidate - rawStep);
    if (diff < nearestDiff || (diff === nearestDiff && candidate < nearest)) {
      nearest = candidate;
      nearestDiff = diff;
    }
  }

  return nearest;
}

export function getTickStep(currentZoom: number): number {
  const fractionDigits = getCenterLongitudeFractionDigits(currentZoom);
  const visibleSpan = getVisibleSpan(currentZoom);
  return pickNearestNiceStep(visibleSpan / ((fractionDigits + 1) * 10));
}

export function getLabelEvery(currentZoom: number): number {
  return Math.max(2, getCenterLongitudeFractionDigits(currentZoom) + 2);
}

export function getJumpStep(currentZoom: number): number {
  return pickNearestNiceStep(getVisibleSpan(currentZoom) / 10);
}
