<script lang="ts">
  import { wrapLongitudeToPrimaryRange } from '@infrastructure/rendering/featureRenderingUtils';
  import {
    getCenterLongitudeFractionDigits,
    getJumpStep,
    getLabelEvery,
    getTickStep,
    getVisibleSpan,
  } from '@presentation/components/longitudeCompassUtils';

  interface CompassTick {
    readonly lon: number;
    readonly leftPercent: number;
    readonly isMajor: boolean;
    readonly label: string | null;
  }

  let {
    centerLongitude = 0,
    zoom = 1,
    onShift,
    onSetCenterLongitude,
  }: {
    centerLongitude?: number;
    zoom?: number;
    onShift?: (delta: number) => void;
    onSetCenterLongitude?: (lon: number) => void;
  } = $props();

  function formatLongitudeLabel(lon: number): string {
    const wrapped = wrapLongitudeToPrimaryRange(lon);
    if (wrapped === 0) return '0°';
    if (Math.abs(wrapped) === 180) return '180°';
    return `${Math.abs(wrapped)}°${wrapped > 0 ? 'E' : 'W'}`;
  }

  let fractionDigits = $derived(getCenterLongitudeFractionDigits(zoom));
  let visibleSpan = $derived(getVisibleSpan(zoom));
  let tickStep = $derived(getTickStep(zoom));
  let labelEvery = $derived(getLabelEvery(zoom));
  let jumpStep = $derived(getJumpStep(zoom));
  let jumpStepDisplay = $derived(
    Number.isInteger(jumpStep) ? `${jumpStep}` : jumpStep.toString()
  );

  let centerLongitudeDisplay = $derived.by(() => {
    const wrapped = wrapLongitudeToPrimaryRange(centerLongitude);
    const rounded = Number(wrapped.toFixed(fractionDigits));

    if (rounded === 0) {
      return '0°';
    }
    if (Math.abs(rounded) === 180) {
      return '180°';
    }

    return `${Math.abs(rounded)}°${rounded > 0 ? 'E' : 'W'}`;
  });

  let ticks = $derived.by(() => {
    const result: CompassTick[] = [];
    const startIndex = Math.floor((centerLongitude - visibleSpan / 2) / tickStep);
    const endIndex = Math.ceil((centerLongitude + visibleSpan / 2) / tickStep);

    for (let stepIndex = startIndex; stepIndex <= endIndex; stepIndex += 1) {
      const lon = Number((stepIndex * tickStep).toFixed(6));
      const delta = lon - centerLongitude;
      const leftPercent = ((delta + visibleSpan / 2) / visibleSpan) * 100;
      const wrapped = wrapLongitudeToPrimaryRange(lon);
      const isMajor =
        stepIndex % labelEvery === 0 || wrapped === 0 || Math.abs(wrapped) === 180;

      result.push({
        lon,
        leftPercent,
        isMajor,
        label: isMajor ? formatLongitudeLabel(lon) : null,
      });
    }

    return result;
  });

  function shiftLongitude(delta: number): void {
    onShift?.(delta);
  }

  function setLongitude(targetLongitude: number): void {
    onSetCenterLongitude?.(wrapLongitudeToPrimaryRange(targetLongitude));
  }

  function onCompassClick(e: MouseEvent): void {
    const currentTarget = e.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return;

    const rect = currentTarget.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0.5 : (e.clientX - rect.left) / rect.width;
    const delta = (ratio - 0.5) * visibleSpan;
    const snappedLongitude = Number(
      (Math.round((centerLongitude + delta) / tickStep) * tickStep).toFixed(6)
    );
    setLongitude(snappedLongitude);
  }

  function onCompassWheel(e: WheelEvent): void {
    e.preventDefault();
    shiftLongitude(e.deltaY > 0 ? jumpStep : -jumpStep);
  }
</script>

<div class="longitude-compass">
  <button
    class="compass-nudge"
    type="button"
    aria-label={`中心経度を${jumpStepDisplay}度西へ`}
    title={`${jumpStepDisplay}° west`}
    onclick={() => shiftLongitude(-jumpStep)}
  >
    ◀
  </button>

  <div class="compass-shell">
    <div class="compass-readout">{centerLongitudeDisplay}</div>
    <div
      class="compass-strip"
      role="slider"
      tabindex="0"
      aria-label="中心経度コンパス"
      aria-valuemin={-180}
      aria-valuemax={180}
      aria-valuenow={centerLongitude}
      onclick={onCompassClick}
      onwheel={onCompassWheel}
      onkeydown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          shiftLongitude(-jumpStep);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          shiftLongitude(jumpStep);
        }
      }}
    >
      <div class="compass-center-marker">
        <div class="compass-center-line"></div>
      </div>

      {#each ticks as tick (`tick-${tick.lon}`)}
        <div
          class="compass-tick"
          class:major={tick.isMajor}
          style:left={`${tick.leftPercent}%`}
        >
          <div class="tick-line"></div>
          {#if tick.label}
            <div class="tick-label">{tick.label}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <button
    class="compass-nudge"
    type="button"
    aria-label={`中心経度を${jumpStepDisplay}度東へ`}
    title={`${jumpStepDisplay}° east`}
    onclick={() => shiftLongitude(jumpStep)}
  >
    ▶
  </button>
</div>

<style>
  .longitude-compass {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 3;
  }

  .compass-shell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 340px;
    padding: 3px 4px 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 9px;
    background:
      linear-gradient(180deg, rgba(16, 20, 30, 0.84), rgba(8, 10, 16, 0.78));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(10px);
  }

  .compass-readout {
    text-align: center;
    color: rgba(239, 225, 181, 0.9);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.1;
    min-height: 12px;
  }

  .compass-strip {
    position: relative;
    height: 38px;
    overflow: hidden;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.03);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
    cursor: pointer;
  }

  .compass-strip::before,
  .compass-strip::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 28px;
    z-index: 1;
    pointer-events: none;
  }

  .compass-strip::before {
    left: 0;
    background: linear-gradient(90deg, rgba(8, 10, 16, 0.9), rgba(8, 10, 16, 0));
  }

  .compass-strip::after {
    right: 0;
    background: linear-gradient(270deg, rgba(8, 10, 16, 0.9), rgba(8, 10, 16, 0));
  }

  .compass-strip:focus {
    outline: 1px solid rgba(0, 122, 204, 0.8);
    outline-offset: 2px;
  }

  .compass-center-marker {
    position: absolute;
    inset: 0 auto 0 50%;
    transform: translateX(-50%);
    z-index: 2;
    pointer-events: none;
  }

  .compass-center-line {
    position: absolute;
    top: 0;
    bottom: 2px;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: linear-gradient(180deg, #f6d27f, rgba(246, 210, 127, 0.16));
    box-shadow: 0 0 10px rgba(246, 210, 127, 0.24);
  }

  .compass-tick {
    position: absolute;
    top: 8px;
    bottom: 2px;
    width: 0;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .tick-line {
    width: 1px;
    height: 9px;
    background: rgba(208, 214, 222, 0.35);
  }

  .compass-tick.major .tick-line {
    height: 13px;
    width: 2px;
    background: rgba(232, 237, 242, 0.62);
  }

  .tick-label {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(226, 232, 240, 0.72);
    font-size: 9px;
    white-space: nowrap;
  }

  .compass-nudge {
    width: 28px;
    height: 28px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(8, 10, 16, 0.82);
    color: #d7deea;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
  }

  .compass-nudge:hover {
    background: rgba(20, 26, 40, 0.92);
  }
</style>
