<script lang="ts">
  /**
   * グリッド線レンダラー
   * 要件定義書2.1節: 10度間隔の緯線・経線グリッド、赤道/本初子午線/180度経線を強調表示
   */
  interface Props {
    zoom: number;
    interval?: number;
    color?: string;
    opacity?: number;
    isPrimaryWrap?: boolean;
  }

  let {
    zoom,
    interval = 10,
    color = '#888888',
    opacity = 0.3,
    isPrimaryWrap = true,
  }: Props = $props();

  /** ズームレベルに応じた線の太さ（画面上で一定に見える） */
  let strokeWidth = $derived(1 / zoom);
  let majorStrokeWidth = $derived(1.5 / zoom);

  /** 経線（縦線）の座標リスト */
  let meridians = $derived.by(() => {
    const lines: number[] = [];
    for (let lon = -180; lon <= 180; lon += interval) {
      lines.push(lon + 180);
    }
    return lines;
  });

  /** 緯線（横線）の座標リスト */
  let parallels = $derived.by(() => {
    const lines: number[] = [];
    for (let lat = -90; lat <= 90; lat += interval) {
      lines.push(90 - lat);
    }
    return lines;
  });

  /** 赤道のSVG座標 */
  const equatorY = 90;
  /** 本初子午線のSVG座標 */
  const primeMeridianX = 180;
  /** 180度経線のSVG座標 */
  const antiMeridianX1 = 0;
  const antiMeridianX2 = 360;
</script>

<g
  class:grid-layer={isPrimaryWrap}
  class:grid-layer-copy={!isPrimaryWrap}
  pointer-events="none"
>
  <!-- 通常のグリッド線 -->
  {#each meridians as x}
    <line
      x1={x} y1={0} x2={x} y2={180}
      stroke={color}
      stroke-width={strokeWidth}
      stroke-opacity={opacity}
    />
  {/each}
  {#each parallels as y}
    <line
      x1={0} y1={y} x2={360} y2={y}
      stroke={color}
      stroke-width={strokeWidth}
      stroke-opacity={opacity}
    />
  {/each}

  <!-- 赤道（強調） -->
  <line
    x1={0} y1={equatorY} x2={360} y2={equatorY}
    stroke="#ff6666"
    stroke-width={majorStrokeWidth}
    stroke-opacity={0.6}
  />
  <!-- 本初子午線（強調） -->
  <line
    x1={primeMeridianX} y1={0} x2={primeMeridianX} y2={180}
    stroke="#66ff66"
    stroke-width={majorStrokeWidth}
    stroke-opacity={0.6}
  />
  <!-- 180度経線（強調） -->
  <line
    x1={antiMeridianX1} y1={0} x2={antiMeridianX1} y2={180}
    stroke="#6666ff"
    stroke-width={majorStrokeWidth}
    stroke-opacity={0.4}
  />
  <line
    x1={antiMeridianX2} y1={0} x2={antiMeridianX2} y2={180}
    stroke="#6666ff"
    stroke-width={majorStrokeWidth}
    stroke-opacity={0.4}
  />
</g>
