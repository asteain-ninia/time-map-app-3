<script lang="ts">
  import type { Feature } from '@domain/entities/Feature';
  import type { WorldSettings } from '@domain/entities/World';
  import type { TimePoint } from '@domain/value-objects/TimePoint';
  import type { AnchorProperty } from '@domain/value-objects/FeatureAnchor';
  import {
    DEFAULT_PALETTE_NAME,
    getAvailablePaletteNames,
  } from '@infrastructure/StyleResolver';
  import {
    buildAnchorTimelineSegments,
    formatAnchorRange,
    getCurrentTimePercent,
    sortAnchorsByStart,
  } from './propertyPanelHistoryUtils';

  let {
    feature = null as Feature | null,
    selectionState = { kind: 'empty' as const },
    settings = undefined as WorldSettings | undefined,
    currentTime = undefined as TimePoint | undefined,
    timelineMin = 0,
    timelineMax = 10000,
    features = [] as readonly Feature[],
    onPropertyChange,
  }: {
    feature?: Feature | null;
    selectionState?: {
      kind: 'empty' | 'multiple' | 'unknown';
      featureSummaries?: readonly { id: string; name: string }[];
      remainingCount?: number;
    };
    settings?: WorldSettings;
    currentTime?: TimePoint;
    timelineMin?: number;
    timelineMax?: number;
    features?: readonly Feature[];
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
  let editPalette = $state(DEFAULT_PALETTE_NAME);
  let historyViewMode = $state<'bar' | 'list'>('bar');
  let availablePalettes = $derived(getAvailablePaletteNames(settings?.customPalettes ?? []));
  let sortedAnchors = $derived(feature ? sortAnchorsByStart(feature.anchors) : []);
  let featureById = $derived(new Map(features.map((candidate) => [candidate.id, candidate])));
  let timelineSegments = $derived(
    buildAnchorTimelineSegments(sortedAnchors, timelineMin, timelineMax)
  );
  let currentTimePercent = $derived(
    currentTime ? getCurrentTimePercent(currentTime, timelineMin, timelineMax) : null
  );

  /** featureまたはanchor変更時にフォームを同期 */
  $effect(() => {
    // feature.idを明示的に読み取り、地物変更時の再トリガーを保証する
    const _featureId = feature?.id;
    const _anchorId = anchor?.id;
    if (anchor) {
      editName = anchor.property.name;
      editDescription = anchor.property.description;
      editFillColor = anchor.property.style?.fillColor ?? '#4a90d9';
      editSelectedFillColor = anchor.property.style?.selectedFillColor ?? '#00ccff';
      editAutoColor = anchor.property.style?.autoColor ?? false;
      editPalette = anchor.property.style?.palette ?? DEFAULT_PALETTE_NAME;
    }
  });

  $effect(() => {
    if (!availablePalettes.includes(editPalette)) {
      editPalette = settings?.defaultPalette ?? DEFAULT_PALETTE_NAME;
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
          palette: editPalette,
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

  function formatRelatedFeature(featureId: string): string {
    const relatedFeature = featureById.get(featureId);
    if (!relatedFeature || !currentTime) return featureId;
    const name = relatedFeature.getActiveAnchor(currentTime)?.property.name;
    return name ? `${name} (${featureId})` : featureId;
  }

  function formatRelatedFeatures(featureIds: readonly string[]): string {
    return featureIds.length > 0
      ? featureIds.map((featureId) => formatRelatedFeature(featureId)).join(', ')
      : 'なし';
  }
</script>

{#if !feature || !anchor}
  {#if selectionState.kind === 'multiple'}
    <div class="empty-message selection-message">
      <p>複数の地物が選択されています。プロパティ編集は1件ずつ行ってください。</p>
      {#if selectionState.featureSummaries && selectionState.featureSummaries.length > 0}
        <ul class="selection-owner-list">
          {#each selectionState.featureSummaries as featureSummary}
            <li>{featureSummary.name} ({featureSummary.id})</li>
          {/each}
        </ul>
      {/if}
      {#if (selectionState.remainingCount ?? 0) > 0}
        <p>ほか {selectionState.remainingCount} 件</p>
      {/if}
    </div>
  {:else if selectionState.kind === 'unknown'}
    <div class="empty-message selection-message">
      選択された頂点の所有者を特定できません。可視レイヤーの地物を直接選択してください。
    </div>
  {:else}
    <div class="empty-message">地物または頂点が選択されていません</div>
  {/if}
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
      <div class="field">
        <label class="field-label">親</label>
        <span class="field-value">
          {anchor.placement.parentId ? formatRelatedFeature(anchor.placement.parentId) : 'なし'}
        </span>
      </div>
      <div class="field">
        <label class="field-label">下位領域</label>
        <span class="field-value">
          {formatRelatedFeatures(anchor.placement.childIds)}
        </span>
      </div>

      <div class="section-header">面スタイル</div>

      <div class="field">
        <label class="field-label" for="prop-palette">パレット</label>
        <select
          class="field-input"
          id="prop-palette"
          bind:value={editPalette}
          onchange={applyChanges}
          disabled={!editAutoColor}
        >
          {#each availablePalettes as paletteName}
            <option value={paletteName}>{paletteName}</option>
          {/each}
        </select>
      </div>

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
            disabled={editAutoColor}
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

      <div class="field-hint">
        {#if editAutoColor}
          隣接関係が変わったときに、現在のパレットで自動更新します。
        {:else}
          現在の色を維持し、システムは自動更新しません。
        {/if}
      </div>
    {/if}

    <div class="section-header history-header">
      <span>アンカー表示 ({feature.anchors.length}件)</span>
      <div class="history-toggle" role="tablist" aria-label="アンカー表示形式">
        <button
          class="history-toggle-btn"
          class:active={historyViewMode === 'bar'}
          type="button"
          onclick={() => historyViewMode = 'bar'}
        >
          時間バー
        </button>
        <button
          class="history-toggle-btn"
          class:active={historyViewMode === 'list'}
          type="button"
          onclick={() => historyViewMode = 'list'}
        >
          リスト
        </button>
      </div>
    </div>

    {#if historyViewMode === 'bar'}
      <div class="timeline-scale">
        <span>{timelineMin}</span>
        <span>{timelineMax}</span>
      </div>

      <div class="anchor-timeline">
        {#if currentTimePercent !== null}
          <div class="current-time-indicator" style:left={`${currentTimePercent}%`}></div>
        {/if}

        {#each sortedAnchors as a, i}
          {@const segment = timelineSegments[i]}
          <div class="anchor-timeline-row" class:active={a.id === anchor.id}>
            <div class="anchor-timeline-meta">
              <span class="anchor-index">{i + 1}</span>
              <span class="anchor-range">{formatAnchorRange(a)}</span>
            </div>
            <div class="anchor-track">
              {#if segment}
                <div
                  class="anchor-segment"
                  class:active={a.id === anchor.id}
                  style:left={`${segment.leftPercent}%`}
                  style:width={`${segment.widthPercent}%`}
                  title={formatAnchorRange(a)}
                ></div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="anchor-list">
        {#each sortedAnchors as a, i}
          <div class="anchor-item" class:active={a.id === anchor.id}>
            <span class="anchor-index">{i + 1}</span>
            <span class="anchor-range">{formatAnchorRange(a)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .empty-message {
    color: #888;
    font-size: 12px;
    text-align: center;
    padding: 24px 8px;
  }

  .selection-message {
    text-align: left;
    line-height: 1.6;
  }

  .selection-owner-list {
    margin: 8px 0 0 18px;
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

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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

  .field-hint {
    margin: 4px 0 0 68px;
    color: #888;
    font-size: 11px;
    line-height: 1.5;
  }

  .anchor-list {
    max-height: 120px;
    overflow-y: auto;
  }

  .history-toggle {
    display: inline-flex;
    gap: 4px;
  }

  .history-toggle-btn {
    padding: 2px 6px;
    border: 1px solid #3c3c3c;
    border-radius: 999px;
    background: #252526;
    color: #aaa;
    font-size: 10px;
    cursor: pointer;
  }

  .history-toggle-btn.active {
    background: #094771;
    border-color: #007acc;
    color: #fff;
  }

  .timeline-scale {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    color: #777;
    font-size: 10px;
  }

  .anchor-timeline {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0;
  }

  .current-time-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(0, 204, 255, 0.65);
    pointer-events: none;
  }

  .anchor-timeline-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .anchor-timeline-row.active .anchor-range {
    color: #fff;
  }

  .anchor-timeline-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .anchor-track {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: #252526;
    overflow: hidden;
  }

  .anchor-segment {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border-radius: 999px;
    background: rgba(74, 144, 217, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .anchor-segment.active {
    background: rgba(0, 122, 204, 0.9);
    border-color: rgba(255, 255, 255, 0.2);
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
