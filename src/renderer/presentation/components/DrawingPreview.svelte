<script lang="ts">
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import { geoToSvgX, geoToSvgY } from '@infrastructure/rendering/featureRenderingUtils';

  let {
    coords,
    zoom,
    cursorGeo,
  }: {
    coords: readonly Coordinate[];
    zoom: number;
    cursorGeo: { lon: number; lat: number } | null;
  } = $props();

  /** 頂点のSVGポイント列 */
  let pointsStr = $derived(
    coords.map((c) => `${geoToSvgX(c.x)},${geoToSvgY(c.y)}`).join(' ')
  );

  /** カーソル位置までの仮線（最後の頂点→カーソル） */
  let cursorLine = $derived(() => {
    if (!cursorGeo || coords.length === 0) return null;
    const last = coords[coords.length - 1];
    return {
      x1: geoToSvgX(last.x),
      y1: geoToSvgY(last.y),
      x2: geoToSvgX(cursorGeo.lon),
      y2: geoToSvgY(cursorGeo.lat),
    };
  });
</script>

<!-- 描画中のライン -->
{#if coords.length >= 2}
  <polyline
    points={pointsStr}
    fill="none"
    stroke="#00ccff"
    stroke-width={2 / zoom}
    stroke-dasharray="{4 / zoom} {4 / zoom}"
    stroke-linecap="round"
    opacity="0.8"
  />
{/if}

<!-- カーソルへの仮線 -->
{#if cursorLine()}
  <line
    x1={cursorLine()!.x1}
    y1={cursorLine()!.y1}
    x2={cursorLine()!.x2}
    y2={cursorLine()!.y2}
    stroke="#00ccff"
    stroke-width={1 / zoom}
    stroke-dasharray="{3 / zoom} {3 / zoom}"
    opacity="0.5"
  />
{/if}

<!-- 配置済み頂点マーカー -->
{#each coords as c, i (i)}
  <circle
    cx={geoToSvgX(c.x)}
    cy={geoToSvgY(c.y)}
    r={4 / zoom}
    fill={i === 0 ? '#00ff88' : '#00ccff'}
    stroke="#ffffff"
    stroke-width={1 / zoom}
  />
{/each}
