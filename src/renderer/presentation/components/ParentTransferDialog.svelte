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
    resolveDirectlyGovernedDefault,
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
  // 新規上位領域作成サブフローの各階層（innermost → outermost、length ≥ 1。要件定義書 §2.1 line 293
  // の再帰積み上げ）。index 0 = 対象地物の直接の新親、末尾 = チェーン最外コンテナ。
  let newParentLevels = $state<{ name: string; kind: string }[]>([{ name: '', kind: '' }]);
  // 新規上位領域作成サブフローにおける、チェーン最外コンテナ自身の所属（連邦化 = root / 自治化 = existing）。
  let newParentPlacementMode = $state<NewParentPlacementMode>('root');
  let selectedNewParentParentId = $state('');
  // 末端→集約遷移で自動生成される直轄領の名称・種別の上書き入力（要件定義書 §2.1 line 228）。
  // 遷移する既存末端地物が確定したとき（`directlyGovernedDefault` 非 null）にデフォルトをプレフィルする。
  let directlyGovernedName = $state('');
  let directlyGovernedKind = $state('');
  // プレフィル済みの遷移地物 ID。遷移地物が切り替わった瞬間だけ入力欄をデフォルトへ同期し、
  // 同一地物のままの間はユーザー編集を保持する（再代入のたびに上書きしない）。
  let directlyGovernedSyncedId = $state<string | null>(null);

  let activeAnchor = $derived(getActivePolygonAnchor(feature, currentTime));
  let selectedEnabled = $derived(canTransferSelectedFeature(feature, currentTime));
  let childrenEnabled = $derived(canTransferChildren(feature, currentTime));
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
    newParentName: newParentLevels[0]?.name ?? '',
    newParentKind: newParentLevels[0]?.kind ?? '',
    newParentAncestors: newParentLevels.slice(1),
    newParentPlacementMode,
    selectedNewParentParentId,
    newParentParentCandidates,
  }));
  // 新規作成モードでいずれかの階層名称が空（前後空白のみ含む）か。確定無効ヒントの判定に使う。
  let hasEmptyNewParentLevelName = $derived(
    newParentLevels.some((level) => level.name.trim() === '')
  );
  // 末端→集約遷移で直轄領が生成される「遷移する既存末端地物」とデフォルト名称/種別。
  // 遷移しない選択（独立・連邦化・既存集約地物への帰属）では null（上書き UI 非表示）。
  let directlyGovernedDefault = $derived(resolveDirectlyGovernedDefault({
    features,
    time: currentTime,
    transferTarget,
  }));
  let targetNames = $derived(
    featureIds.map((featureId) => {
      const target = features.find((candidate) => candidate.id === featureId);
      return target ? getFeatureDisplayName(target, currentTime) : featureId;
    })
  );
  // scope='children' で childrenEnabled=false（下位領域なし）は featureIds.length===0 と等価
  // （getTransferFeatureIds('children') = childIds、canTransferChildren = childIds 非空）のため、
  // 確定無効条件としては featureIds.length===0 に集約する（重複判定を持たない）。
  let confirmDisabled = $derived(
    featureIds.length === 0 ||
    (scope === 'selected' && !selectedEnabled) ||
    transferTarget === null ||
    (transferTarget.type === 'reassign' && transferTarget.newParentId === currentParentId)
  );

  $effect(() => {
    if (!isOpen) return;
    scope = selectedEnabled || !childrenEnabled ? 'selected' : 'children';
    parentMode = 'existing';
    selectedExistingParentId = '';
    newParentLevels = [{ name: '', kind: '' }];
    newParentPlacementMode = 'root';
    selectedNewParentParentId = '';
    directlyGovernedName = '';
    directlyGovernedKind = '';
    directlyGovernedSyncedId = null;
  });

  // 遷移する既存末端地物が切り替わった瞬間だけ、直轄領の名称・種別をデフォルトへ同期する。
  // 同一地物のままユーザーが編集している間は再代入しない（編集を保持）。遷移なし（null）になったら空へ戻す。
  // `directlyGovernedDefault` は transferTarget 由来で directlyGovernedName/Kind には依存しないため
  // 無限ループにならない（書き込む directlyGovernedSyncedId は guard 済み）。
  $effect(() => {
    const def = directlyGovernedDefault;
    const id = def?.featureId ?? null;
    if (id === directlyGovernedSyncedId) return;
    directlyGovernedSyncedId = id;
    directlyGovernedName = def?.defaultName ?? '';
    directlyGovernedKind = def?.defaultKind ?? '';
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

  // 再帰積み上げ（要件定義書 §2.1 line 293）: 最外のさらに上位へ新規コンテナを 1 段追加する。
  function addNewParentLevel(): void {
    newParentLevels = [...newParentLevels, { name: '', kind: '' }];
  }

  // 最外の階層を 1 段取り消す（最低 1 段は残す）。
  function removeNewParentLevel(): void {
    if (newParentLevels.length <= 1) return;
    newParentLevels = newParentLevels.slice(0, -1);
  }

  function confirm(): void {
    if (confirmDisabled || transferTarget === null) return;
    // 末端→集約遷移が予測される場合のみ直轄領の上書きを同梱する（要件定義書 §2.1 line 228）。
    // 値の前後空白除去・空判定（空名→デフォルト名称 / 空種別→種別なし）は UseCase 側で行う。
    const directlyGovernedOverride = directlyGovernedDefault
      ? { name: directlyGovernedName, kind: directlyGovernedKind }
      : undefined;
    if (transferTarget.type === 'createNewParent') {
      onConfirm?.({
        scope,
        featureIds,
        newParentId: null,
        createNewParent: transferTarget.spec,
        ...(directlyGovernedOverride ? { directlyGovernedOverride } : {}),
      });
      return;
    }
    onConfirm?.({
      scope,
      featureIds,
      newParentId: transferTarget.newParentId,
      ...(directlyGovernedOverride ? { directlyGovernedOverride } : {}),
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
            <!-- index キーで安全なのは追加・削除を末尾（最外）のみに限定しているため
                 （addNewParentLevel / removeNewParentLevel）。要素 identity が崩れない。
                 将来「中間階層の挿入・削除」を入れる場合は index キーが破綻するので、
                 各 level へ安定 ID を持たせてキーを ID へ切り替えること。 -->
            {#each newParentLevels as _level, i (i)}
              <div class="new-parent-level">
                <div class="level-header">
                  <span class="field-label">
                    {#if newParentLevels.length === 1}
                      新しい上位領域
                    {:else if i === 0}
                      階層 {i + 1}（対象地物の直接の上位領域）
                    {:else if i === newParentLevels.length - 1}
                      階層 {i + 1}（最も外側）
                    {:else}
                      階層 {i + 1}
                    {/if}
                  </span>
                  {#if i === newParentLevels.length - 1 && newParentLevels.length > 1}
                    <button
                      type="button"
                      class="level-remove"
                      onclick={removeNewParentLevel}
                    >
                      この階層を削除
                    </button>
                  {/if}
                </div>
                <label class="field-label" for={`new-parent-name-${i}`}>名称</label>
                <input
                  id={`new-parent-name-${i}`}
                  class="text-input"
                  type="text"
                  placeholder="新しい上位領域の名称"
                  bind:value={newParentLevels[i].name}
                />
                <label class="field-label" for={`new-parent-kind-${i}`}>種別（任意）</label>
                <input
                  id={`new-parent-kind-${i}`}
                  class="text-input"
                  type="text"
                  placeholder="連邦 / 帝国 など"
                  bind:value={newParentLevels[i].kind}
                />
              </div>
            {/each}

            <button
              type="button"
              class="level-add"
              onclick={addNewParentLevel}
            >
              ＋ さらに上位領域を追加
            </button>

            <span class="field-label">
              {newParentLevels.length > 1 ? '最も外側の上位領域の所属' : 'この上位領域の所属'}
            </span>
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

      {#if directlyGovernedDefault}
        <div class="form-group">
          <span class="group-label">直轄領（自動生成）</span>
          <p class="dg-note">
            「{directlyGovernedDefault.parentName}」が下位領域を獲得して集約地物になります。下位領域に覆われない領域があれば直轄領（末端地物）として自動生成されます。既定値が入力済みです。名称を空欄にすると既定名称、種別を空欄にすると種別なしになります。
          </p>
          <label class="field-label" for="directly-governed-name">直轄領の名称</label>
          <input
            id="directly-governed-name"
            class="text-input"
            type="text"
            placeholder={directlyGovernedDefault.defaultName}
            bind:value={directlyGovernedName}
          />
          <label class="field-label" for="directly-governed-kind">直轄領の種別（任意）</label>
          <input
            id="directly-governed-kind"
            class="text-input"
            type="text"
            placeholder="国 / 県 など"
            bind:value={directlyGovernedKind}
          />
        </div>
      {/if}

      {#if confirmDisabled}
        <div class="modal-hint">
          <!-- 無効理由は実際の disable 要因の優先順で評価する（§6.2.5: メッセージと条件分岐を一対一に）。
               範囲（scope）無効を新しい親モードのヒントより先に出し、真の理由をマスクしない。 -->
          {#if featureIds.length === 0}
            所属変更できる対象がありません。
          {:else if scope === 'selected' && !selectedEnabled}
            選択地物は下位領域を持つため、選択地物のみの所属変更はできません。
          {:else if parentMode === 'new' && hasEmptyNewParentLevelName}
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

  .new-parent-level {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    margin-bottom: 4px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #262626;
  }

  .level-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .level-remove {
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #614;
    background: #3a2230;
    color: #e0a0b8;
    font-size: 10px;
    cursor: pointer;
  }

  .level-remove:hover {
    background: #4a2a3c;
  }

  .level-add {
    align-self: flex-start;
    padding: 4px 10px;
    margin: 2px 0 6px;
    border-radius: 4px;
    border: 1px dashed #557;
    background: #262b33;
    color: #9ab;
    font-size: 11px;
    cursor: pointer;
  }

  .level-add:hover {
    background: #2e353f;
    border-color: #7799cc;
  }

  .field-label {
    color: #aaa;
    font-size: 11px;
  }

  .dg-note {
    margin: 0 0 4px;
    color: #9ab;
    font-size: 11px;
    line-height: 1.5;
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
