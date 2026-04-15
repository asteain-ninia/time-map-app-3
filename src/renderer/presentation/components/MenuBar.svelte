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
    onAbout,
  }: {
    onNewProject?: () => void;
    onOpen?: () => void;
    onSave?: () => void;
    onSaveAs?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSelectAll?: () => void;
    onSettings?: () => void;
    onAbout?: () => void;
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

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && openMenu) {
      closeMenu();
      e.stopPropagation();
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if openMenu}
  <button
    type="button"
    class="menu-backdrop"
    aria-label="メニューを閉じる"
    onclick={closeMenu}
  ></button>
{/if}

<div class="menu-bar" role="menubar" aria-label="アプリメニュー">
  <div class="menu-item-wrapper">
    <button
      type="button"
      class="menu-trigger"
      aria-haspopup="true"
      aria-expanded={openMenu === 'file'}
      onclick={() => toggleMenu('file')}
    >
      ファイル
    </button>
    {#if openMenu === 'file'}
      <div class="menu-dropdown" role="menu" aria-label="ファイル">
        <button type="button" class="menu-action" onclick={() => doAction(onNewProject)}>
          <span>新規プロジェクト</span>
        </button>
        <button type="button" class="menu-action" onclick={() => doAction(onOpen)}>
          <span>開く</span>
          <span class="shortcut">Ctrl+O</span>
        </button>
        <div class="menu-separator"></div>
        <button type="button" class="menu-action" onclick={() => doAction(onSave)}>
          <span>保存</span>
          <span class="shortcut">Ctrl+S</span>
        </button>
        <button type="button" class="menu-action" onclick={() => doAction(onSaveAs)}>
          <span>名前を付けて保存</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <button
      type="button"
      class="menu-trigger"
      aria-haspopup="true"
      aria-expanded={openMenu === 'edit'}
      onclick={() => toggleMenu('edit')}
    >
      編集
    </button>
    {#if openMenu === 'edit'}
      <div class="menu-dropdown" role="menu" aria-label="編集">
        <button type="button" class="menu-action" onclick={() => doAction(onUndo)}>
          <span>元に戻す</span>
          <span class="shortcut">Ctrl+Z</span>
        </button>
        <button type="button" class="menu-action" onclick={() => doAction(onRedo)}>
          <span>やり直し</span>
          <span class="shortcut">Ctrl+Y</span>
        </button>
        <div class="menu-separator"></div>
        <button type="button" class="menu-action" onclick={() => doAction(onSelectAll)}>
          <span>全頂点選択</span>
          <span class="shortcut">Ctrl+A</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <button
      type="button"
      class="menu-trigger"
      aria-haspopup="true"
      aria-expanded={openMenu === 'tools'}
      onclick={() => toggleMenu('tools')}
    >
      ツール
    </button>
    {#if openMenu === 'tools'}
      <div class="menu-dropdown" role="menu" aria-label="ツール">
        <button type="button" class="menu-action" onclick={() => doAction(onSettings)}>
          <span>プロジェクト設定</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item-wrapper">
    <button
      type="button"
      class="menu-trigger"
      aria-haspopup="true"
      aria-expanded={openMenu === 'help'}
      onclick={() => toggleMenu('help')}
    >
      ヘルプ
    </button>
    {#if openMenu === 'help'}
      <div class="menu-dropdown" role="menu" aria-label="ヘルプ">
        <button type="button" class="menu-action" onclick={() => doAction(onAbout)}>
          <span>バージョン情報</span>
        </button>
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
    border: none;
    background: transparent;
    padding: 2px 8px;
    color: #ccc;
    font: inherit;
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
    width: 100%;
    border: none;
    background: transparent;
    justify-content: space-between;
    align-items: center;
    padding: 5px 16px;
    color: #e0e0e0;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .menu-action:hover:not(:disabled) {
    background: #094771;
  }

  .menu-action:disabled {
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
