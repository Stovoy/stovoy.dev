import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'npm run dev',
    port: 8081,
    reuseExistingServer: true,
  },
  testDir: 'tests',
  use: {
    baseURL: 'http://localhost:8081',
    launchOptions: {
      args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
    },
  },
});
