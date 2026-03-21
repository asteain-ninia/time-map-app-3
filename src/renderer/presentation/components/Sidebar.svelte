<script lang="ts">
  import LayerPanel from './LayerPanel.svelte';

  type SidebarTab = 'layers' | 'properties' | 'features';

  let activeTab = $state<SidebarTab>('layers');
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
      <div class="empty-message">地物または頂点が選択されていません</div>
    {:else if activeTab === 'features'}
      <div class="empty-message">地物はまだありません</div>
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
</style>
