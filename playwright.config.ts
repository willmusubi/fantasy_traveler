// §31 E2E suite — the regression net over the REAL app (vite dev server + real
// IndexedDB + the full reducer pipeline). reducedMotion is forced so the PixiJS FX
// canvas never mounts: headless Chromium's software GL is crash-prone (diagnosed in
// §27), and the degradation ladder is exactly what production reduced-motion users
// get — so this configuration is itself a tested code path, not a cop-out.
// Run: npx playwright test   (starts the dev server itself if none is running)

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: 1, // headless envs flake; one retry keeps signal high without masking real breaks
  use: {
    baseURL: 'http://127.0.0.1:5173',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    env: { ...process.env, NO_PROXY: '*', no_proxy: '*' },
  },
})
