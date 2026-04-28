<script lang="ts">
  import LayerPanel from './LayerPanel.svelte';
  import PropertyPanel from './PropertyPanel.svelte';
  import FeatureListPanel from './FeatureListPanel.svelte';
  import type { Feature } from '@domain/entities/Feature';
  import type { WorldSettings } from '@domain/entities/World';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { AnchorProperty } from '@domain/value-objects/FeatureAnchor';

  type SidebarTab = 'layers' | 'properties' | 'features';

  let {
    selectedFeature = null as Feature | null,
    propertySelectionState = { kind: 'empty' as const },
    focusedLayerId = null as string | null,
    settings = undefined as WorldSettings | undefined,
    currentTime = undefined as TimePoint | undefined,
    timelineMin = 0,
    timelineMax = 10000,
    features = [] as readonly Feature[],
    isCollapsed = false,
    onFocusLayerChange,
    onPropertyChange,
    onFeatureSelect,
    onCollapsedChange,
  }: {
    selectedFeature?: Feature | null;
    propertySelectionState?: {
      kind: 'empty' | 'multiple' | 'unknown';
      featureSummaries?: readonly { id: string; name: string }[];
      remainingCount?: number;
    };
    focusedLayerId?: string | null;
    settings?: WorldSettings;
    currentTime?: TimePoint;
    timelineMin?: number;
    timelineMax?: number;
    features?: readonly Feature[];
    isCollapsed?: boolean;
    onFocusLayerChange?: (layerId: string | null) => void;
    onPropertyChange?: (featureId: string, anchorId: string, property: AnchorProperty) => void;
    onFeatureSelect?: (featureId: string) => void;
    onCollapsedChange?: (collapsed: boolean) => void;
  } = $props();

  let activeTab = $state<SidebarTab>('layers');
  let featureSearchQuery = $state('');
  let lastAutoOpenedFeatureId = $state<string | null>(null);

  /** 新しい地物が選択された時だけプロパティタブへ移動する */
  $effect(() => {
    const selectedFeatureId = selectedFeature?.id ?? null;
    if (selectedFeatureId && selectedFeatureId !== lastAutoOpenedFeatureId) {
      activeTab = 'properties';
      onCollapsedChange?.(false);
    }
    lastAutoOpenedFeatureId = selectedFeatureId;
  });

  function selectTab(tab: SidebarTab): void {
    activeTab = tab;
    onCollapsedChange?.(false);
  }

  function toggleCollapsed(): void {
    onCollapsedChange?.(!isCollapsed);
  }
</script>

<div class="sidebar" class:collapsed={isCollapsed}>
  {#if isCollapsed}
    <button
      class="collapsed-toggle"
      type="button"
      title="サイドバーを開く"
      aria-expanded="false"
      onclick={toggleCollapsed}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M10 7l5 5-5 5z" fill="currentColor" />
      </svg>
    </button>
  {:else}
    <div class="tab-bar">
      <button
        class="tab"
        class:active={activeTab === 'layers'}
        type="button"
        onclick={() => selectTab('layers')}
      >
        レイヤー
      </button>
      <button
        class="tab"
        class:active={activeTab === 'properties'}
        type="button"
        onclick={() => selectTab('properties')}
      >
        プロパティ
      </button>
      <button
        class="tab"
        class:active={activeTab === 'features'}
        type="button"
        onclick={() => selectTab('features')}
      >
        地物一覧
      </button>
      <button
        class="collapse-button"
        type="button"
        title="サイドバーを折りたたむ"
        aria-expanded="true"
        onclick={toggleCollapsed}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" fill="currentColor" />
        </svg>
      </button>
    </div>
    <div class="tab-content">
      {#if activeTab === 'layers'}
        <LayerPanel {focusedLayerId} {onFocusLayerChange} />
      {:else if activeTab === 'properties'}
        <PropertyPanel
          feature={selectedFeature}
          selectionState={propertySelectionState}
          {settings}
          {currentTime}
          {timelineMin}
          {timelineMax}
          {features}
          {onPropertyChange}
        />
      {:else if activeTab === 'features'}
        <FeatureListPanel
          selectedFeatureId={selectedFeature?.id ?? null}
          {currentTime}
          {features}
          searchQuery={featureSearchQuery}
          onSearchQueryChange={(query) => featureSearchQuery = query}
          {onFeatureSelect}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid #3c3c3c;
  }

  .sidebar.collapsed {
    align-items: center;
    justify-content: flex-start;
    padding-top: 8px;
  }

  .tab {
    flex: 1 1 0;
    padding: 8px 4px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #888;
    cursor: pointer;
    font-size: 12px;
  }

  .tab:hover {
    color: #e0e0e0;
  }

  .tab.active {
    color: #e0e0e0;
    border-bottom-color: #007acc;
  }

  .collapse-button {
    width: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-left: 1px solid #3c3c3c;
    color: #888;
    cursor: pointer;
    flex-shrink: 0;
  }

  .collapse-button:hover {
    color: #e0e0e0;
    background: #2f2f2f;
  }

  .collapsed-toggle {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2d2d2d;
    border: 1px solid #4b4b4b;
    border-radius: 6px;
    color: #cfcfcf;
    cursor: pointer;
  }

  .collapsed-toggle:hover {
    background: #383838;
  }

  .tab-content {
    flex: 1;
    padding: 12px;
    min-height: 0;
    overflow-y: auto;
  }
</style>
