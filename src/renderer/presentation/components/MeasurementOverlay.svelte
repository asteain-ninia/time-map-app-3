<script lang="ts">
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import type { SurveyResult } from '@infrastructure/rendering/surveyModeManager';
  import {
    geoToSvgX,
    geoToSvgY,
    unwrapLongitudeSequence,
  } from '@infrastructure/rendering/featureRenderingUtils';

  let {
    pointA = null as Coordinate | null,
    pointB = null as Coordinate | null,
    result = null as SurveyResult | null,
    zoom = 1,
  }: {
    pointA?: Coordinate | null;
    pointB?: Coordinate | null;
    result?: SurveyResult | null;
    zoom?: number;
  } = $props();

  /** ポイントマーカーの半径 */
  let markerRadius = $derived(4 / zoom);
  /** ストローク幅 */
  let strokeWidth = $derived(1.5 / zoom);
  /** フォントサイズ */
  let fontSize = $derived(10 / zoom);

  /** 大円パスを連続した経路になるようアンラップした点列 */
  let pathPoints = $derived(() => {
    if (!result || result.greatCirclePoints.length === 0) return [];
    const longitudes = unwrapLongitudeSequence(result.greatCirclePoints.map((point) => point.lon));
    return result.greatCirclePoints.map((point, index) => ({
      x: geoToSvgX(longitudes[index]),
      y: geoToSvgY(point.lat),
    }));
  });

  /** 大円パスのd属性 */
  let pathD = $derived(() => {
    if (pathPoints().length === 0) return '';
    const points = pathPoints();
    const parts = [`M ${points[0].x} ${points[0].y}`];
    for (let i = 1; i < points.length; i++) {
      parts.push(`L ${points[i].x} ${points[i].y}`);
    }
    return parts.join(' ');
  });

  /** 距離ラベルの位置（パスの中点付近） */
  let labelPos = $derived(() => {
    if (pathPoints().length < 2) return null;
    const mid = Math.floor(pathPoints().length / 2);
    return pathPoints()[mid];
  });

  /** 距離テキスト */
  let distanceText = $derived(() => {
    if (!result) return '';
    const gc = result.distance.greatCircleKm;
    const eq = result.distance.equirectangularKm;
    if (gc < 100) {
      return `大円: ${gc.toFixed(1)}km  図法: ${eq.toFixed(1)}km`;
    }
    return `大円: ${Math.round(gc).toLocaleString()}km  図法: ${Math.round(eq).toLocaleString()}km`;
  });
</script>

<!-- 始点マーカー -->
{#if pointA}
  <circle
    class="measurement-marker measurement-marker-start"
    cx={geoToSvgX(pointA.x)}
    cy={geoToSvgY(pointA.y)}
    r={markerRadius}
    fill="#ff6b6b"
    stroke="#fff"
    stroke-width={strokeWidth * 0.5}
    pointer-events="none"
  />
{/if}

<!-- 終点マーカー -->
{#if pointB}
  <circle
    class="measurement-marker measurement-marker-end"
    cx={geoToSvgX(pointB.x)}
    cy={geoToSvgY(pointB.y)}
    r={markerRadius}
    fill="#4ecdc4"
    stroke="#fff"
    stroke-width={strokeWidth * 0.5}
    pointer-events="none"
  />
{/if}

<!-- 大円パス -->
{#if result && pathD()}
  <path
    class="measurement-path"
    d={pathD()}
    fill="none"
    stroke="#ffd93d"
    stroke-width={strokeWidth}
    stroke-dasharray="{strokeWidth * 3} {strokeWidth * 2}"
    pointer-events="none"
    opacity="0.8"
  />
{/if}

<!-- 距離ラベル -->
{#if result && labelPos()}
  <g class="measurement-label" pointer-events="none">
    <!-- 背景 -->
    <rect
      x={labelPos()!.x - distanceText().length * fontSize * 0.28}
      y={labelPos()!.y - fontSize * 1.4}
      width={distanceText().length * fontSize * 0.56}
      height={fontSize * 1.6}
      rx={fontSize * 0.3}
      fill="rgba(0,0,0,0.75)"
    />
    <text
      x={labelPos()!.x}
      y={labelPos()!.y}
      text-anchor="middle"
      font-size={fontSize}
      fill="#ffd93d"
      font-family="monospace"
    >
      {distanceText()}
    </text>
  </g>
{/if}
