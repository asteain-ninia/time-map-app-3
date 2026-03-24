<script lang="ts">
  import type { SpatialConflict } from '@domain/services/ConflictDetectionService';
  import type { ConflictResolution } from '@application/AnchorEditDraft';

  let {
    isOpen = false,
    conflicts = [] as readonly SpatialConflict[],
    currentIndex = 0,
    resolutions = [] as readonly ConflictResolution[],
    allResolved = false,
    errorMessage = '',
    featureNameMap = new Map<string, string>() as ReadonlyMap<string, string>,
    onSelectPreferred,
    onNext,
    onPrev,
    onJumpTo,
    onCommit,
    onCancel,
  }: {
    isOpen?: boolean;
    conflicts?: readonly SpatialConflict[];
    currentIndex?: number;
    resolutions?: readonly ConflictResolution[];
    allResolved?: boolean;
    errorMessage?: string;
    featureNameMap?: ReadonlyMap<string, string>;
    onSelectPreferred?: (featureId: string) => void;
    onNext?: () => void;
    onPrev?: () => void;
    onJumpTo?: (index: number) => void;
    onCommit?: () => void;
    onCancel?: () => void;
  } = $props();

  /** 現在の競合 */
  let currentConflict = $derived(
    currentIndex < conflicts.length ? conflicts[currentIndex] : null
  );

  /** 現在の競合の解決状態 */
  let currentResolution = $derived(
    resolutions.find(r => r.conflictIndex === currentIndex) ?? null
  );

  /** 地物名の取得 */
  function getName(featureId: string): string {
    return featureNameMap.get(featureId) ?? featureId;
  }

  /** 解決済みかどうか */
  function isResolved(index: number): boolean {
    return resolutions.some(r => r.conflictIndex === index);
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="modal-overlay">
    <div class="dialog">
      <h3 class="dialog-title">競合解決</h3>

      <div class="dialog-body">
        <!-- 競合リスト -->
        <div class="conflict-list">
          <div class="list-header">競合一覧 ({conflicts.length}件)</div>
          {#each conflicts as conflict, i}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div
              class="conflict-item"
              class:active={i === currentIndex}
              class:resolved={isResolved(i)}
              onclick={() => onJumpTo?.(i)}
            >
              <span class="conflict-index">{i + 1}</span>
              <span class="conflict-desc">
                {getName(conflict.featureIdA)} / {getName(conflict.featureIdB)}
              </span>
              {#if isResolved(i)}
                <span class="resolved-badge">済</span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- 詳細パネル -->
        <div class="detail-panel">
          {#if currentConflict}
            <div class="detail-header">
              競合 {currentIndex + 1} / {conflicts.length}
            </div>

            <div class="conflict-info">
              <p>レイヤー: {currentConflict.layerId}</p>
              <p>時間: {currentConflict.atTime.year}年</p>
            </div>

            <div class="choice-section">
              <p class="choice-label">優先する地物を選択:</p>

              <button
                class="choice-btn"
                class:selected={currentResolution?.preferFeatureId === currentConflict.featureIdA}
                onclick={() => onSelectPreferred?.(currentConflict!.featureIdA)}
              >
                <span class="choice-indicator">A</span>
                <span>{getName(currentConflict.featureIdA)}</span>
              </button>

              <button
                class="choice-btn"
                class:selected={currentResolution?.preferFeatureId === currentConflict.featureIdB}
                onclick={() => onSelectPreferred?.(currentConflict!.featureIdB)}
              >
                <span class="choice-indicator">B</span>
                <span>{getName(currentConflict.featureIdB)}</span>
              </button>
            </div>

            {#if currentResolution}
              <p class="resolution-note">
                → 「{getName(currentResolution.preferFeatureId)}」の形状を優先し、他方をブーリアン差分で調整します。
              </p>
            {/if}

            <!-- ナビゲーション -->
            <div class="nav-buttons">
              <button
                class="nav-btn"
                disabled={currentIndex <= 0}
                onclick={() => onPrev?.()}
              >
                前へ
              </button>
              <button
                class="nav-btn"
                disabled={currentIndex >= conflicts.length - 1}
                onclick={() => onNext?.()}
              >
                次へ
              </button>
            </div>
          {/if}

          {#if errorMessage}
            <div class="error-msg">{errorMessage}</div>
          {/if}
        </div>
      </div>

      <!-- アクション -->
      <div class="dialog-actions">
        <button
          class="btn confirm"
          disabled={!allResolved}
          onclick={() => onCommit?.()}
        >
          解決を適用して確定
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

  .dialog {
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
    min-width: 520px;
    max-width: 640px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .dialog-title {
    margin: 0 0 12px;
    font-size: 14px;
    color: #e0e0e0;
  }

  .dialog-body {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  .conflict-list {
    width: 180px;
    min-width: 180px;
    overflow-y: auto;
    border: 1px solid #444;
    border-radius: 4px;
    background: #1e1e1e;
  }

  .list-header {
    padding: 6px 8px;
    font-size: 11px;
    color: #aaa;
    border-bottom: 1px solid #444;
  }

  .conflict-item {
    padding: 6px 8px;
    font-size: 11px;
    color: #ccc;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .conflict-item:hover {
    background: #333;
  }

  .conflict-item.active {
    background: #094771;
    color: #fff;
  }

  .conflict-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #444;
    font-size: 10px;
    flex-shrink: 0;
  }

  .conflict-item.active .conflict-index {
    background: #007acc;
  }

  .conflict-desc {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resolved-badge {
    font-size: 9px;
    color: #4ec9b0;
    flex-shrink: 0;
  }

  .detail-panel {
    flex: 1;
    min-width: 0;
  }

  .detail-header {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 8px;
  }

  .conflict-info {
    font-size: 11px;
    color: #999;
    margin-bottom: 12px;
  }

  .conflict-info p {
    margin: 2px 0;
  }

  .choice-section {
    margin-bottom: 12px;
  }

  .choice-label {
    font-size: 11px;
    color: #aaa;
    margin: 0 0 6px;
  }

  .choice-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 4px;
    border: 1px solid #555;
    border-radius: 4px;
    background: #1e1e1e;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .choice-btn:hover {
    background: #333;
  }

  .choice-btn.selected {
    border-color: #007acc;
    background: #094771;
    color: #fff;
  }

  .choice-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #444;
    font-size: 11px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .choice-btn.selected .choice-indicator {
    background: #007acc;
  }

  .resolution-note {
    font-size: 10px;
    color: #4ec9b0;
    margin: 0 0 12px;
  }

  .nav-buttons {
    display: flex;
    gap: 6px;
  }

  .nav-btn {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #555;
    background: #3c3c3c;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
  }

  .nav-btn:hover:not(:disabled) {
    background: #4c4c4c;
  }

  .nav-btn:disabled {
    color: #666;
    cursor: not-allowed;
  }

  .error-msg {
    margin-top: 8px;
    padding: 6px 8px;
    background: rgba(255, 50, 50, 0.2);
    border: 1px solid #a33;
    border-radius: 4px;
    font-size: 11px;
    color: #f88;
  }

  .dialog-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #444;
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

  .btn.confirm:hover:not(:disabled) {
    background: #0b5a8e;
  }

  .btn.confirm:disabled {
    background: #333;
    color: #666;
    border-color: #444;
    cursor: not-allowed;
  }

  .btn.cancel {
    background: #3c3c3c;
    color: #ccc;
  }

  .btn.cancel:hover {
    background: #4c4c4c;
  }
</style>
