<script lang="ts">
  import type { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
  import type { Vertex } from '@domain/entities/Vertex';
  import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
  import { Coordinate } from '@domain/value-objects/Coordinate';
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
    viewWidthPx = 800,
    selectedVertexIds = new Set<string>(),
    sharedGroups = new Map<string, SharedVertexGroup>(),
    snapIndicators = [],
    visibleVertexIds = undefined as ReadonlySet<string> | undefined,
    showEdgeHandles = true,
    onVertexMouseDown,
    onVertexActivate,
    onEdgeHandleMouseDown,
    onEdgeHandleActivate,
  }: {
    anchor: FeatureAnchor;
    vertices: ReadonlyMap<string, Vertex>;
    zoom: number;
    viewWidthPx?: number;
    selectedVertexIds?: ReadonlySet<string>;
    sharedGroups?: ReadonlyMap<string, SharedVertexGroup>;
    snapIndicators?: readonly SnapIndicator[];
    visibleVertexIds?: ReadonlySet<string>;
    showEdgeHandles?: boolean;
    onVertexMouseDown?: (vertexId: string, startCoord: Coordinate, e: MouseEvent) => void;
    onVertexActivate?: (vertexId: string, startCoord: Coordinate, isAdditive: boolean) => void;
    onEdgeHandleMouseDown?: (
      vertexId1: string,
      vertexId2: string,
      midpoint: Coordinate,
      e: MouseEvent
    ) => void;
    onEdgeHandleActivate?: (
      vertexId1: string,
      vertexId2: string,
      midpoint: Coordinate
    ) => void;
  } = $props();

  /** 形状の生値頂点位置 */
  let vertexPositions = $derived(() => getShapeVertexPositions(anchor.shape, vertices));

  /** 表示対象の頂点位置 */
  let renderedVertexPositions = $derived(() => {
    if (!visibleVertexIds) {
      return vertexPositions();
    }
    return vertexPositions().filter((vertex) => visibleVertexIds.has(vertex.vertexId));
  });

  /** 形状の生値エッジ位置 */
  let edgePositions = $derived(() => getShapeEdgePositions(anchor.shape, vertices));

  /** スナップ表示を選択形状と同じラップへ寄せるための基準経度 */
  let snapReferenceLon = $derived(() => renderedVertexPositions()[0]?.x ?? vertexPositions()[0]?.x);

  /** ハンドルサイズ */
  const VERTEX_RADIUS = 5;
  const EDGE_HANDLE_RADIUS = 3.5;
  const SNAP_INDICATOR_RADIUS = 8;

  let worldUnitsPerPixel = $derived(360 / Math.max(zoom, 0.0001) / Math.max(viewWidthPx, 1));

  function pxToWorld(px: number): number {
    return px * worldUnitsPerPixel;
  }

  function isActivationKey(key: string): boolean {
    return key === 'Enter' || key === ' ';
  }
</script>

<!-- エッジハンドル（中点マーカー） -->
{#if showEdgeHandles}
  {#each edgePositions() as edge (edge.v1 + '-' + edge.v2)}
    {@const mx = (geoToSvgX(edge.x1) + geoToSvgX(edge.x2)) / 2}
    {@const my = (geoToSvgY(edge.y1) + geoToSvgY(edge.y2)) / 2}
    {@const midpoint = new Coordinate((edge.x1 + edge.x2) / 2, (edge.y1 + edge.y2) / 2)}
    <rect
      class="edge-handle"
      role="button"
      tabindex="0"
      aria-label="エッジ中点に頂点を追加"
      x={mx - pxToWorld(EDGE_HANDLE_RADIUS)}
      y={my - pxToWorld(EDGE_HANDLE_RADIUS)}
      width={pxToWorld(EDGE_HANDLE_RADIUS * 2)}
      height={pxToWorld(EDGE_HANDLE_RADIUS * 2)}
      fill="rgba(255, 255, 255, 0.6)"
      stroke="#00ccff"
      stroke-width={pxToWorld(1)}
      style="cursor: copy;"
      onmousedown={(e) => {
        e.stopPropagation();
        onEdgeHandleMouseDown?.(edge.v1, edge.v2, midpoint, e);
      }}
      onkeydown={(e) => {
        if (!isActivationKey(e.key)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onEdgeHandleActivate?.(edge.v1, edge.v2, midpoint);
      }}
    />
  {/each}
{/if}

<!-- 頂点ハンドル -->
{#each renderedVertexPositions() as vertex (vertex.vertexId)}
  {@const isSelected = selectedVertexIds.has(vertex.vertexId)}
  {@const shared = isVertexShared(vertex.vertexId, sharedGroups)}
  <circle
    class="vertex-handle"
    class:selected={isSelected}
    role="button"
    tabindex="0"
    aria-label={isSelected ? '選択中の頂点' : '頂点を選択'}
    cx={geoToSvgX(vertex.x)}
    cy={geoToSvgY(vertex.y)}
    r={pxToWorld(isSelected ? VERTEX_RADIUS + 1 : VERTEX_RADIUS)}
    fill={isSelected ? '#00ccff' : shared ? '#ffaa00' : '#ffffff'}
    stroke={isSelected ? '#ffffff' : shared ? '#ff8800' : '#00ccff'}
    stroke-width={pxToWorld(isSelected ? 2 : 1.5)}
    style="cursor: move;"
    onmousedown={(e) => {
      e.stopPropagation();
      onVertexMouseDown?.(vertex.vertexId, new Coordinate(vertex.x, vertex.y), e);
    }}
    onkeydown={(e) => {
      if (!isActivationKey(e.key)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onVertexActivate?.(vertex.vertexId, new Coordinate(vertex.x, vertex.y), e.shiftKey);
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
    r={pxToWorld(SNAP_INDICATOR_RADIUS)}
    fill="none"
    stroke={snapIndicator.isShared ? '#ffaa00' : '#00ff88'}
    stroke-width={pxToWorld(2)}
    stroke-dasharray="{pxToWorld(3)} {pxToWorld(2)}"
    opacity="0.8"
  />
{/each}
