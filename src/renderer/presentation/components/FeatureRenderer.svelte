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
    unwrapLongitudeSequence,
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
    selectedFeatureId = null,
  }: {
    features: readonly Feature[];
    vertices: ReadonlyMap<string, Vertex>;
    layers: readonly Layer[];
    currentTime: TimePoint;
    zoom: number;
    selectedFeatureId?: string | null;
  } = $props();

  /** 選択色（要件定義書§2.3.3.1: シアン系ハイライト） */
  const SELECTION_STROKE = '#00ccff';
  const SELECTION_FILL = 'rgba(0, 204, 255, 0.2)';

  /** ラベルの最小ズーム（小さすぎるとラベルが見えないため） */
  const LABEL_MIN_ZOOM = 2;

  /** 地物の重心を計算（ラベル配置用） */
  function getCentroid(anchor: FeatureAnchor): { x: number; y: number } | null {
    if (anchor.shape.type === 'Point') {
      const v = vertices.get(anchor.shape.vertexId);
      return v ? { x: geoToSvgX(v.x), y: geoToSvgY(v.y) } : null;
    }
    if (anchor.shape.type === 'LineString') {
      const ids = anchor.shape.vertexIds;
      if (ids.length === 0) return null;
      const mid = Math.floor(ids.length / 2);
      const v = vertices.get(ids[mid]);
      return v ? { x: geoToSvgX(v.x), y: geoToSvgY(v.y) } : null;
    }
    if (anchor.shape.type === 'Polygon') {
      const ring = anchor.shape.rings[0];
      if (!ring || ring.vertexIds.length === 0) return null;
      const longitudes: number[] = [];
      let sy = 0, count = 0;
      for (const vid of ring.vertexIds) {
        const v = vertices.get(vid);
        if (v) {
          longitudes.push(v.x);
          sy += v.y;
          count++;
        }
      }
      if (count === 0) return null;
      const unwrappedLongitudes = unwrapLongitudeSequence(longitudes);
      const sx = unwrappedLongitudes.reduce((sum, lon) => sum + lon, 0);
      return { x: geoToSvgX(sx / count), y: geoToSvgY(sy / count) };
    }
    return null;
  }

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
      {#if anchor.shape.type === 'Point'}
        {@const vertex = vertices.get(anchor.shape.vertexId)}
        {#if vertex}
          <!-- 選択ハイライト -->
          {#if isSelected}
            <circle
              pointer-events="none"
              cx={geoToSvgX(vertex.x)}
              cy={geoToSvgY(vertex.y)}
              r={7 / zoom}
              fill="none"
              stroke={SELECTION_STROKE}
              stroke-width={2 / zoom}
            />
          {/if}
          <circle
            data-feature-id={feature.id}
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

      <!-- ラベル表示 -->
      {#if anchor.property.name && zoom >= LABEL_MIN_ZOOM}
        {@const centroid = getCentroid(anchor)}
        {#if centroid}
          <text
            x={centroid.x}
            y={centroid.y}
            text-anchor="middle"
            dominant-baseline="central"
            font-size={9 / zoom}
            fill="#e0e0e0"
            stroke="#1a1a2e"
            stroke-width={2 / zoom}
            paint-order="stroke"
            pointer-events="none"
            style="user-select: none;"
          >
            {anchor.property.name}
          </text>
        {/if}
      {/if}
    {/each}
  </g>
{/each}
