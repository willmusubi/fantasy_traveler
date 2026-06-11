import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into long-lived cacheable chunks, so an app-code
        // deploy doesn't bust the React/i18n download. The Anthropic SDK is NOT listed here —
        // it's dynamically imported (ai/client.ts, ai/storyline.ts), so Rollup already emits it
        // as a separate async chunk that loads only on first chat / key test.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n-vendor': ['i18next', 'react-i18next'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // §31: Playwright owns e2e/ — vitest must not try to run those specs in jsdom.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
