<script lang="ts">
  import {
    DEFAULT_SETTINGS,
    type BaseMapSettings,
    type WorldSettings,
    type WorldMetadata,
  } from '@domain/entities/World';
  import { Layer } from '@domain/entities/Layer';
  import type { AppConfig } from '@infrastructure/ConfigManager';
  import type { LogLevel } from '@infrastructure/Logger';
  import { parseSvgMap } from './mapCanvasUtils';
  import {
    DEFAULT_PALETTE_NAME,
    getAvailablePaletteNames,
    getCustomPaletteDefinitions,
    parseCustomPaletteColors,
    serializeCustomPalette,
  } from '@infrastructure/StyleResolver';

  interface CustomPaletteDraft {
    id: string;
    name: string;
    colorsText: string;
  }

  let {
    isOpen = false,
    metadata = undefined as WorldMetadata | undefined,
    settings = undefined as WorldSettings | undefined,
    appConfig = undefined as AppConfig | undefined,
    layers = [] as readonly Layer[],
    lockedLayerIds = new Set<string>() as ReadonlySet<string>,
    onSave,
    onClose,
  }: {
    isOpen?: boolean;
    metadata?: WorldMetadata;
    settings?: WorldSettings;
    appConfig?: AppConfig;
    layers?: readonly Layer[];
    lockedLayerIds?: ReadonlySet<string>;
    onSave?: (
      metadata: Partial<WorldMetadata>,
      settings: Partial<WorldSettings>,
      layers: readonly Layer[],
      appConfig: Partial<AppConfig>
    ) => void;
    onClose?: () => void;
  } = $props();

  const builtInPalettes = getAvailablePaletteNames();

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
  let defaultPalette = $state(DEFAULT_PALETTE_NAME);
  let baseMap = $state<BaseMapSettings>({ ...DEFAULT_SETTINGS.baseMap });
  let baseMapError = $state('');
  let snapDistancePx = $state(50);
  let renderFps = $state(60);
  let alwaysVisibleVertexLimit = $state(1000);
  let logLevel = $state<LogLevel>('info');
  let draftLayers = $state<readonly Layer[]>([]);
  let newLayerName = $state('');
  let draftCustomPalettes = $state<readonly CustomPaletteDraft[]>([]);
  let newCustomPaletteName = $state('');
  let newCustomPaletteColors = $state('#4a90d9, #7ad151, #f4d35e');
  let customPaletteError = $state('');

  /** ダイアログが開いたらフォームを初期化 */
  $effect(() => {
    if (isOpen && metadata && settings && appConfig) {
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
      defaultPalette = settings.defaultPalette ?? DEFAULT_PALETTE_NAME;
      baseMap = { ...settings.baseMap };
      baseMapError = '';
      draftCustomPalettes = getCustomPaletteDefinitions(settings.customPalettes).map((palette, index) => ({
        id: `custom-palette-${index}`,
        name: palette.name,
        colorsText: palette.colors.join(', '),
      }));
      snapDistancePx = appConfig.snapDistancePx;
      renderFps = appConfig.renderFps;
      alwaysVisibleVertexLimit = appConfig.alwaysVisibleVertexLimit;
      logLevel = appConfig.logLevel;
      draftLayers = [...layers];
      newLayerName = '';
      newCustomPaletteName = '';
      newCustomPaletteColors = '#4a90d9, #7ad151, #f4d35e';
      customPaletteError = '';
    }
  });

  function createDraftCustomPaletteId(): string {
    return `custom-palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function buildCustomPaletteSpecs(
    validateAll: boolean
  ): readonly string[] | null {
    const specs: string[] = [];
    const reservedNames = new Set(builtInPalettes.map((name) => name.toLowerCase()));
    const seenNames = new Set<string>();

    for (const draft of draftCustomPalettes) {
      const name = draft.name.trim();
      const colors = parseCustomPaletteColors(draft.colorsText);
      const normalizedName = name.toLowerCase();
      const hasNameConflict = reservedNames.has(normalizedName) || seenNames.has(normalizedName);

      if (!name || colors.length < 2 || hasNameConflict) {
        if (validateAll) {
          customPaletteError = !name
            ? 'カスタムパレット名を入力してください。'
            : colors.length < 2
              ? 'カスタムパレットには16進カラーを2色以上入力してください。'
              : 'カスタムパレット名が重複しています。';
          return null;
        }
        continue;
      }

      seenNames.add(normalizedName);
      specs.push(serializeCustomPalette(name, colors));
    }

    if (validateAll) {
      customPaletteError = '';
    }
    return specs;
  }

  const availablePalettes = $derived(getAvailablePaletteNames(buildCustomPaletteSpecs(false) ?? []));

  $effect(() => {
    if (!availablePalettes.includes(defaultPalette)) {
      defaultPalette = DEFAULT_PALETTE_NAME;
    }
  });

  function updateDraftCustomPalette(
    paletteId: string,
    patch: Partial<Omit<CustomPaletteDraft, 'id'>>
  ): void {
    draftCustomPalettes = draftCustomPalettes.map((palette) =>
      palette.id === paletteId ? { ...palette, ...patch } : palette
    );
    if (customPaletteError) {
      customPaletteError = '';
    }
  }

  function addDraftCustomPalette(): void {
    const name = newCustomPaletteName.trim();
    const colors = parseCustomPaletteColors(newCustomPaletteColors);
    const reservedNames = new Set([
      ...builtInPalettes.map((palette) => palette.toLowerCase()),
      ...draftCustomPalettes.map((palette) => palette.name.trim().toLowerCase()),
    ]);

    if (!name) {
      customPaletteError = 'カスタムパレット名を入力してください。';
      return;
    }
    if (reservedNames.has(name.toLowerCase())) {
      customPaletteError = 'カスタムパレット名が重複しています。';
      return;
    }
    if (colors.length < 2) {
      customPaletteError = 'カスタムパレットには16進カラーを2色以上入力してください。';
      return;
    }

    draftCustomPalettes = [
      ...draftCustomPalettes,
      {
        id: createDraftCustomPaletteId(),
        name,
        colorsText: colors.join(', '),
      },
    ];
    newCustomPaletteName = '';
    newCustomPaletteColors = '#4a90d9, #7ad151, #f4d35e';
    customPaletteError = '';
  }

  function deleteDraftCustomPalette(paletteId: string): void {
    draftCustomPalettes = draftCustomPalettes.filter((palette) => palette.id !== paletteId);
    if (customPaletteError) {
      customPaletteError = '';
    }
  }

  function getCustomPalettePreview(colorsText: string): readonly string[] {
    return parseCustomPaletteColors(colorsText).slice(0, 8);
  }

  async function selectBaseMapFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const svgText = await file.text();
      if (!parseSvgMap(svgText)) {
        baseMapError = 'viewBox または width/height を持つSVGを選択してください。';
        return;
      }
      baseMap = {
        mode: 'custom',
        fileName: file.name,
        svgText,
      };
      baseMapError = '';
    } catch {
      baseMapError = 'SVGファイルを読み込めませんでした。';
    } finally {
      input.value = '';
    }
  }

  function resetBaseMap(): void {
    baseMap = { ...DEFAULT_SETTINGS.baseMap };
    baseMapError = '';
  }

  function createDraftLayerId(): string {
    const existingIds = new Set(draftLayers.map((layer) => layer.id));
    let index = draftLayers.length + 1;
    let candidate = `layer-${index}`;
    while (existingIds.has(candidate)) {
      index += 1;
      candidate = `layer-${index}`;
    }
    return candidate;
  }

  function addDraftLayer(): void {
    const trimmedName = newLayerName.trim();
    if (!trimmedName) return;

    draftLayers = [
      ...draftLayers,
      new Layer(createDraftLayerId(), trimmedName, draftLayers.length),
    ];
    newLayerName = '';
  }

  function updateDraftLayerName(layerId: string, name: string): void {
    draftLayers = draftLayers.map((layer) =>
      layer.id === layerId ? layer.withName(name) : layer
    );
  }

  function canDeleteLayer(layerId: string): boolean {
    return !lockedLayerIds.has(layerId);
  }

  function deleteDraftLayer(layerId: string): void {
    if (!canDeleteLayer(layerId)) return;
    if (!confirm('このレイヤーを削除しますか？')) return;

    draftLayers = draftLayers
      .filter((layer) => layer.id !== layerId)
      .map((layer, index) => layer.withOrder(index));
  }

  function save(): void {
    const customPalettes = buildCustomPaletteSpecs(true);
    if (customPalettes === null) {
      return;
    }

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
        defaultPalette,
        customPalettes,
        baseMap,
      },
      draftLayers,
      {
        snapDistancePx,
        renderFps,
        alwaysVisibleVertexLimit,
        logLevel,
      }
    );
    onClose?.();
  }
</script>

{#if isOpen}
  <div class="modal-overlay">
    <button
      type="button"
      class="modal-backdrop"
      aria-label="プロジェクト設定を閉じる"
      onclick={() => onClose?.()}
    ></button>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="プロジェクト設定">
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

        <div class="section">地図</div>

        <div class="field">
          <label class="field-label" for="ps-base-map">ベースマップSVG</label>
          <div class="base-map-row">
            <input
              class="field-input"
              id="ps-base-map"
              type="file"
              accept=".svg,image/svg+xml"
              onchange={selectBaseMapFile}
            />
            <button class="btn secondary" type="button" onclick={resetBaseMap}>
              プリセットへ戻す
            </button>
          </div>
          <div class="help-text">
            現在: {baseMap.mode === 'custom' ? baseMap.fileName : 'プリセット地図'}
          </div>
          {#if baseMapError}
            <div class="help-text error-text">{baseMapError}</div>
          {/if}
        </div>

        <div class="section">レイヤー管理</div>

        <div class="field">
          <label class="field-label" for="ps-new-layer-name">新規レイヤー</label>
          <div class="layer-create-row">
            <input
              class="field-input"
              id="ps-new-layer-name"
              type="text"
              placeholder="レイヤー名"
              bind:value={newLayerName}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addDraftLayer();
                }
              }}
            />
            <button class="btn secondary" type="button" onclick={addDraftLayer}>レイヤー追加</button>
          </div>
        </div>

        <div class="layer-list">
          {#if draftLayers.length === 0}
            <div class="layer-empty">レイヤーはまだありません</div>
          {:else}
            {#each draftLayers as layer (layer.id)}
              <div class="layer-row">
                <span class="layer-order">#{layer.order + 1}</span>
                <input
                  class="field-input"
                  type="text"
                  value={layer.name}
                  oninput={(event) =>
                    updateDraftLayerName(layer.id, (event.currentTarget as HTMLInputElement).value)}
                />
                <button
                  class="btn danger"
                  type="button"
                  disabled={!canDeleteLayer(layer.id)}
                  title={canDeleteLayer(layer.id)
                    ? '空レイヤーを削除'
                    : 'このレイヤーには地物が所属しているため削除できません'}
                  onclick={() => deleteDraftLayer(layer.id)}
                >
                  削除
                </button>
              </div>
            {/each}
          {/if}
        </div>

        <div class="help-text">
          地物が存在するレイヤーは削除できません。レイヤー順序は固定です。
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

        <div class="section">アプリ設定</div>

        <div class="field-row">
          <div class="field">
            <label class="field-label" for="ps-app-snap">共有頂点スナップ距離 (px)</label>
            <input class="field-input short" id="ps-app-snap" type="number" min="1" step="1" bind:value={snapDistancePx} />
          </div>
          <div class="field">
            <label class="field-label" for="ps-app-fps">描画更新頻度 (FPS)</label>
            <input class="field-input short" id="ps-app-fps" type="number" min="1" max="60" step="1" bind:value={renderFps} />
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="ps-app-vertex-limit">全頂点マーカー表示上限</label>
          <input class="field-input short" id="ps-app-vertex-limit" type="number" min="1" step="1" bind:value={alwaysVisibleVertexLimit} />
        </div>

        <div class="field">
          <label class="field-label" for="ps-app-log-level">ログレベル</label>
          <select class="field-select" id="ps-app-log-level" bind:value={logLevel}>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
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

        <div class="field">
          <label class="field-label" for="ps-default-palette">既定パレット</label>
          <select class="field-select" id="ps-default-palette" bind:value={defaultPalette}>
            {#each availablePalettes as paletteName}
              <option value={paletteName}>{paletteName}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label class="field-label" for="ps-custom-palette-name">カスタムパレット</label>
          <div class="palette-create-row">
            <input
              class="field-input"
              id="ps-custom-palette-name"
              type="text"
              placeholder="パレット名"
              bind:value={newCustomPaletteName}
            />
            <input
              class="field-input"
              id="ps-custom-palette-colors"
              type="text"
              placeholder="#4a90d9, #7ad151, #f4d35e"
              bind:value={newCustomPaletteColors}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addDraftCustomPalette();
                }
              }}
            />
            <button class="btn secondary" type="button" onclick={addDraftCustomPalette}>追加</button>
          </div>
        </div>

        {#if customPaletteError}
          <div class="help-text error-text">{customPaletteError}</div>
        {/if}

        <div class="palette-list">
          {#if draftCustomPalettes.length === 0}
            <div class="palette-empty">カスタムパレットはまだありません</div>
          {:else}
            {#each draftCustomPalettes as palette (palette.id)}
              <div class="palette-row">
                <input
                  class="field-input palette-name-input"
                  type="text"
                  value={palette.name}
                  oninput={(event) =>
                    updateDraftCustomPalette(palette.id, {
                      name: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
                <input
                  class="field-input palette-colors-input"
                  type="text"
                  value={palette.colorsText}
                  oninput={(event) =>
                    updateDraftCustomPalette(palette.id, {
                      colorsText: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
                <div class="palette-preview" title={palette.colorsText}>
                  {#each getCustomPalettePreview(palette.colorsText) as color}
                    <span class="palette-swatch" style:background-color={color}></span>
                  {/each}
                </div>
                <button class="btn danger" type="button" onclick={() => deleteDraftCustomPalette(palette.id)}>
                  削除
                </button>
              </div>
            {/each}
          {/if}
        </div>

        <div class="help-text">
          <code>#rrggbb</code> 形式の色をカンマ区切りで登録します。組み込みパレット名との重複はできません。
        </div>

        <div class="section">自動保存</div>

        <div class="field">
          <label class="field-label" for="ps-auto-save">バックアップ間隔 (秒)</label>
          <input class="field-input short" id="ps-auto-save" type="number" min="1" step="1" bind:value={autoSaveInterval} />
        </div>
      </div>

      <div class="dialog-actions">
        <button class="btn confirm" type="button" onclick={save}>保存</button>
        <button class="btn cancel" type="button" onclick={() => onClose?.()}>キャンセル</button>
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

  .dialog {
    position: relative;
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 20px;
    min-width: 420px;
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

  .field-input:focus,
  .field-select:focus,
  .field-textarea:focus {
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

  .base-map-row,
  .layer-create-row,
  .layer-row,
  .palette-create-row,
  .palette-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .base-map-row .btn {
    flex-shrink: 0;
  }

  .layer-list,
  .palette-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  .layer-row,
  .palette-row {
    padding: 6px 8px;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    background: #252526;
  }

  .layer-order {
    width: 28px;
    flex-shrink: 0;
    color: #888;
    font-size: 11px;
    text-align: center;
  }

  .layer-empty,
  .palette-empty,
  .help-text {
    color: #888;
    font-size: 11px;
  }

  .palette-name-input {
    max-width: 160px;
  }

  .palette-colors-input {
    flex: 1;
  }

  .palette-preview {
    display: flex;
    gap: 4px;
    min-width: 92px;
    flex-wrap: wrap;
  }

  .palette-swatch {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: #1e1e1e;
  }

  .help-text {
    margin-top: 6px;
    line-height: 1.5;
  }

  .error-text {
    color: #ff9a9a;
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

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn.confirm {
    background: #094771;
    color: #fff;
    border-color: #007acc;
  }

  .btn.confirm:hover {
    background: #0b5a8e;
  }

  .btn.cancel,
  .btn.secondary {
    background: #3c3c3c;
    color: #ccc;
  }

  .btn.cancel:hover,
  .btn.secondary:hover {
    background: #4c4c4c;
  }

  .btn.danger {
    background: #5b2d2d;
    color: #ffdede;
    border-color: #7d3b3b;
  }

  .btn.danger:hover:not(:disabled) {
    background: #713737;
  }
</style>
