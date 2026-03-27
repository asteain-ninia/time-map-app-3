<script lang="ts">
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import type { SnapIndicator } from '@infrastructure/rendering/snapIndicatorUtils';
  import {
    geoToSvgX,
    geoToSvgY,
    wrapLongitudeNearReference,
  } from '@infrastructure/rendering/featureRenderingUtils';
  import { getUniqueVertexIds, getShapeEdges } from '@infrastructure/rendering/vertexHandleUtils';
  import { isVertexShared } from '@infrastructure/rendering/snapIndicatorUtils';

  let {
    anchor,
    vertices,
    zoom,
    selectedVertexIds = new Set<string>(),
    sharedGroups = new Map<string, SharedVertexGroup>(),
    snapIndicator = null,
    onVertexMouseDown,
    onEdgeHandleMouseDown,
  }: {
    anchor: FeatureAnchor;
    vertices: ReadonlyMap<string, Vertex>;
    zoom: number;
    selectedVertexIds?: ReadonlySet<string>;
    sharedGroups?: ReadonlyMap<string, SharedVertexGroup>;
    snapIndicator?: SnapIndicator | null;
    onVertexMouseDown?: (vertexId: string, e: MouseEvent) => void;
    onEdgeHandleMouseDown?: (vertexId1: string, vertexId2: string, e: MouseEvent) => void;
  } = $props();

  /** 全頂点リスト（重複排除） */
  let allVertexIds = $derived(() => getUniqueVertexIds(anchor.shape));

  /** 全エッジリスト */
  let allEdges = $derived(() => getShapeEdges(anchor.shape));

  /** ハンドルサイズ */
  const VERTEX_RADIUS = 5;
  const EDGE_HANDLE_RADIUS = 3.5;
  const SNAP_INDICATOR_RADIUS = 8;
</script>

<!-- エッジハンドル（中点マーカー） -->
{#each allEdges() as edge (edge.v1 + '-' + edge.v2)}
  {@const v1 = vertices.get(edge.v1)}
  {@const v2 = vertices.get(edge.v2)}
  {#if v1 && v2}
    {@const x1 = geoToSvgX(v1.x)}
    {@const x2 = geoToSvgX(wrapLongitudeNearReference(v2.x, v1.x))}
    {@const mx = (x1 + x2) / 2}
    {@const my = (geoToSvgY(v1.y) + geoToSvgY(v2.y)) / 2}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <rect
      class="edge-handle"
      x={mx - EDGE_HANDLE_RADIUS / zoom}
      y={my - EDGE_HANDLE_RADIUS / zoom}
      width={EDGE_HANDLE_RADIUS * 2 / zoom}
      height={EDGE_HANDLE_RADIUS * 2 / zoom}
      fill="rgba(255, 255, 255, 0.6)"
      stroke="#00ccff"
      stroke-width={1 / zoom}
      style="cursor: copy;"
      onmousedown={(e) => {
        e.stopPropagation();
        onEdgeHandleMouseDown?.(edge.v1, edge.v2, e);
      }}
    />
  {/if}
{/each}

<!-- 頂点ハンドル -->
{#each allVertexIds() as vertexId (vertexId)}
  {@const vertex = vertices.get(vertexId)}
  {#if vertex}
    {@const isSelected = selectedVertexIds.has(vertexId)}
    {@const shared = isVertexShared(vertexId, sharedGroups)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <circle
      class="vertex-handle"
      cx={geoToSvgX(vertex.x)}
      cy={geoToSvgY(vertex.y)}
      r={(isSelected ? VERTEX_RADIUS + 1 : VERTEX_RADIUS) / zoom}
      fill={isSelected ? '#00ccff' : shared ? '#ffaa00' : '#ffffff'}
      stroke={isSelected ? '#ffffff' : shared ? '#ff8800' : '#00ccff'}
      stroke-width={(isSelected ? 2 : 1.5) / zoom}
      style="cursor: move;"
      onmousedown={(e) => {
        e.stopPropagation();
        onVertexMouseDown?.(vertexId, e);
      }}
    />
  {/if}
{/each}

<!-- スナップインジケーター（ドラッグ中の近接頂点表示） -->
{#if snapIndicator}
  <circle
    class="snap-indicator"
    cx={geoToSvgX(snapIndicator.x)}
    cy={geoToSvgY(snapIndicator.y)}
    r={SNAP_INDICATOR_RADIUS / zoom}
    fill="none"
    stroke={snapIndicator.isShared ? '#ffaa00' : '#00ff88'}
    stroke-width={2 / zoom}
    stroke-dasharray="{3 / zoom} {2 / zoom}"
    opacity="0.8"
  />
{/if}
