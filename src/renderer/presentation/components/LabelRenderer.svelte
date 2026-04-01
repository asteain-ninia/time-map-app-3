<script lang="ts">
  import type { Vertex } from '@domain/entities/Vertex';
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import {
    getFeatureLabelPosition,
    shouldRenderFeatureLabel,
  } from '@presentation/components/labelRendererUtils';

  let {
    anchor,
    vertices,
    zoom,
    labelAreaThreshold = 0,
  }: {
    anchor: FeatureAnchor;
    vertices: ReadonlyMap<string, Vertex>;
    zoom: number;
    labelAreaThreshold?: number;
  } = $props();

  let canRender = $derived(
    shouldRenderFeatureLabel(anchor, vertices, zoom, labelAreaThreshold)
  );

  let labelPosition = $derived(
    canRender ? getFeatureLabelPosition(anchor, vertices) : null
  );
</script>

{#if canRender && labelPosition}
  <text
    x={labelPosition.x}
    y={labelPosition.y}
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
