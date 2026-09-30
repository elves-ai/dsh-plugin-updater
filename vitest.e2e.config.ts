import { defineConfig } from 'vitest/config'

/**
 * Live checks against a running harness. Every spec self-skips without its
 * environment variable, so this config is safe to run anywhere.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
})
