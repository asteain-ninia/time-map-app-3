<script lang="ts">
  import type { WorldSettings, WorldMetadata } from '@domain/entities/World';

  let {
    isOpen = false,
    metadata = undefined as WorldMetadata | undefined,
    settings = undefined as WorldSettings | undefined,
    onSave,
    onClose,
  }: {
    isOpen?: boolean;
    metadata?: WorldMetadata;
    settings?: WorldSettings;
    onSave?: (metadata: Partial<WorldMetadata>, settings: Partial<WorldSettings>) => void;
    onClose?: () => void;
  } = $props();

  // 編集用ローカル状態
  let worldName = $state('');
  let worldDescription = $state('');
  let sliderMin = $state(0);
  let sliderMax = $state(10000);
  let zoomMin = $state(1);
  let zoomMax = $state(50);
  let equatorLength = $state(40000);
  let oblateness = $state(0.00335);
  let gridInterval = $state(10);
  let gridColor = $state('#888888');
  let gridOpacity = $state(0.3);
  let autoSaveInterval = $state(300);
  let labelAreaThreshold = $state(0.0005);
  let defaultAutoColor = $state(true);

  /** ダイアログが開いたらフォームを初期化 */
  $effect(() => {
    if (isOpen && metadata && settings) {
      worldName = metadata.worldName;
      worldDescription = metadata.worldDescription;
      sliderMin = metadata.sliderMin;
      sliderMax = metadata.sliderMax;
      zoomMin = settings.zoomMin;
      zoomMax = settings.zoomMax;
      equatorLength = settings.equatorLength;
      oblateness = settings.oblateness;
      gridInterval = settings.gridInterval;
      gridColor = settings.gridColor;
      gridOpacity = settings.gridOpacity;
      autoSaveInterval = settings.autoSaveInterval;
      labelAreaThreshold = settings.labelAreaThreshold;
      defaultAutoColor = settings.defaultAutoColor;
    }
  });

  function save(): void {
    onSave?.(
      { worldName, worldDescription, sliderMin, sliderMax },
      {
        zoomMin,
        zoomMax,
        equatorLength,
        oblateness,
        gridInterval,
        gridColor,
        gridOpacity,
        autoSaveInterval,
        labelAreaThreshold,
        defaultAutoColor,
      }
    );
    onClose?.();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="modal-overlay" onclick={() => onClose?.()}>
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="dialog" onclick={(e) => e.stopPropagation()}>
      <h3 class="dialog-title">プロジェクト設定</h3>

      <div class="dialog-body">
        <div class="section">基本情報</div>

        <div class="field">
          <label class="field-label" for="ps-name">プロジェクト名</label>
          <input class="field-input" id="ps-name" type="text" bind:value={worldName} />
        </div>

        <div class="field">
          <label class="field-label" for="ps-desc">説明</label>
          <textarea class="field-textarea" id="ps-desc" rows="2" bind:value={worldDescription}></textarea>
        </div>

        <div class="section">タイムライン</div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-min">最小年</label>
            <input class="field-input short" id="ps-min" type="number" bind:value={sliderMin} />
          </div>
          <div class="field">
            <label class="field-label" for="ps-max">最大年</label>
            <input class="field-input short" id="ps-max" type="number" bind:value={sliderMax} />
          </div>
        </div>

        <div class="section">惑星パラメータ</div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-eq">赤道長 (km)</label>
            <input class="field-input short" id="ps-eq" type="number" bind:value={equatorLength} />
          </div>
          <div class="field">
            <label class="field-label" for="ps-ob">扁平率</label>
            <input class="field-input short" id="ps-ob" type="number" step="0.00001" bind:value={oblateness} />
          </div>
        </div>

        <div class="section">表示</div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-zoom-min">最小ズーム</label>
            <input class="field-input short" id="ps-zoom-min" type="number" min="0.1" step="0.1" bind:value={zoomMin} />
          </div>
          <div class="field">
            <label class="field-label" for="ps-zoom-max">最大ズーム</label>
            <input class="field-input short" id="ps-zoom-max" type="number" min="0.1" step="0.1" bind:value={zoomMax} />
          </div>
        </div>

        <div class="section">グリッド</div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-gi">間隔 (度)</label>
            <select class="field-select" id="ps-gi" bind:value={gridInterval}>
              <option value={5}>5°</option>
              <option value={10}>10°</option>
              <option value={15}>15°</option>
              <option value={30}>30°</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="ps-gc">色</label>
            <input class="field-color" id="ps-gc" type="color" bind:value={gridColor} />
          </div>
          <div class="field">
            <label class="field-label" for="ps-go">不透明度</label>
            <input class="field-input short" id="ps-go" type="number" min="0" max="1" step="0.1" bind:value={gridOpacity} />
          </div>
        </div>

        <div class="section">面スタイル</div>

        <div class="field">
          <label class="field-label" for="ps-lat">ラベル面積閾値</label>
          <input class="field-input short" id="ps-lat" type="number" step="0.0001" bind:value={labelAreaThreshold} />
        </div>

        <div class="field">
          <label class="field-checkbox-label">
            <input type="checkbox" bind:checked={defaultAutoColor} />
            新規面の自動配色
          </label>
        </div>

        <div class="section">自動保存</div>

        <div class="field">
          <label class="field-label" for="ps-auto-save">バックアップ間隔 (秒)</label>
          <input class="field-input short" id="ps-auto-save" type="number" min="1" step="1" bind:value={autoSaveInterval} />
        </div>
      </div>

      <div class="dialog-actions">
        <button class="btn confirm" onclick={save}>保存</button>
        <button class="btn cancel" onclick={() => onClose?.()}>キャンセル</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
    min-width: 400px;
    max-width: 520px;
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
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .section {
    font-size: 11px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 12px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #3c3c3c;
  }

  .section:first-child {
    margin-top: 0;
  }

  .field {
    margin: 6px 0;
  }

  .field-row {
    display: flex;
    gap: 12px;
  }

  .field-row .field {
    flex: 1;
  }

  .field-label {
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 3px;
  }

  .field-input {
    width: 100%;
    padding: 4px 6px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 12px;
    font-family: inherit;
  }

  .field-input.short {
    width: 100%;
  }

  .field-input:focus {
    border-color: #007acc;
    outline: none;
  }

  .field-textarea {
    width: 100%;
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

  .field-select {
    width: 100%;
    padding: 4px 6px;
    background: #1e1e1e;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 12px;
  }

  .field-color {
    width: 40px;
    height: 28px;
    padding: 0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
  }

  .field-checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #ccc;
    cursor: pointer;
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
