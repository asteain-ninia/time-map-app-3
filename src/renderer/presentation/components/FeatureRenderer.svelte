<script lang="ts">
  import type { Vertex } from '@domain/entities/Vertex';
  import type { WorldSettings } from '@domain/entities/World';
  import LabelRenderer from '@presentation/components/LabelRenderer.svelte';
  import {
    geoToSvgX,
    geoToSvgY,
    buildPolygonPathFromCoords,
    buildLinePoints,
  } from '@infrastructure/rendering/featureRenderingUtils';
  import {
    resolvePolygonAutoColors,
    resolveLineStyle,
    resolvePointStyle,
    resolveStyle,
  } from '@infrastructure/StyleResolver';
  import type { MapSceneEntry, PolygonRings } from '@presentation/components/mapSceneEntries';

  let {
    sceneEntries,
    vertices,
    settings = undefined as WorldSettings | undefined,
    zoom,
    labelAreaThreshold = 0.0005,
    selectedFeatureId = null,
    contextFeatureId = null,
  }: {
    sceneEntries: readonly MapSceneEntry[];
    vertices: ReadonlyMap<string, Vertex>;
    settings?: WorldSettings;
    zoom: number;
    labelAreaThreshold?: number;
    selectedFeatureId?: string | null;
    contextFeatureId?: string | null;
  } = $props();

  /** 選択色（要件定義書§2.3.3.1: シアン系ハイライト） */
  const SELECTION_STROKE = '#00ccff';
  const SELECTION_FILL = 'rgba(0, 204, 255, 0.2)';

  /**
   * 自動配色は地図全体（sceneEntries 全体）で 1 回算出する。描画・ヒットテスト・頂点選択
   * コンテキスト・wrapOffsets はいずれも sceneEntries を経由するため、レイヤー単位の
   * グルーピングは存在しない。
   */
  let polygonAutoColors = $derived(
    resolvePolygonAutoColors(
      sceneEntries
        .filter(({ anchor }) => anchor.shape!.type === 'Polygon')
        .map(({ feature, anchor }) => ({
          featureId: feature.id,
          shape: anchor.shape!,
          style: anchor.property.style,
        })),
      vertices,
      settings
    )
  );

  /**
   * 描画用 SVG パスは sceneEntries の `polygonRings`（解決済み座標）から生成する。
   * これにより hitTest / wrapOffsets と同じ座標列を共有し、「描画される領域 = 選択できる
   * 領域 = wrapOffsets 算出対象」を構造的に保証する（開発ガイド §6.6.9）。
   */
  function getPolygonPath(polygonRings: PolygonRings | null): string {
    if (!polygonRings || polygonRings.length === 0) return '';
    return buildPolygonPathFromCoords(polygonRings);
  }
</script>

{#each sceneEntries as { feature, anchor, featureIndex, polygonRings } (feature.id)}
  {@const isSelected = feature.id === selectedFeatureId}
  {@const isContext = feature.id === contextFeatureId && !isSelected}
  {#if anchor.shape!.type === 'Point'}
    {@const pointStyle = resolvePointStyle(featureIndex, settings)}
    {@const vertex = vertices.get(anchor.shape!.vertexId)}
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
      {#if isContext}
        <circle
          pointer-events="none"
          cx={geoToSvgX(vertex.x)}
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
        cx={geoToSvgX(vertex.x)}
        cy={geoToSvgY(vertex.y)}
        r={4 / zoom}
        fill={pointStyle.fillColor}
        stroke="#ffffff"
        stroke-width={1 / zoom}
      />
    {/if}
  {:else if anchor.shape!.type === 'LineString'}
    {@const lineStyle = resolveLineStyle(featureIndex, settings)}
    {@const points = buildLinePoints(anchor.shape!.vertexIds, vertices)}
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
        stroke={lineStyle.strokeColor}
        stroke-width={2 / zoom}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/if}
  {:else if anchor.shape!.type === 'Polygon'}
    {@const polygonStyle = resolveStyle(
      anchor.property.style,
      featureIndex,
      settings,
      1,
      polygonAutoColors.get(feature.id)
    )}
    {@const d = getPolygonPath(polygonRings)}
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
        fill={polygonStyle.fillColor}
        stroke={isSelected ? SELECTION_STROKE : polygonStyle.fillColor}
        stroke-width={isSelected ? 2 / zoom : 1 / zoom}
        fill-rule="evenodd"
      />
      <!-- 選択ハイライト（シアン塗り） -->
      {#if isSelected}
        <path
          pointer-events="none"
          {d}
          fill={polygonStyle.selectedFillColor ?? SELECTION_FILL}
          stroke="none"
          fill-rule="evenodd"
          opacity="0.4"
        />
      {/if}
    {/if}
  {/if}

  <LabelRenderer {anchor} {vertices} {zoom} {labelAreaThreshold} {polygonRings} />
{/each}
