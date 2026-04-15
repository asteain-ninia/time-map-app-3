<script lang="ts">
  import logoUrl from '../../assets/logo.svg';

  let {
    isOpen = false,
    onClose,
  }: {
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  const version = '0.1.0';

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={isOpen ? onKeyDown : undefined} />

{#if isOpen}
  <div class="modal-overlay">
    <button
      type="button"
      class="modal-backdrop"
      aria-label="バージョン情報を閉じる"
      onclick={() => onClose?.()}
    ></button>
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="バージョン情報">
      <div class="logo-area">
        <img src={logoUrl} alt="gimoza" class="logo" />
      </div>

      <div class="info-area">
        <p class="version">version {version}</p>
        <p class="description">
          架空世界の地理と歴史を、時間軸に沿って視覚化・編纂するツール
        </p>
        <div class="separator"></div>
        <p class="credit">
          <span class="dahle-text">&#xF2F59;&#xF2F44;&#xF2F4B;&#xF2F55;&#xF2F42;&#xF2F41;</span> gimoza
          =
          <span class="dahle-text">&#xF2F59;&#xF2F44;&#xF2F51;&#xF2F50;&#xF2F44;</span> gisti(図像)
          +
          <span class="dahle-text">&#xF2F4B;&#xF2F55;&#xF2F42;&#xF2F41;</span> moza(重層の)
        </p>
        <p class="credit">by asteain-ninia</p>
        <p class="credit">with Claude (Anthropic) / Codex (OpenAI) / Gemini (Google)</p>
      </div>

      <div class="modal-actions">
        <button class="btn close" onclick={() => onClose?.()}>
          閉じる
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @font-face {
    font-family: 'asteain';
    src: url('/fonts/asteain.woff') format('woff');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

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
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 28px 32px;
    min-width: 340px;
    max-width: 420px;
    text-align: center;
  }

  .logo-area {
    margin-bottom: 8px;
  }

  .logo {
    height: 120px;
    width: auto;
  }

  .info-area {
    margin-bottom: 16px;
  }

  .version {
    font-size: 11px;
    color: #888;
    margin: 0 0 12px;
  }

  .description {
    font-size: 12px;
    color: #bbb;
    margin: 0;
    line-height: 1.6;
  }

  .separator {
    height: 1px;
    background: #444;
    margin: 14px 40px;
  }

  .credit {
    font-size: 11px;
    color: #777;
    margin: 0 0 4px;
  }

  .dahle-text {
    font-family: 'asteain', sans-serif;
    font-size: 14px;
    color: #DCCBFF;
  }

  .modal-actions {
    display: flex;
    justify-content: center;
  }

  .btn.close {
    padding: 6px 24px;
    border-radius: 4px;
    border: 1px solid #555;
    background: #3c3c3c;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
  }

  .btn.close:hover {
    background: #4c4c4c;
  }
</style>
