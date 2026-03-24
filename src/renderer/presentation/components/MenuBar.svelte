<script lang="ts">
  let {
    onNewProject,
    onOpen,
    onSave,
    onSaveAs,
    onUndo,
    onRedo,
    onSelectAll,
    onSettings,
  }: {
    onNewProject?: () => void;
    onOpen?: () => void;
    onSave?: () => void;
    onSaveAs?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSelectAll?: () => void;
    onSettings?: () => void;
  } = $props();

  /** 現在開いているメニュー */
  let openMenu = $state<string | null>(null);

  function toggleMenu(menu: string): void {
    openMenu = openMenu === menu ? null : menu;
  }

  function closeMenu(): void {
    openMenu = null;
  }

  function doAction(action: (() => void) | undefined): void {
    action?.();
    closeMenu();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
{#if openMenu}
  <div class="menu-backdrop" onclick={closeMenu}></div>
{/if}

<div class="menu-bar">
  <div class="menu-item-wrapper">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <span class="menu-trigger" onclick={() => toggleMenu('file')}>ファイル</span>
    {#if openMenu === 'file'}
      <div class="menu-dropdown">
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onNewProject)}>
          <span>新規プロジェクト</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onOpen)}>
          <span>開く</span>
          <span class="shortcut">Ctrl+O</span>
        </div>
        <div class="menu-separator"></div>
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onSave)}>
          <span>保存</span>
          <span class="shortcut">Ctrl+S</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onSaveAs)}>
          <span>名前を付けて保存</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <span class="menu-trigger" onclick={() => toggleMenu('edit')}>編集</span>
    {#if openMenu === 'edit'}
      <div class="menu-dropdown">
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onUndo)}>
          <span>元に戻す</span>
          <span class="shortcut">Ctrl+Z</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onRedo)}>
          <span>やり直し</span>
          <span class="shortcut">Ctrl+Y</span>
        </div>
        <div class="menu-separator"></div>
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onSelectAll)}>
          <span>全選択</span>
          <span class="shortcut">Ctrl+A</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <span class="menu-trigger" onclick={() => toggleMenu('tools')}>ツール</span>
    {#if openMenu === 'tools'}
      <div class="menu-dropdown">
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action" onclick={() => doAction(onSettings)}>
          <span>プロジェクト設定</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <span class="menu-trigger" onclick={() => toggleMenu('help')}>ヘルプ</span>
    {#if openMenu === 'help'}
      <div class="menu-dropdown">
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div class="menu-action disabled">
          <span>バージョン情報</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .menu-backdrop {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 99;
  }

  .menu-bar {
    display: flex;
    background: #2d2d2d;
    border-bottom: 1px solid #3c3c3c;
    padding: 0 4px;
    height: 24px;
    align-items: center;
    font-size: 12px;
    z-index: 100;
  }

  .menu-item-wrapper {
    position: relative;
  }

  .menu-trigger {
    padding: 2px 8px;
    color: #ccc;
    cursor: pointer;
    border-radius: 3px;
  }

  .menu-trigger:hover {
    background: #3c3c3c;
  }

  .menu-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 4px 0;
    min-width: 180px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .menu-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 16px;
    color: #e0e0e0;
    cursor: pointer;
  }

  .menu-action:hover:not(.disabled) {
    background: #094771;
  }

  .menu-action.disabled {
    color: #666;
    cursor: default;
  }

  .shortcut {
    color: #888;
    font-size: 11px;
    margin-left: 24px;
  }

  .menu-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }
</style>
