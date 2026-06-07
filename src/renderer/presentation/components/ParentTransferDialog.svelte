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
    resolveParentTransferTarget,
    type NewParentPlacementMode,
    type ParentTransferConfirmDetail,
    type ParentTransferMode,
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
  let parentMode = $state<ParentTransferMode>('existing');
  let selectedExistingParentId = $state('');
  let newParentName = $state('');
  let newParentKind = $state('');
  // 新規上位領域作成サブフローにおける、新規コンテナ自身の所属（連邦化 = root / 自治化 = existing）。
  let newParentPlacementMode = $state<NewParentPlacementMode>('root');
  let selectedNewParentParentId = $state('');

  let activeAnchor = $derived(getActivePolygonAnchor(feature, currentTime));
  let selectedEnabled = $derived(canTransferSelectedFeature(feature, currentTime));
  let childrenEnabled = $derived(canTransferChildren(feature, currentTime, features));
  let featureIds = $derived(getTransferFeatureIds(feature, currentTime, scope));
  // 既存の面情報への「再割当」候補（割譲・帰属・直轄化）。scope='children'（下位領域すべて）
  // のときは現在の親（feature.id）を除外する: 子を現在の親へ再割当するのは no-op のため。
  let excludedIds = $derived(scope === 'children' && feature ? [feature.id] : []);
  let parentCandidates = $derived(buildParentCandidateItems({
    features,
    time: currentTime,
    movingFeatureIds: featureIds,
    excludedFeatureIds: excludedIds,
  }));
  // 自治化（新規中間コンテナの所属先）候補。再割当候補と除外規則が異なる:
  // scope='children' でも現在の親（feature.id）を除外しない。自治化は「既存子と既存親の間に
  // 新規中間コンテナを挿入する」操作（要件定義書 §2.1 line 305）であり、現在の親 P こそが
  // 新規コンテナ Y の所属先候補だから（P → Y → 子）。循環防止の移動対象自身 + 全子孫の除外のみ
  // が共通制約（`buildParentCandidateItems` の movingFeatureIds 経由）。
  let newParentParentCandidates = $derived(buildParentCandidateItems({
    features,
    time: currentTime,
    movingFeatureIds: featureIds,
    excludedFeatureIds: [],
  }));
  let currentParentId = $derived(
    scope === 'selected' ? activeAnchor?.placement.parentId ?? null : feature?.id ?? null
  );
  // 3 択（既存 / 親なし / 新規作成）→ 確定意図（reassign / createNewParent）。
  // 解決できないとき（既存モードで未選択、新規作成モードで名称未入力、
  // または自治化モードで所属先未選択）は null。既存再割当は parentCandidates、
  // 自治化の所属先は newParentParentCandidates で別々に検証する（除外規則が異なるため）。
  let transferTarget = $derived(resolveParentTransferTarget({
    mode: parentMode,
    selectedExistingParentId,
    parentCandidates,
    newParentName,
    newParentKind,
    newParentPlacementMode,
    selectedNewParentParentId,
    newParentParentCandidates,
  }));
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
    transferTarget === null ||
    (transferTarget.type === 'reassign' && transferTarget.newParentId === currentParentId)
  );

  $effect(() => {
    if (!isOpen) return;
    scope = selectedEnabled || !childrenEnabled ? 'selected' : 'children';
    parentMode = 'existing';
    selectedExistingParentId = '';
    newParentName = '';
    newParentKind = '';
    newParentPlacementMode = 'root';
    selectedNewParentParentId = '';
  });

  $effect(() => {
    if (scope === 'selected' && !selectedEnabled && childrenEnabled) {
      scope = 'children';
    }
    if (scope === 'children' && !childrenEnabled && selectedEnabled) {
      scope = 'selected';
    }
  });

  // 既存候補が無いときは「既存の面情報から選ぶ」を選べないため「親なし」へ退避する。
  $effect(() => {
    if (parentMode === 'existing' && parentCandidates.length === 0) {
      parentMode = 'root';
    }
  });

  // 既存選択が候補から外れたら未選択へ戻す（scope 切替で候補が変わるケース）。
  $effect(() => {
    if (selectedExistingParentId === '') return;
    if (parentCandidates.some((candidate) => candidate.id === selectedExistingParentId)) return;
    selectedExistingParentId = '';
  });

  // 自治化の所属先候補が無いときは「既存の上位領域に所属させる」を選べないため
  // 新規コンテナの所属を「新規最上位として作成」へ退避する。
  $effect(() => {
    if (newParentPlacementMode === 'existing' && newParentParentCandidates.length === 0) {
      newParentPlacementMode = 'root';
    }
  });

  // 自治化の所属先選択が候補から外れたら未選択へ戻す（scope 切替で候補が変わるケース）。
  $effect(() => {
    if (selectedNewParentParentId === '') return;
    if (newParentParentCandidates.some((candidate) => candidate.id === selectedNewParentParentId)) return;
    selectedNewParentParentId = '';
  });

  function confirm(): void {
    if (confirmDisabled || transferTarget === null) return;
    if (transferTarget.type === 'createNewParent') {
      onConfirm?.({
        scope,
        featureIds,
        newParentId: null,
        createNewParent: transferTarget.spec,
      });
      return;
    }
    onConfirm?.({
      scope,
      featureIds,
      newParentId: transferTarget.newParentId,
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
        <span class="group-label">新しい親</span>
        <label class:disabled={parentCandidates.length === 0}>
          <input
            type="radio"
            name="parent-transfer-mode"
            value="existing"
            bind:group={parentMode}
            disabled={parentCandidates.length === 0}
          />
          既存の面情報から選ぶ
        </label>
        {#if parentMode === 'existing'}
          <select
            id="parent-transfer-parent"
            class="parent-select"
            aria-label="既存の親地物を選択"
            bind:value={selectedExistingParentId}
          >
            <option value="">選択してください</option>
            {#each parentCandidates as candidate (candidate.id)}
              <option value={candidate.id}>{candidate.name} ({candidate.id})</option>
            {/each}
          </select>
        {/if}
        <label>
          <input
            type="radio"
            name="parent-transfer-mode"
            value="root"
            bind:group={parentMode}
          />
          親なし（最上位領域へ）
        </label>
        <label>
          <input
            type="radio"
            name="parent-transfer-mode"
            value="new"
            bind:group={parentMode}
          />
          新規上位領域を作成する
        </label>
        {#if parentMode === 'new'}
          <div class="new-parent-fields">
            <label class="field-label" for="new-parent-name">名称</label>
            <input
              id="new-parent-name"
              class="text-input"
              type="text"
              placeholder="新しい上位領域の名称"
              bind:value={newParentName}
            />
            <label class="field-label" for="new-parent-kind">種別（任意）</label>
            <input
              id="new-parent-kind"
              class="text-input"
              type="text"
              placeholder="連邦 / 帝国 など"
              bind:value={newParentKind}
            />
            <span class="field-label">この上位領域の所属</span>
            <label>
              <input
                type="radio"
                name="new-parent-placement-mode"
                value="root"
                bind:group={newParentPlacementMode}
              />
              新規最上位領域として作成（最上位フラグ）
            </label>
            <label class:disabled={newParentParentCandidates.length === 0}>
              <input
                type="radio"
                name="new-parent-placement-mode"
                value="existing"
                bind:group={newParentPlacementMode}
                disabled={newParentParentCandidates.length === 0}
              />
              既存の上位領域に所属させる（自治化）
            </label>
            {#if newParentPlacementMode === 'existing'}
              <select
                id="new-parent-parent"
                class="parent-select"
                aria-label="新規上位領域の所属先を選択"
                bind:value={selectedNewParentParentId}
              >
                <option value="">選択してください</option>
                {#each newParentParentCandidates as candidate (candidate.id)}
                  <option value={candidate.id}>{candidate.name} ({candidate.id})</option>
                {/each}
              </select>
            {/if}
          </div>
        {/if}
      </div>

      {#if confirmDisabled}
        <div class="modal-hint">
          <!-- 無効理由は実際の disable 要因の優先順で評価する（§6.2.5: メッセージと条件分岐を一対一に）。
               範囲（scope）無効を新しい親モードのヒントより先に出し、真の理由をマスクしない。 -->
          {#if featureIds.length === 0}
            所属変更できる対象がありません。
          {:else if scope === 'selected' && !selectedEnabled}
            選択地物は下位領域を持つため、選択地物のみの所属変更はできません。
          {:else if scope === 'children' && !childrenEnabled}
            下位領域に末端でない地物が含まれるため、一括での所属変更はできません。
          {:else if parentMode === 'new' && newParentName.trim() === ''}
            新規上位領域の名称を入力してください。
          {:else if parentMode === 'new' && newParentPlacementMode === 'existing' && transferTarget === null}
            新規上位領域の所属先を選択してください。
          {:else if parentMode === 'existing' && transferTarget === null}
            所属させる既存の面情報を選択してください。
          {:else if transferTarget && transferTarget.type === 'reassign' && transferTarget.newParentId === currentParentId}
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

  .new-parent-fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    color: #aaa;
    font-size: 11px;
  }

  .text-input {
    width: 100%;
    padding: 6px 8px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 13px;
    box-sizing: border-box;
  }

  .text-input:focus {
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
