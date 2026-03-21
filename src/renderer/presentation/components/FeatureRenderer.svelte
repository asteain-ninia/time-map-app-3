<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import {
    geoToSvgX,
    geoToSvgY,
    buildPolygonPath,
    buildLinePoints,
    DEFAULT_POINT_COLOR,
    DEFAULT_LINE_COLOR,
    DEFAULT_POLYGON_FILL,
    DEFAULT_POLYGON_STROKE,
  } from '@infrastructure/rendering/featureRenderingUtils';

  let {
    features,
    vertices,
    layers,
    currentTime,
    zoom,
  }: {
    features: readonly Feature[];
    vertices: ReadonlyMap<string, Vertex>;
    layers: readonly Layer[];
    currentTime: TimePoint;
    zoom: number;
  } = $props();

  /** 表示中レイヤー（order昇順 = 下から描画） */
  let visibleLayers = $derived(
    layers.filter((l) => l.visible).toSorted((a, b) => a.order - b.order)
  );

  /** 指定レイヤーに所属する、現在時刻でアクティブな地物を取得 */
  function getLayerFeatures(
    layerId: string
  ): Array<{ feature: Feature; anchor: FeatureAnchor }> {
    const result: Array<{ feature: Feature; anchor: FeatureAnchor }> = [];
    for (const feature of features) {
      const anchor = feature.getActiveAnchor(currentTime);
      if (anchor && anchor.placement.layerId === layerId) {
        result.push({ feature, anchor });
      }
    }
    return result;
  }
</script>

{#each visibleLayers as layer (layer.id)}
  <g opacity={layer.opacity}>
    {#each getLayerFeatures(layer.id) as { feature, anchor } (feature.id)}
      {#if anchor.shape.type === 'Point'}
        {@const vertex = vertices.get(anchor.shape.vertexId)}
        {#if vertex}
          <circle
            cx={geoToSvgX(vertex.x)}
            cy={geoToSvgY(vertex.y)}
            r={4 / zoom}
            fill={anchor.property.style?.fillColor ?? DEFAULT_POINT_COLOR}
            stroke="#ffffff"
            stroke-width={1 / zoom}
          />
        {/if}
      {:else if anchor.shape.type === 'LineString'}
        {@const points = buildLinePoints(anchor.shape.vertexIds, vertices)}
        {#if points.includes(',')}
          <polyline
            points={points}
            fill="none"
            stroke={anchor.property.style?.fillColor ?? DEFAULT_LINE_COLOR}
            stroke-width={2 / zoom}
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        {/if}
      {:else if anchor.shape.type === 'Polygon'}
        {@const d = buildPolygonPath(anchor.shape, vertices)}
        {#if d}
          <path
            {d}
            fill={anchor.property.style?.fillColor ?? DEFAULT_POLYGON_FILL}
            stroke={anchor.property.style?.fillColor ?? DEFAULT_POLYGON_STROKE}
            stroke-width={1 / zoom}
            fill-rule="evenodd"
          />
        {/if}
      {/if}
    {/each}
  </g>
{/each}
