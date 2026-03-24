<script lang="ts">
  import type { ToolMode, AddToolType } from '@presentation/state/toolMachine';

  let {
    mode = 'view' as ToolMode,
    addToolType = 'polygon' as AddToolType,
    onModeChange,
    onAddToolChange,
    onSettingsClick,
  }: {
    mode?: ToolMode;
    addToolType?: AddToolType;
    onModeChange?: (mode: ToolMode) => void;
    onAddToolChange?: (toolType: AddToolType) => void;
    onSettingsClick?: () => void;
  } = $props();

  function setMode(m: ToolMode): void {
    onModeChange?.(m);
  }

  function setAddTool(t: AddToolType): void {
    onAddToolChange?.(t);
  }
</script>

<div class="toolbar">
  <div class="tool-group">
    <button
      class="tool-button"
      class:active={mode === 'view'}
      onclick={() => setMode('view')}
      title="表示モード (V)"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
      </svg>
    </button>
    <button
      class="tool-button"
      class:active={mode === 'add'}
      onclick={() => setMode('add')}
      title="追加モード (A)"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
      </svg>
    </button>
    <button
      class="tool-button"
      class:active={mode === 'edit'}
      onclick={() => setMode('edit')}
      title="編集モード (E)"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
      </svg>
    </button>
    <button
      class="tool-button"
      class:active={mode === 'measure'}
      onclick={() => setMode('measure')}
      title="測量モード (M)"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2v8z" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <!-- 追加モード時のサブツール選択 -->
  {#if mode === 'add'}
    <div class="tool-separator"></div>
    <div class="tool-group">
      <button
        class="tool-button sub-tool"
        class:active={addToolType === 'point'}
        onclick={() => setAddTool('point')}
        title="点を追加"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
      </button>
      <button
        class="tool-button sub-tool"
        class:active={addToolType === 'line'}
        onclick={() => setAddTool('line')}
        title="線を追加"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path d="M4 20L20 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        </svg>
      </button>
      <button
        class="tool-button sub-tool"
        class:active={addToolType === 'polygon'}
        onclick={() => setAddTool('polygon')}
        title="面を追加"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <polygon points="12,3 21,18 3,18" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
    </div>
  {/if}

  <div class="tool-separator"></div>

  <div class="tool-group">
    <button class="tool-button" title="設定" onclick={() => onSettingsClick?.()}>
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    height: 100%;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-separator {
    width: 32px;
    height: 1px;
    background: #3c3c3c;
    margin: 8px 0;
  }

  .tool-button {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #cccccc;
    cursor: pointer;
  }

  .tool-button:hover {
    background: #3c3c3c;
  }

  .tool-button.active {
    background: #094771;
    border-color: #007acc;
    color: #ffffff;
  }

  .tool-button.sub-tool {
    width: 32px;
    height: 32px;
  }

  .tool-button.sub-tool.active {
    background: #0e3a5e;
    border-color: #005a9e;
  }
</style>
