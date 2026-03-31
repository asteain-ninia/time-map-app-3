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
  import {
    getShapeEdgePositions,
    getShapeVertexPositions,
  } from '@infrastructure/rendering/vertexHandleUtils';
  import { isVertexShared } from '@infrastructure/rendering/snapIndicatorUtils';

  let {
    anchor,
    vertices,
    zoom,
    selectedVertexIds = new Set<string>(),
    sharedGroups = new Map<string, SharedVertexGroup>(),
    snapIndicators = [],
    showEdgeHandles = true,
    onVertexMouseDown,
    onEdgeHandleMouseDown,
  }: {
    anchor: FeatureAnchor;
    vertices: ReadonlyMap<string, Vertex>;
    zoom: number;
    selectedVertexIds?: ReadonlySet<string>;
    sharedGroups?: ReadonlyMap<string, SharedVertexGroup>;
    snapIndicators?: readonly SnapIndicator[];
    showEdgeHandles?: boolean;
    onVertexMouseDown?: (vertexId: string, e: MouseEvent) => void;
    onEdgeHandleMouseDown?: (vertexId1: string, vertexId2: string, e: MouseEvent) => void;
  } = $props();

  /** 形状のアンラップ済み頂点位置 */
  let vertexPositions = $derived(() => getShapeVertexPositions(anchor.shape, vertices));

  /** 形状のアンラップ済みエッジ位置 */
  let edgePositions = $derived(() => getShapeEdgePositions(anchor.shape, vertices));

  /** スナップ表示を選択形状と同じラップへ寄せるための基準経度 */
  let snapReferenceLon = $derived(() => vertexPositions()[0]?.x);

  /** ハンドルサイズ */
  const VERTEX_RADIUS = 5;
  const EDGE_HANDLE_RADIUS = 3.5;
  const SNAP_INDICATOR_RADIUS = 8;
</script>

<!-- エッジハンドル（中点マーカー） -->
{#if showEdgeHandles}
  {#each edgePositions() as edge (edge.v1 + '-' + edge.v2)}
    {@const mx = (geoToSvgX(edge.x1) + geoToSvgX(edge.x2)) / 2}
    {@const my = (geoToSvgY(edge.y1) + geoToSvgY(edge.y2)) / 2}
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
  {/each}
{/if}

<!-- 頂点ハンドル -->
{#each vertexPositions() as vertex (vertex.vertexId)}
  {@const isSelected = selectedVertexIds.has(vertex.vertexId)}
  {@const shared = isVertexShared(vertex.vertexId, sharedGroups)}
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
      onVertexMouseDown?.(vertex.vertexId, e);
    }}
  />
{/each}

<!-- スナップインジケーター（ドラッグ中の近接頂点表示） -->
{#each snapIndicators as snapIndicator (snapIndicator.targetVertexId)}
  {@const snapLon =
    snapReferenceLon() === undefined
      ? snapIndicator.x
      : wrapLongitudeNearReference(snapIndicator.x, snapReferenceLon()!)}
  <circle
    class="snap-indicator"
    cx={geoToSvgX(snapLon)}
    cy={geoToSvgY(snapIndicator.y)}
    r={SNAP_INDICATOR_RADIUS / zoom}
    fill="none"
    stroke={snapIndicator.isShared ? '#ffaa00' : '#00ff88'}
    stroke-width={2 / zoom}
    stroke-dasharray="{3 / zoom} {2 / zoom}"
    opacity="0.8"
  />
{/each}
