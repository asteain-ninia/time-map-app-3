<script lang="ts">
  let {
    featureType = null,
    isRingDrawing = false,
    isKnifeDrawing = false,
    canConfirm = false,
    canConfirmKnife = false,
    isFeatureMoveMode = false,
    onAddHole,
    onAddExclave,
    onConfirmRing,
    onCancelRing,
    onDeleteVertex,
    onToggleFeatureMove,
    onStartKnife,
    onConfirmKnife,
    onCancelKnife,
    mergeTargetCount = 0,
    onAddMergeTarget,
    onStartMerge,
    onClearMerge,
  }: {
    featureType?: string | null;
    isRingDrawing?: boolean;
    isKnifeDrawing?: boolean;
    canConfirm?: boolean;
    canConfirmKnife?: boolean;
    isFeatureMoveMode?: boolean;
    onAddHole?: () => void;
    onAddExclave?: () => void;
    onConfirmRing?: () => void;
    onCancelRing?: () => void;
    onDeleteVertex?: () => void;
    onToggleFeatureMove?: () => void;
    onStartKnife?: () => void;
    onConfirmKnife?: () => void;
    onCancelKnife?: () => void;
    mergeTargetCount?: number;
    onAddMergeTarget?: () => void;
    onStartMerge?: () => void;
    onClearMerge?: () => void;
  } = $props();
</script>

<div class="edit-toolbar">
  {#if isKnifeDrawing}
    <button
      class="edit-btn confirm"
      disabled={!canConfirmKnife}
      onclick={() => onConfirmKnife?.()}
    >
      分割確定
    </button>
    <button
      class="edit-btn cancel"
      onclick={() => onCancelKnife?.()}
    >
      キャンセル
    </button>
  {:else if isRingDrawing}
    <button
      class="edit-btn confirm"
      disabled={!canConfirm}
      onclick={() => onConfirmRing?.()}
    >
      確定
    </button>
    <button
      class="edit-btn cancel"
      onclick={() => onCancelRing?.()}
    >
      キャンセル
    </button>
  {:else}
    <button
      class:active={isFeatureMoveMode}
      class="edit-btn"
      onclick={() => onToggleFeatureMove?.()}
      title="地物移動ツール"
    >
      地物移動
    </button>
    <button
      class="edit-btn"
      onclick={() => onDeleteVertex?.()}
      title="選択頂点を削除 (Delete)"
    >
      頂点削除
    </button>
    {#if featureType === 'Polygon'}
      <button
        class="edit-btn"
        onclick={() => onAddHole?.()}
        title="穴リングを追加"
      >
        穴追加
      </button>
      <button
        class="edit-btn"
        onclick={() => onAddExclave?.()}
        title="飛び地リングを追加"
      >
        飛び地追加
      </button>
      <button
        class="edit-btn knife"
        onclick={() => onStartKnife?.()}
        title="ナイフツールで分割"
      >
        分割
      </button>
      <span class="separator"></span>
      <button
        class="edit-btn"
        onclick={() => onAddMergeTarget?.()}
        title="結合対象に追加/解除"
      >
        結合対象{#if mergeTargetCount > 0}({mergeTargetCount}){/if}
      </button>
      {#if mergeTargetCount >= 2}
        <button
          class="edit-btn confirm"
          onclick={() => onStartMerge?.()}
          title="選択した地物を結合"
        >
          結合実行
        </button>
      {/if}
      {#if mergeTargetCount > 0}
        <button
          class="edit-btn cancel"
          onclick={() => onClearMerge?.()}
          title="結合対象をクリア"
        >
          解除
        </button>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .edit-toolbar {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: 6px;
    border: 1px solid #555;
    z-index: 10;
  }

  .edit-btn {
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid #555;
    font-size: 11px;
    cursor: pointer;
    background: #3c3c3c;
    color: #ccc;
  }

  .edit-btn:hover {
    background: #4c4c4c;
  }

  .edit-btn.active {
    background: #094771;
    color: #fff;
    border-color: #007acc;
  }

  .edit-btn.confirm {
    background: #094771;
    color: #fff;
    border-color: #007acc;
  }

  .edit-btn.confirm:disabled {
    background: #333;
    color: #666;
    border-color: #444;
    cursor: not-allowed;
  }

  .edit-btn.confirm:not(:disabled):hover {
    background: #0b5a8e;
  }

  .edit-btn.cancel {
    background: #3c3c3c;
    color: #ccc;
  }

  .separator {
    width: 1px;
    background: #555;
    align-self: stretch;
  }
</style>
