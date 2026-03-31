<script lang="ts">
  import LayerPanel from './LayerPanel.svelte';
  import PropertyPanel from './PropertyPanel.svelte';
  import type { Feature } from '@domain/entities/Feature';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { AnchorProperty } from '@domain/value-objects/FeatureAnchor';

  type SidebarTab = 'layers' | 'properties' | 'features';

  let {
    selectedFeature = null as Feature | null,
    propertySelectionState = { kind: 'empty' as const },
    currentTime = undefined as TimePoint | undefined,
    features = [] as readonly Feature[],
    onPropertyChange,
    onFeatureSelect,
  }: {
    selectedFeature?: Feature | null;
    propertySelectionState?: {
      kind: 'empty' | 'multiple' | 'unknown';
      featureSummaries?: readonly { id: string; name: string }[];
      remainingCount?: number;
    };
    currentTime?: TimePoint;
    features?: readonly Feature[];
    onPropertyChange?: (featureId: string, anchorId: string, property: AnchorProperty) => void;
    onFeatureSelect?: (featureId: string) => void;
  } = $props();

  let activeTab = $state<SidebarTab>('layers');
  let lastAutoOpenedFeatureId = $state<string | null>(null);

  /** 新しい地物が選択された時だけプロパティタブへ移動する */
  $effect(() => {
    const selectedFeatureId = selectedFeature?.id ?? null;
    if (selectedFeatureId && selectedFeatureId !== lastAutoOpenedFeatureId && activeTab !== 'properties') {
      activeTab = 'properties';
    }
    lastAutoOpenedFeatureId = selectedFeatureId;
  });
</script>

<div class="sidebar">
  <div class="tab-bar">
    <button
      class="tab"
      class:active={activeTab === 'layers'}
      onclick={() => activeTab = 'layers'}
    >
      レイヤー
    </button>
    <button
      class="tab"
      class:active={activeTab === 'properties'}
      onclick={() => activeTab = 'properties'}
    >
      プロパティ
    </button>
    <button
      class="tab"
      class:active={activeTab === 'features'}
      onclick={() => activeTab = 'features'}
    >
      地物一覧
    </button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'layers'}
      <LayerPanel />
    {:else if activeTab === 'properties'}
      <PropertyPanel
        feature={selectedFeature}
        selectionState={propertySelectionState}
        {currentTime}
        {onPropertyChange}
      />
    {:else if activeTab === 'features'}
      {#if features.length === 0}
        <div class="empty-message">地物はまだありません</div>
      {:else}
        <div class="feature-list">
          {#each features as f}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div
              class="feature-item"
              class:selected={selectedFeature?.id === f.id}
              onclick={() => onFeatureSelect?.(f.id)}
            >
              <span class="feature-type-badge">
                {f.featureType === 'Point' ? '点' : f.featureType === 'Line' ? '線' : '面'}
              </span>
              <span class="feature-name">
                {currentTime ? (f.getActiveAnchor(currentTime)?.property.name || f.id) : f.id}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
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

  .tab {
    flex: 1;
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

  .tab-content {
    flex: 1;
    padding: 12px;
    min-height: 0;
    overflow-y: auto;
  }

  .empty-message {
    color: #888;
    font-size: 12px;
    text-align: center;
    padding: 24px 8px;
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: #ccc;
  }

  .feature-item:hover {
    background: #333;
  }

  .feature-item.selected {
    background: #094771;
    color: #fff;
  }

  .feature-type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    background: #444;
    font-size: 10px;
    flex-shrink: 0;
  }

  .feature-item.selected .feature-type-badge {
    background: #007acc;
  }

  .feature-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
