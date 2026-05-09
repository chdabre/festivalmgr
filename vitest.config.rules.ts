import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['layers/**/test/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    // Serialize rules tests across files so the firestore + storage emulator
    // rule loaders aren't racing parallel workers. CI hits a "no Storage
    // ruleset is currently loaded" warning when storage.rules.test.ts starts
    // before the storage emulator finishes loading rules.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      '#layers/core': fileURLToPath(new URL('./layers/core', import.meta.url)),
    },
  },
})
