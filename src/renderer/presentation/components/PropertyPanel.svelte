<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { AnchorProperty } from '@domain/value-objects/FeatureAnchor';

  let {
    feature = null as Feature | null,
    currentTime = undefined as TimePoint | undefined,
    onPropertyChange,
  }: {
    feature?: Feature | null;
    currentTime?: TimePoint;
    onPropertyChange?: (featureId: string, anchorId: string, property: AnchorProperty) => void;
  } = $props();

  /** アクティブなアンカー */
  let anchor = $derived(
    feature && currentTime ? feature.getActiveAnchor(currentTime) : null
  );

  /** 編集中の名前 */
  let editName = $state('');
  /** 編集中の説明 */
  let editDescription = $state('');
  /** 編集中のスタイル */
  let editFillColor = $state('#4a90d9');
  let editSelectedFillColor = $state('#00ccff');
  let editAutoColor = $state(false);

  /** アンカー変更時にフォームを同期 */
  $effect(() => {
    if (anchor) {
      editName = anchor.property.name;
      editDescription = anchor.property.description;
      editFillColor = anchor.property.style?.fillColor ?? '#4a90d9';
      editSelectedFillColor = anchor.property.style?.selectedFillColor ?? '#00ccff';
      editAutoColor = anchor.property.style?.autoColor ?? false;
    }
  });

  /** プロパティの変更を適用 */
  function applyChanges(): void {
    if (!feature || !anchor) return;
    const style = anchor.shape.type === 'Polygon'
      ? {
          fillColor: editFillColor,
          selectedFillColor: editSelectedFillColor,
          autoColor: editAutoColor,
          palette: anchor.property.style?.palette ?? 'default',
        }
      : anchor.property.style;
    const newProperty: AnchorProperty = {
      ...anchor.property,
      name: editName,
      description: editDescription,
      style,
    };
    onPropertyChange?.(feature.id, anchor.id, newProperty);
  }
</script>

{#if !feature || !anchor}
  <div class="empty-message">地物が選択されていません</div>
{:else}
  <div class="property-panel">
    <div class="section-header">基本情報</div>

    <div class="field">
      <label class="field-label" for="prop-id">ID</label>
      <input class="field-input" id="prop-id" type="text" value={feature.id} readonly />
    </div>

    <div class="field">
      <label class="field-label" for="prop-type">種別</label>
      <input class="field-input" id="prop-type" type="text" value={anchor.shape.type} readonly />
    </div>

    <div class="field">
      <label class="field-label" for="prop-name">名前</label>
      <input
        class="field-input"
        id="prop-name"
        type="text"
        bind:value={editName}
        onblur={applyChanges}
        onkeydown={(e) => { if (e.key === 'Enter') applyChanges(); }}
      />
    </div>

    <div class="field">
      <label class="field-label" for="prop-desc">説明</label>
      <textarea
        class="field-textarea"
        id="prop-desc"
        rows="3"
        bind:value={editDescription}
        onblur={applyChanges}
      ></textarea>
    </div>

    <div class="section-header">時間範囲</div>

    <div class="field">
      <label class="field-label">開始</label>
      <span class="field-value">{anchor.timeRange.start.toString()}</span>
    </div>

    <div class="field">
      <label class="field-label">終了</label>
      <span class="field-value">{anchor.timeRange.end?.toString() ?? '—（無期限）'}</span>
    </div>

    <div class="section-header">形状情報</div>

    {#if anchor.shape.type === 'Point'}
      <div class="field">
        <label class="field-label">頂点数</label>
        <span class="field-value">1</span>
      </div>
    {:else if anchor.shape.type === 'LineString'}
      <div class="field">
        <label class="field-label">頂点数</label>
        <span class="field-value">{anchor.shape.vertexIds.length}</span>
      </div>
    {:else if anchor.shape.type === 'Polygon'}
      <div class="field">
        <label class="field-label">リング数</label>
        <span class="field-value">{anchor.shape.rings.length}</span>
      </div>
      <div class="field">
        <label class="field-label">頂点数</label>
        <span class="field-value">{anchor.shape.rings.reduce((sum, r) => sum + r.vertexIds.length, 0)}</span>
      </div>
    {/if}

    <div class="field">
      <label class="field-label">レイヤー</label>
      <span class="field-value">{anchor.placement.layerId}</span>
    </div>

    {#if anchor.shape.type === 'Polygon'}
      <div class="section-header">面スタイル</div>

      <div class="field">
        <label class="field-label" for="prop-fill">塗り色</label>
        <div class="color-field">
          <input
            class="color-picker"
            id="prop-fill"
            type="color"
            bind:value={editFillColor}
            onchange={applyChanges}
            disabled={editAutoColor}
          />
          <span class="color-value">{editFillColor}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="prop-sel-fill">選択色</label>
        <div class="color-field">
          <input
            class="color-picker"
            id="prop-sel-fill"
            type="color"
            bind:value={editSelectedFillColor}
            onchange={applyChanges}
          />
          <span class="color-value">{editSelectedFillColor}</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="prop-auto-color">自動配色</label>
        <input
          class="field-checkbox"
          id="prop-auto-color"
          type="checkbox"
          bind:checked={editAutoColor}
          onchange={applyChanges}
        />
      </div>
    {/if}

    <div class="section-header">アンカー一覧 ({feature.anchors.length}件)</div>

    <div class="anchor-list">
      {#each feature.anchors as a, i}
        <div class="anchor-item" class:active={a.id === anchor.id}>
          <span class="anchor-index">{i + 1}</span>
          <span class="anchor-range">
            {a.timeRange.start.toString()} — {a.timeRange.end?.toString() ?? '∞'}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .empty-message {
    color: #888;
    font-size: 12px;
    text-align: center;
    padding: 24px 8px;
  }

  .property-panel {
    font-size: 12px;
  }

  .section-header {
    font-size: 11px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 12px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #3c3c3c;
  }

  .section-header:first-child {
    margin-top: 0;
  }

  .field {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 4px 0;
  }

  .field-label {
    width: 60px;
    min-width: 60px;
    color: #888;
    font-size: 11px;
    padding-top: 2px;
  }

  .field-input {
    flex: 1;
    padding: 2px 6px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 12px;
    font-family: inherit;
  }

  .field-input:focus {
    border-color: #007acc;
    outline: none;
  }

  .field-input[readonly] {
    color: #888;
    cursor: default;
  }

  .field-textarea {
    flex: 1;
    padding: 4px 6px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 12px;
    font-family: inherit;
    resize: vertical;
  }

  .field-textarea:focus {
    border-color: #007acc;
    outline: none;
  }

  .field-value {
    flex: 1;
    color: #ccc;
    font-size: 12px;
    padding-top: 2px;
  }

  .color-field {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .color-picker {
    width: 28px;
    height: 22px;
    padding: 0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    background: none;
    cursor: pointer;
  }

  .color-picker:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .color-value {
    color: #999;
    font-size: 11px;
    font-family: monospace;
  }

  .field-checkbox {
    accent-color: #007acc;
  }

  .anchor-list {
    max-height: 120px;
    overflow-y: auto;
  }

  .anchor-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    font-size: 11px;
    color: #999;
    border-radius: 3px;
  }

  .anchor-item.active {
    background: #094771;
    color: #fff;
  }

  .anchor-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #444;
    font-size: 9px;
    flex-shrink: 0;
  }

  .anchor-item.active .anchor-index {
    background: #007acc;
  }

  .anchor-range {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
