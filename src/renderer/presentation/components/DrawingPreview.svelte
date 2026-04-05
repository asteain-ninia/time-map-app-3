<script lang="ts">
  import type { Coordinate } from '@domain/value-objects/Coordinate';
  import {
    geoToSvgX,
    geoToSvgY,
    wrapLongitudeNearReference,
  } from '@infrastructure/rendering/featureRenderingUtils';

  let {
    coords,
    zoom,
    cursorGeo,
    isPolygon = false,
  }: {
    coords: readonly Coordinate[];
    zoom: number;
    cursorGeo: { lon: number; lat: number } | null;
    isPolygon?: boolean;
  } = $props();

  /** 描画座標の生値地理座標列 */
  let pathCoords = $derived(() => {
    return coords.map((coord) => ({
      lon: coord.x,
      lat: coord.y,
    }));
  });

  /** 生値座標のSVG座標列 */
  let svgCoords = $derived(() =>
    pathCoords().map((coord) => ({
      x: geoToSvgX(coord.lon),
      y: geoToSvgY(coord.lat),
    }))
  );

  /** 頂点のSVGポイント列 */
  let pointsStr = $derived(() =>
    svgCoords().map((coord) => `${coord.x},${coord.y}`).join(' ')
  );

  /** カーソル位置までの仮線（最後の頂点→カーソル） */
  let cursorLine = $derived(() => {
    if (!cursorGeo || coords.length === 0) return null;
    const last = pathCoords()[coords.length - 1];
    return {
      x1: geoToSvgX(last.lon),
      y1: geoToSvgY(last.lat),
      x2: geoToSvgX(wrapLongitudeNearReference(cursorGeo.lon, last.lon)),
      y2: geoToSvgY(cursorGeo.lat),
    };
  });

  /** クロージング線（最後の頂点→最初の頂点、ポリゴンモード時のみ） */
  let closingLine = $derived(() => {
    if (!isPolygon || coords.length < 2) return null;
    const first = pathCoords()[0];
    const last = pathCoords()[coords.length - 1];
    return {
      x1: geoToSvgX(last.lon),
      y1: geoToSvgY(last.lat),
      x2: geoToSvgX(first.lon),
      y2: geoToSvgY(first.lat),
    };
  });
</script>

<!-- 描画中のライン -->
{#if coords.length >= 2}
  <polyline
    class="drawing-preview-polyline"
    points={pointsStr()}
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
    class="drawing-preview-cursor-line"
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

<!-- クロージング線（最後→最初、ポリゴンモード時） -->
{#if closingLine()}
  <line
    class="drawing-preview-closing-line"
    x1={closingLine()!.x1}
    y1={closingLine()!.y1}
    x2={closingLine()!.x2}
    y2={closingLine()!.y2}
    stroke="#00ff88"
    stroke-width={1 / zoom}
    stroke-dasharray="{3 / zoom} {3 / zoom}"
    opacity="0.35"
  />
{/if}

<!-- 配置済み頂点マーカー -->
{#each svgCoords() as coord, i (i)}
  <circle
    class="drawing-preview-vertex"
    cx={coord.x}
    cy={coord.y}
    r={4 / zoom}
    fill={i === 0 ? '#00ff88' : '#00ccff'}
    stroke="#ffffff"
    stroke-width={1 / zoom}
  />
{/each}
