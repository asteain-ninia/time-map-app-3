<script lang="ts">
  import { onDestroy } from 'svelte';
  import { navigateTime } from '@presentation/state/appState';
  import { eventBus } from '@application/EventBus';

  let currentYear = $state(navigateTime.getCurrentTime().year);
  let sliderMin = $state(0);
  let sliderMax = $state(10000);

  /** 外部からの時刻変更を反映する */
  const unsubTimeChanged = eventBus.on('time:changed', (e) => {
    currentYear = e.time.year;
  });

  onDestroy(() => {
    unsubTimeChanged();
  });

  function onSliderInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    currentYear = parseInt(target.value, 10);
    navigateTime.navigateToYear(currentYear);
  }

  function stepBack(): void {
    if (currentYear > sliderMin) {
      currentYear--;
      navigateTime.navigateToYear(currentYear);
    }
  }

  function stepForward(): void {
    if (currentYear < sliderMax) {
      currentYear++;
      navigateTime.navigateToYear(currentYear);
    }
  }

  /** 年入力欄のフォーカスアウトで確定 */
  function onYearInputConfirm(e: FocusEvent): void {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!isNaN(value) && value >= sliderMin && value <= sliderMax) {
      currentYear = value;
      navigateTime.navigateToYear(currentYear);
    } else {
      target.value = String(currentYear);
    }
  }

  /** Enterキーで確定 */
  function onYearInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }
</script>

<div class="timeline-panel">
  <div class="timeline-controls">
    <button class="step-button" onclick={stepBack} title="前の年">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
      </svg>
    </button>

    <div class="slider-container">
      <span class="year-label min">{sliderMin}</span>
      <input
        type="range"
        class="timeline-slider"
        min={sliderMin}
        max={sliderMax}
        value={currentYear}
        oninput={onSliderInput}
      />
      <span class="year-label max">{sliderMax}</span>
    </div>

    <button class="step-button" onclick={stepForward} title="次の年">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
      </svg>
    </button>

    <div class="year-input-group">
      <label class="year-input-label" for="year-input">年:</label>
      <input
        id="year-input"
        type="number"
        class="year-input"
        value={currentYear}
        min={sliderMin}
        max={sliderMax}
        onblur={onYearInputConfirm}
        onkeydown={onYearInputKeydown}
      />
    </div>
  </div>
</div>

<style>
  .timeline-panel {
    padding: 8px 16px;
  }

  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .step-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 4px;
    color: #ccc;
    cursor: pointer;
  }

  .step-button:hover {
    background: #4c4c4c;
  }

  .slider-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .year-label {
    font-size: 11px;
    color: #888;
    min-width: 40px;
    text-align: center;
  }

  .timeline-slider {
    flex: 1;
    height: 4px;
    accent-color: #007acc;
  }

  .year-input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .year-input-label {
    font-size: 12px;
    color: #888;
  }

  .year-input {
    width: 70px;
    padding: 4px 6px;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 12px;
    text-align: right;
  }

  .year-input:focus {
    outline: none;
    border-color: #007acc;
  }
</style>
