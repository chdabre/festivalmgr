import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '#layers/core': fileURLToPath(new URL('./layers/core', import.meta.url)),
      '#layers/artists': fileURLToPath(new URL('./layers/artists', import.meta.url)),
    },
  },
})
