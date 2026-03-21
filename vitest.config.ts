import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/renderer/domain'),
      '@application': resolve(__dirname, 'src/renderer/application'),
      '@infrastructure': resolve(__dirname, 'src/renderer/infrastructure'),
      '@presentation': resolve(__dirname, 'src/renderer/presentation'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
