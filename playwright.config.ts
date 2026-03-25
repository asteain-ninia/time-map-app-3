import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx electron-vite dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
    // Electronウィンドウのエラーは無視（rendererのdevサーバーだけ使う）
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
