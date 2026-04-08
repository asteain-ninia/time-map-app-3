<script lang="ts">
  let {
    isOpen = false,
    featureName = '',
    onConfirm,
    onCancel,
  }: {
    isOpen?: boolean;
    featureName?: string;
    onConfirm?: (newName: string) => void;
    onCancel?: () => void;
  } = $props();

  let newFeatureName = $state('');

  $effect(() => {
    if (isOpen) {
      newFeatureName = `${featureName}(分割)`;
    }
  });
</script>

{#if isOpen}
  <div class="modal-overlay">
    <button
      type="button"
      class="modal-backdrop"
      aria-label="分割確認を閉じる"
      onclick={() => onCancel?.()}
    ></button>
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="分割の確認">
      <h3 class="modal-title">分割の確認</h3>

      <p class="modal-desc">
        「{featureName}」を分割します。<br>
        新しい地物の名前を入力してください。
      </p>

      <div class="form-group">
        <label for="split-name">新地物の名前</label>
        <input
          id="split-name"
          type="text"
          bind:value={newFeatureName}
          class="name-input"
        />
      </div>

      <div class="modal-actions">
        <button
          class="btn confirm"
          onclick={() => onConfirm?.(newFeatureName)}
        >
          分割実行
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
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    padding: 0;
  }

  .modal-content {
    position: relative;
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
    margin: 0 0 16px;
    line-height: 1.5;
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
