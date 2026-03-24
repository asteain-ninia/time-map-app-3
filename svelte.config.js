import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  onwarn: (warning, handler) => {
    // a11y警告を一時的に抑制（将来button化で対応予定）
    if (warning.code?.startsWith('a11y_')) return;
    handler(warning);
  }
};
