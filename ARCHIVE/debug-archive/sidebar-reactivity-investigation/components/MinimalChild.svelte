<script lang="ts">
  let { value = null as string | null, onUpdate }: {
    value?: string | null;
    onUpdate?: (v: string) => void;
  } = $props();
</script>

<div style="border: 1px solid lime; padding: 8px; margin: 8px;">
  <p>Child prop: {value}</p>
  <button onclick={() => onUpdate?.('hello')}>Set hello</button>
  <button onclick={() => onUpdate?.('world')}>Set world</button>
</div>
