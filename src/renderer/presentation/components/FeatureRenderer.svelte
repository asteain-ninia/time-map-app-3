<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { Layer } from '@domain/entities/Layer';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import LabelRenderer from '@presentation/components/LabelRenderer.svelte';
  import {
    geoToWrappedSvgX,
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
    labelAreaThreshold = 0.0005,
    selectedFeatureId = null,
    contextFeatureId = null,
  }: {
    features: readonly Feature[];
    vertices: ReadonlyMap<string, Vertex>;
    layers: readonly Layer[];
    currentTime: TimePoint;
    zoom: number;
    labelAreaThreshold?: number;
    selectedFeatureId?: string | null;
    contextFeatureId?: string | null;
  } = $props();

  /** 選択色（要件定義書§2.3.3.1: シアン系ハイライト） */
  const SELECTION_STROKE = '#00ccff';
  const SELECTION_FILL = 'rgba(0, 204, 255, 0.2)';

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
      {@const isSelected = feature.id === selectedFeatureId}
      {@const isContext = feature.id === contextFeatureId && !isSelected}
      {#if anchor.shape.type === 'Point'}
        {@const vertex = vertices.get(anchor.shape.vertexId)}
        {#if vertex}
          <!-- 選択ハイライト -->
          {#if isSelected}
            <circle
              pointer-events="none"
              cx={geoToWrappedSvgX(vertex.x)}
              cy={geoToSvgY(vertex.y)}
              r={7 / zoom}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={2 / zoom}
            />
          {/if}
          {#if isContext}
            <circle
              pointer-events="none"
              cx={geoToWrappedSvgX(vertex.x)}
              cy={geoToSvgY(vertex.y)}
              r={6 / zoom}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={1.25 / zoom}
              stroke-dasharray="{3 / zoom} {2 / zoom}"
              opacity="0.8"
            />
          {/if}
          <circle
            data-feature-id={feature.id}
            cx={geoToWrappedSvgX(vertex.x)}
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
          <!-- 選択ハイライト -->
          {#if isSelected}
            <polyline
              pointer-events="none"
              {points}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={5 / zoom}
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.5"
            />
          {/if}
          {#if isContext}
            <polyline
              pointer-events="none"
              {points}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={1.5 / zoom}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-dasharray="{4 / zoom} {3 / zoom}"
              opacity="0.8"
            />
          {/if}
          <polyline
            data-feature-id={feature.id}
            {points}
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
          {#if isContext}
            <path
              pointer-events="none"
              {d}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={1.25 / zoom}
              stroke-dasharray="{4 / zoom} {3 / zoom}"
              fill-rule="evenodd"
              opacity="0.8"
            />
          {/if}
          <path
            data-feature-id={feature.id}
            {d}
            fill={anchor.property.style?.fillColor ?? DEFAULT_POLYGON_FILL}
            stroke={isSelected ? SELECTION_STROKE : (anchor.property.style?.fillColor ?? DEFAULT_POLYGON_STROKE)}
            stroke-width={isSelected ? 2 / zoom : 1 / zoom}
            fill-rule="evenodd"
          />
          <!-- 選択ハイライト（シアン塗り） -->
          {#if isSelected}
            <path
              pointer-events="none"
              {d}
              fill={anchor.property.style?.selectedFillColor ?? SELECTION_FILL}
              stroke="none"
              fill-rule="evenodd"
              opacity="0.4"
            />
          {/if}
        {/if}
      {/if}

      <LabelRenderer {anchor} {vertices} {zoom} {labelAreaThreshold} />
    {/each}
  </g>
{/each}
