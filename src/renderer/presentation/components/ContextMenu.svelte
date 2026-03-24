<script lang="ts">
  /** コンテキストメニュー項目 */
  export interface ContextMenuItem {
    readonly label: string;
    readonly action: () => void;
    readonly disabled?: boolean;
    readonly separator?: false;
  }

  /** セパレーター */
  export interface ContextMenuSeparator {
    readonly separator: true;
  }

  export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

  let {
    isOpen = false,
    x = 0,
    y = 0,
    items = [] as readonly ContextMenuEntry[],
    onClose,
  }: {
    isOpen?: boolean;
    x?: number;
    y?: number;
    items?: readonly ContextMenuEntry[];
    onClose?: () => void;
  } = $props();

  function handleClick(item: ContextMenuEntry): void {
    if ('separator' in item && item.separator) return;
    if (item.disabled) return;
    (item as ContextMenuItem).action();
    onClose?.();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="context-overlay" onclick={() => onClose?.()}>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="context-menu"
      style="left: {x}px; top: {y}px;"
      onclick={(e) => e.stopPropagation()}
    >
      {#each items as item}
        {#if 'separator' in item && item.separator}
          <div class="separator"></div>
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
          <div
            class="menu-item"
            class:disabled={item.disabled}
            onclick={() => handleClick(item)}
          >
            {item.label}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .context-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2000;
  }

  .context-menu {
    position: absolute;
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 4px 0;
    min-width: 140px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .menu-item {
    padding: 5px 16px;
    font-size: 12px;
    color: #e0e0e0;
    cursor: pointer;
    white-space: nowrap;
  }

  .menu-item:hover:not(.disabled) {
    background: #094771;
  }

  .menu-item.disabled {
    color: #666;
    cursor: default;
  }

  .separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }
</style>
