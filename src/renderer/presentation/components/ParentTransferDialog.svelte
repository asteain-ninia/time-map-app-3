<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import {
    buildParentCandidateItems,
    canTransferChildren,
    canTransferSelectedFeature,
    getActivePolygonAnchor,
    getFeatureDisplayName,
    getTransferFeatureIds,
    type ParentTransferConfirmDetail,
    type ParentTransferScope,
  } from './parentTransferDialogUtils';

  let {
    isOpen = false,
    feature = null as Feature | null,
    features = [] as readonly Feature[],
    currentTime = undefined as TimePoint | undefined,
    onConfirm,
    onCancel,
  }: {
    isOpen?: boolean;
    feature?: Feature | null;
    features?: readonly Feature[];
    currentTime?: TimePoint;
    onConfirm?: (detail: ParentTransferConfirmDetail) => void;
    onCancel?: () => void;
  } = $props();

  let scope = $state<ParentTransferScope>('selected');
  let selectedParentValue = $state('__root__');

  let activeAnchor = $derived(getActivePolygonAnchor(feature, currentTime));
  let selectedEnabled = $derived(canTransferSelectedFeature(feature, currentTime));
  let childrenEnabled = $derived(canTransferChildren(feature, currentTime, features));
  let featureIds = $derived(getTransferFeatureIds(feature, currentTime, scope));
  let excludedIds = $derived(scope === 'children' && feature ? [feature.id] : []);
  let parentCandidates = $derived(buildParentCandidateItems({
    features,
    time: currentTime,
    movingFeatureIds: featureIds,
    excludedFeatureIds: excludedIds,
  }));
  let currentParentId = $derived(
    scope === 'selected' ? activeAnchor?.placement.parentId ?? null : feature?.id ?? null
  );
  let newParentId = $derived(
    selectedParentValue === '__root__' ? null : selectedParentValue
  );
  let parentSelectionEnabled = $derived(
    newParentId === null ||
    parentCandidates.some((candidate) => candidate.id === newParentId)
  );
  let targetNames = $derived(
    featureIds.map((featureId) => {
      const target = features.find((candidate) => candidate.id === featureId);
      return target ? getFeatureDisplayName(target, currentTime) : featureId;
    })
  );
  let confirmDisabled = $derived(
    featureIds.length === 0 ||
    (scope === 'selected' && !selectedEnabled) ||
    (scope === 'children' && !childrenEnabled) ||
    !parentSelectionEnabled ||
    newParentId === currentParentId
  );

  $effect(() => {
    if (!isOpen) return;
    scope = selectedEnabled || !childrenEnabled ? 'selected' : 'children';
    selectedParentValue = '__root__';
  });

  $effect(() => {
    if (scope === 'selected' && !selectedEnabled && childrenEnabled) {
      scope = 'children';
    }
    if (scope === 'children' && !childrenEnabled && selectedEnabled) {
      scope = 'selected';
    }
  });

  $effect(() => {
    if (selectedParentValue === '__root__') return;
    if (parentCandidates.some((candidate) => candidate.id === selectedParentValue)) return;
    selectedParentValue = '__root__';
  });

  function confirm(): void {
    if (confirmDisabled) return;
    onConfirm?.({
      scope,
      featureIds,
      newParentId,
    });
  }
</script>

{#if isOpen}
  <div class="modal-overlay">
    <button
      type="button"
      class="modal-backdrop"
      aria-label="所属変更を閉じる"
      onclick={() => onCancel?.()}
    ></button>
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="所属変更">
      <h3 class="modal-title">所属変更</h3>

      <div class="summary">
        <span class="summary-label">対象</span>
        <span class="summary-value">{feature ? getFeatureDisplayName(feature, currentTime) : ''}</span>
      </div>

      <div class="form-group">
        <span class="group-label">変更範囲</span>
        <label class:disabled={!selectedEnabled}>
          <input
            type="radio"
            name="parent-transfer-scope"
            value="selected"
            bind:group={scope}
            disabled={!selectedEnabled}
          />
          選択地物のみ
        </label>
        <label class:disabled={!childrenEnabled}>
          <input
            type="radio"
            name="parent-transfer-scope"
            value="children"
            bind:group={scope}
            disabled={!childrenEnabled}
          />
          下位領域すべて
        </label>
      </div>

      <div class="target-list">
        {#each targetNames as name, i}
          <div class="target-item">
            <span class="target-badge">{i + 1}</span>
            <span>{name}</span>
          </div>
        {/each}
      </div>

      <div class="form-group">
        <label class="group-label" for="parent-transfer-parent">新しい親</label>
        <select
          id="parent-transfer-parent"
          class="parent-select"
          bind:value={selectedParentValue}
        >
          <option value="__root__">親なし（最上位）</option>
          {#each parentCandidates as candidate}
            <option value={candidate.id}>{candidate.name} ({candidate.id})</option>
          {/each}
        </select>
      </div>

      {#if confirmDisabled}
        <div class="modal-hint">
          {#if featureIds.length === 0}
            所属変更できる対象がありません。
          {:else if !parentSelectionEnabled}
            選択した親地物は対象地物の存在期間を覆っていません。
          {:else if newParentId === currentParentId}
            現在と同じ所属先です。
          {:else}
            選択した範囲は所属変更できません。
          {/if}
        </div>
      {/if}

      <div class="modal-actions">
        <button
          class="btn confirm"
          disabled={confirmDisabled}
          onclick={confirm}
        >
          変更
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
    width: min(420px, calc(100vw - 32px));
    max-height: min(560px, calc(100vh - 40px));
    overflow-y: auto;
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
  }

  .modal-title {
    margin: 0 0 12px;
    font-size: 14px;
    color: #e0e0e0;
  }

  .summary {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 14px;
    font-size: 12px;
  }

  .summary-label,
  .group-label {
    color: #aaa;
    font-size: 11px;
  }

  .summary-value {
    color: #e0e0e0;
    overflow-wrap: anywhere;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-bottom: 14px;
    font-size: 12px;
    color: #d0d0d0;
  }

  .form-group label {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .form-group label.disabled {
    color: #777;
  }

  .target-list {
    margin-bottom: 14px;
    max-height: 120px;
    overflow-y: auto;
  }

  .target-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
    color: #ccc;
  }

  .target-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #094771;
    color: #fff;
    font-size: 10px;
    flex-shrink: 0;
  }

  .parent-select {
    width: 100%;
    padding: 6px 8px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 13px;
  }

  .parent-select:focus {
    outline: none;
    border-color: #007acc;
  }

  .modal-hint {
    margin-bottom: 14px;
    color: #c8a86a;
    font-size: 11px;
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

  .btn.confirm:hover:not(:disabled) {
    background: #0b5a8e;
  }

  .btn.confirm:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .btn.cancel {
    background: #3c3c3c;
    color: #ccc;
  }

  .btn.cancel:hover {
    background: #4c4c4c;
  }
</style>
