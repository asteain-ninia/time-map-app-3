<script lang="ts">
  import { onDestroy } from 'svelte';
  import { navigateTime } from '@presentation/state/appState';
  import { eventBus } from '@application/EventBus';
  import {
    AVAILABLE_SPEEDS,
    TICK_INTERVAL_MS,
    type PlaybackSpeed,
    type StepUnit,
  } from '@presentation/state/timelineMachine';
  import {
    applyTimelineStep,
    applyTimelineTick,
    clampTimelineTime,
    createTimelineTime,
    hasReachedTimelineMax,
    prepareTimelinePlaybackStart,
    toTimelineDisplayState,
  } from './timelinePanelUtils';

  let {
    sliderMin = 0,
    sliderMax = 10000,
  }: {
    sliderMin?: number;
    sliderMax?: number;
  } = $props();

  let currentYear = $state(navigateTime.getCurrentTime().year);
  let currentMonth = $state(navigateTime.getCurrentTime().month ?? 1);
  let currentDay = $state(navigateTime.getCurrentTime().day ?? 1);
  let isPlaying = $state(false);
  let speed = $state<PlaybackSpeed>(1);
  let stepUnit = $state<StepUnit>('year');
  let playIntervalId = $state<ReturnType<typeof setInterval> | null>(null);

  function syncDisplayedTime(time: ReturnType<typeof createTimelineTime>): void {
    const next = toTimelineDisplayState(time);
    currentYear = next.year;
    currentMonth = next.month;
    currentDay = next.day;
  }

  function getCurrentTime(): ReturnType<typeof createTimelineTime> {
    return createTimelineTime(currentYear, currentMonth, currentDay);
  }

  /** 外部からの時刻変更を反映する */
  const unsubTimeChanged = eventBus.on('time:changed', (e) => {
    syncDisplayedTime(e.time);
  });

  onDestroy(() => {
    unsubTimeChanged();
    stopPlayback();
  });

  function navigateToCurrentTime(): void {
    const nextTime = clampTimelineTime(getCurrentTime(), sliderMin, sliderMax);
    syncDisplayedTime(nextTime);
    navigateTime.navigateTo(nextTime);
  }

  function onSliderInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    currentYear = parseInt(target.value, 10);
    navigateToCurrentTime();
  }

  /** ステップ操作 */
  function stepBack(): void {
    applyStep(-1);
  }

  function stepForward(): void {
    applyStep(1);
  }

  function applyStep(direction: 1 | -1): void {
    const nextTime = applyTimelineStep(
      getCurrentTime(),
      stepUnit,
      direction,
      sliderMin,
      sliderMax
    );
    syncDisplayedTime(nextTime);
    navigateTime.navigateTo(nextTime);
  }

  /** 再生/停止 */
  function togglePlayback(): void {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback(): void {
    const startTime = prepareTimelinePlaybackStart(getCurrentTime(), sliderMin, sliderMax);
    syncDisplayedTime(startTime);
    navigateTime.navigateTo(startTime);
    isPlaying = true;
    playIntervalId = setInterval(() => {
      const nextTime = applyTimelineTick(getCurrentTime(), speed, sliderMin, sliderMax);
      syncDisplayedTime(nextTime);
      navigateTime.navigateTo(nextTime);
      if (hasReachedTimelineMax(nextTime, sliderMax)) {
        stopPlayback();
      }
    }, TICK_INTERVAL_MS / speed);
  }

  function stopPlayback(): void {
    isPlaying = false;
    if (playIntervalId !== null) {
      clearInterval(playIntervalId);
      playIntervalId = null;
    }
  }

  /** 速度変更時に再生中なら再起動 */
  function onSpeedChange(e: Event): void {
    speed = parseFloat((e.target as HTMLSelectElement).value) as PlaybackSpeed;
    if (isPlaying) {
      stopPlayback();
      startPlayback();
    }
  }

  /** 年入力欄のフォーカスアウトで確定 */
  function onYearInputConfirm(e: FocusEvent): void {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!isNaN(value) && value >= sliderMin && value <= sliderMax) {
      currentYear = value;
      navigateToCurrentTime();
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
    <!-- 再生/停止ボタン -->
    <button class="play-button" onclick={togglePlayback} title={isPlaying ? '停止' : '再生'}>
      {#if isPlaying}
        <svg viewBox="0 0 24 24" width="16" height="16">
          <rect x="6" y="5" width="4" height="14" fill="currentColor"/>
          <rect x="14" y="5" width="4" height="14" fill="currentColor"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M8 5v14l11-7z" fill="currentColor"/>
        </svg>
      {/if}
    </button>

    <!-- ステップボタン -->
    <button class="step-button" onclick={stepBack} title="前へ">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
      </svg>
    </button>

    <!-- スライダー -->
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

    <button class="step-button" onclick={stepForward} title="次へ">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
      </svg>
    </button>

    <!-- 年入力 -->
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

    <!-- ステップ単位 -->
    <select
      class="step-unit-select"
      value={stepUnit}
      onchange={(e) => stepUnit = (e.target as HTMLSelectElement).value as StepUnit}
    >
      <option value="year">年</option>
      <option value="month">月</option>
      <option value="day">日</option>
    </select>

    <!-- 速度セレクタ -->
    <select
      class="speed-select"
      value={speed}
      onchange={onSpeedChange}
    >
      {#each AVAILABLE_SPEEDS as s}
        <option value={s}>{s}x</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .timeline-panel {
    padding: 8px 16px;
  }

  .timeline-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .play-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #094771;
    border: 1px solid #007acc;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
  }

  .play-button:hover {
    background: #0b5a8e;
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
    gap: 6px;
  }

  .year-label {
    font-size: 11px;
    color: #888;
    min-width: 36px;
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
    width: 65px;
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

  .step-unit-select, .speed-select {
    padding: 3px 4px;
    background: #3c3c3c;
    border: 1px solid #555;
    border-radius: 3px;
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
  }

  .step-unit-select:focus, .speed-select:focus {
    outline: none;
    border-color: #007acc;
  }

  .speed-select {
    width: 50px;
  }
</style>
