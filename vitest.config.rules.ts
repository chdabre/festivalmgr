import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['layers/**/test/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '#layers/core': fileURLToPath(new URL('./layers/core', import.meta.url)),
    },
  },
})
