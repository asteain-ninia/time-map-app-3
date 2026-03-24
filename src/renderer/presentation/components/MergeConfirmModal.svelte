<script lang="ts">
  let {
    isOpen = false,
    featureNames = [] as readonly string[],
    onConfirm,
    onCancel,
  }: {
    isOpen?: boolean;
    featureNames?: readonly string[];
    onConfirm?: (mergedName: string) => void;
    onCancel?: () => void;
  } = $props();

  let mergedName = $state('');

  $effect(() => {
    if (isOpen && featureNames.length > 0) {
      mergedName = featureNames[0];
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="modal-overlay" onclick={() => onCancel?.()}>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3 class="modal-title">地物の結合</h3>

      <p class="modal-desc">
        {featureNames.length}個の地物を結合します。
      </p>

      <div class="feature-list">
        {#each featureNames as name, i}
          <div class="feature-item">
            <span class="feature-badge">{i + 1}</span>
            <span>{name}</span>
          </div>
        {/each}
      </div>

      <div class="form-group">
        <label for="merge-name">結合後の名前</label>
        <input
          id="merge-name"
          type="text"
          bind:value={mergedName}
          class="name-input"
        />
      </div>

      <div class="modal-actions">
        <button
          class="btn confirm"
          onclick={() => onConfirm?.(mergedName)}
        >
          結合実行
        </button>
        <button
          class="btn cancel"
          onclick={() => onCancel?.()}
        >
          キャンセル
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
    min-width: 320px;
    max-width: 400px;
  }

  .modal-title {
    margin: 0 0 12px;
    font-size: 14px;
    color: #e0e0e0;
  }

  .modal-desc {
    font-size: 12px;
    color: #aaa;
    margin: 0 0 12px;
  }

  .feature-list {
    margin-bottom: 16px;
    max-height: 120px;
    overflow-y: auto;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
    color: #ccc;
  }

  .feature-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #094771;
    color: #fff;
    font-size: 10px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 11px;
    color: #aaa;
    margin-bottom: 4px;
  }

  .name-input {
    width: 100%;
    padding: 6px 8px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .name-input:focus {
    outline: none;
    border-color: #007acc;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid #555;
    font-size: 12px;
    cursor: pointer;
  }

  .btn.confirm {
    background: #094771;
    color: #fff;
    border-color: #007acc;
  }

  .btn.confirm:hover {
    background: #0b5a8e;
  }

  .btn.cancel {
    background: #3c3c3c;
    color: #ccc;
  }

  .btn.cancel:hover {
    background: #4c4c4c;
  }
</style>
