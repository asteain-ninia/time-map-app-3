import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [svelte({
      onwarn: (warning, handler) => {
        if (warning.code?.startsWith('a11y_')) return;
        handler(warning);
      }
    })],
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'src/renderer/public'),
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@domain': resolve(__dirname, 'src/renderer/domain'),
        '@application': resolve(__dirname, 'src/renderer/application'),
        '@infrastructure': resolve(__dirname, 'src/renderer/infrastructure'),
        '@presentation': resolve(__dirname, 'src/renderer/presentation')
      }
    }
  }
});
