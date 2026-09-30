import { describe, expect, it } from 'vitest'
import { createMarketClient } from '../src/client/market.ts'

/**
 * The update API as a running host answers it.
 *
 * Run it with the host's own origin:
 * `DSH_MARKET_BASE=http://127.0.0.1:19387/dsh-market/api/v1 pnpm run test:e2e`.
 * `DSH_MARKET_PACKAGE` names the installed package to check and defaults to the
 * market itself. Without `DSH_MARKET_BASE` every case skips.
 */
const base = process.env['DSH_MARKET_BASE']
const packageName = process.env['DSH_MARKET_PACKAGE'] ?? 'dshmarket'
const live = base === undefined ? describe.skip : describe

live('the live plugin market', () => {
  const client = createMarketClient({ base: base ?? '' })

  it('reports update capabilities for this host', async () => {
    const capabilities = await client.capabilities()
    expect(capabilities.marketVersion).not.toBe('unknown')
    expect(capabilities.canUpdate).toBe(true)
  })

  it('checks one installed package', async () => {
    const status = await client.check(packageName, { force: true })
    expect(status.name).toBe(packageName)
    expect(status.source.length).toBeGreaterThan(0)
    expect(typeof status.updateAvailable).toBe('boolean')
  })

  it('reports a missing market as unavailable rather than as a failure to show', async () => {
    const absent = createMarketClient({ base: new URL('/no-such-market/api/v1', base ?? 'http://127.0.0.1:1').toString() })
    await expect(absent.capabilities()).rejects.toMatchObject({ code: 'unavailable' })
  })
})
