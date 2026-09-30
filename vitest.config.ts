import { defineConfig } from 'vitest/config'

/**
 * Unit suite: no network and no dsh profile. Every market request is served by
 * an injected `fetch`, so these specs pass without a running harness.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
})
