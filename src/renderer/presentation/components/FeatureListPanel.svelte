<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import {
    buildFeatureSearchItems,
    filterFeatureSearchItems,
    getHighlightSegments,
  } from './featureSearchUtils';

  let {
    selectedFeatureId = null as string | null,
    currentTime = undefined as TimePoint | undefined,
    features = [] as readonly Feature[],
    searchQuery = '',
    onSearchQueryChange,
    onFeatureSelect,
  }: {
    selectedFeatureId?: string | null;
    currentTime?: TimePoint;
    features?: readonly Feature[];
    searchQuery?: string;
    onSearchQueryChange?: (query: string) => void;
    onFeatureSelect?: (featureId: string) => void;
  } = $props();

  let featureItems = $derived(buildFeatureSearchItems(features, currentTime));
  let filteredItems = $derived(filterFeatureSearchItems(featureItems, searchQuery));
  let resultCountLabel = $derived(
    searchQuery.trim().length === 0
      ? `${featureItems.length}件`
      : `${filteredItems.length} / ${featureItems.length}件`
  );

  function getFeatureTypeLabel(featureType: Feature['featureType']): string {
    switch (featureType) {
      case 'Point':
        return '点';
      case 'Line':
        return '線';
      case 'Polygon':
        return '面';
    }
  }

  function updateSearchQuery(event: Event): void {
    onSearchQueryChange?.((event.target as HTMLInputElement).value);
  }

  function clearSearchQuery(): void {
    onSearchQueryChange?.('');
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && searchQuery.length > 0) {
      event.preventDefault();
      clearSearchQuery();
      return;
    }

    if (event.key === 'Enter' && searchQuery.trim().length > 0 && filteredItems.length > 0) {
      event.preventDefault();
      onFeatureSelect?.(filteredItems[0].id);
    }
  }
</script>

<div class="feature-search">
  <label class="feature-search-label" for="feature-search-input">地物検索</label>
  <div class="feature-search-row">
    <input
      id="feature-search-input"
      class="feature-search-input"
      type="search"
      placeholder="ID / 名前 / 説明 / 属性"
      value={searchQuery}
      spellcheck="false"
      oninput={updateSearchQuery}
      onkeydown={onSearchKeydown}
    />
    {#if searchQuery.length > 0}
      <button
        class="feature-search-clear"
        type="button"
        onclick={clearSearchQuery}
        aria-label="検索条件をクリア"
      >
        クリア
      </button>
    {/if}
  </div>
  <div class="feature-search-meta">
    <span>検索結果: {resultCountLabel}</span>
    <span>Enterで先頭結果へ移動</span>
  </div>
</div>

{#if featureItems.length === 0}
  <div class="empty-message">地物はまだありません</div>
{:else if filteredItems.length === 0}
  <div class="empty-message">一致する地物はありません</div>
{:else}
  <div class="feature-list" role="list">
    {#each filteredItems as item (item.id)}
      <button
        class="feature-item"
        class:selected={selectedFeatureId === item.id}
        class:inactive={!item.isActiveAtCurrentTime}
        type="button"
        onclick={() => onFeatureSelect?.(item.id)}
      >
        <span class="feature-header">
          <span class="feature-type-badge">
            {getFeatureTypeLabel(item.featureType)}
          </span>
          <span class="feature-name">
            {#each getHighlightSegments(item.displayName, searchQuery) as segment}
              {#if segment.match}
                <mark class="feature-highlight">{segment.text}</mark>
              {:else}
                {segment.text}
              {/if}
            {/each}
          </span>
        </span>

        <span class="feature-id-line">
          <span class="feature-id-label">ID</span>
          <span class="feature-id-value">
            {#each getHighlightSegments(item.id, searchQuery) as segment}
              {#if segment.match}
                <mark class="feature-highlight">{segment.text}</mark>
              {:else}
                {segment.text}
              {/if}
            {/each}
          </span>
        </span>

        {#if item.description}
          <span class="feature-description">
            {#each getHighlightSegments(item.description, searchQuery) as segment}
              {#if segment.match}
                <mark class="feature-highlight">{segment.text}</mark>
              {:else}
                {segment.text}
              {/if}
            {/each}
          </span>
        {/if}

        {#if item.attributeSummary}
          <span class="feature-attributes">
            {#each getHighlightSegments(item.attributeSummary, searchQuery) as segment}
              {#if segment.match}
                <mark class="feature-highlight">{segment.text}</mark>
              {:else}
                {segment.text}
              {/if}
            {/each}
          </span>
        {/if}

        {#if !item.isActiveAtCurrentTime}
          <span class="feature-status">現在時点では未出現</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .feature-search {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .feature-search-label {
    font-size: 11px;
    color: #aaa;
    font-weight: 600;
  }

  .feature-search-row {
    display: flex;
    gap: 6px;
  }

  .feature-search-input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    background: #1f1f1f;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 12px;
  }

  .feature-search-input:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 1px rgba(0, 122, 204, 0.35);
  }

  .feature-search-clear {
    flex-shrink: 0;
    padding: 0 10px;
    background: #333;
    border: 1px solid #4c4c4c;
    border-radius: 6px;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
  }

  .feature-search-clear:hover {
    background: #3d3d3d;
  }

  .feature-search-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    color: #888;
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
    gap: 4px;
  }

  .feature-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 8px 10px;
    background: #2a2a2a;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #ccc;
    cursor: pointer;
    text-align: left;
  }

  .feature-item:hover {
    background: #333;
    border-color: #444;
  }

  .feature-item.selected {
    background: #094771;
    border-color: #007acc;
    color: #fff;
  }

  .feature-item.inactive {
    opacity: 0.7;
  }

  .feature-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
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

  .feature-name,
  .feature-id-value,
  .feature-description,
  .feature-attributes {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .feature-name {
    font-size: 12px;
    font-weight: 600;
  }

  .feature-id-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: #999;
    font-size: 10px;
  }

  .feature-id-label {
    flex-shrink: 0;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    letter-spacing: 0.04em;
  }

  .feature-description,
  .feature-attributes,
  .feature-status {
    font-size: 11px;
    color: #b8b8b8;
  }

  .feature-status {
    color: #d0a96f;
  }

  .feature-highlight {
    padding: 0;
    background: rgba(255, 204, 102, 0.9);
    color: #111;
    border-radius: 2px;
  }
</style>
