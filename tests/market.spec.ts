import { describe, expect, it } from 'vitest'
import {
  MARKET_API_BASE,
  UPDATE_API_SCHEMA,
  createMarketClient,
  shortVersion,
  watchOperation,
  type UpdateOperationState,
} from '../src/client/market.ts'

/** One request the fake transport saw. */
interface Sent {
  url: string
  method: string
  body: unknown
}

/** A JSON answer. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** A market client over a recording transport. */
function clientWith(script: (sent: Sent) => Response) {
  const sent: Sent[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const recorded: Sent = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined,
    }
    sent.push(recorded)
    return script(recorded)
  }
  return { client: createMarketClient({ fetchImpl }), sent }
}

/** The live capabilities document, as the desktop host answers it. */
const capabilities = {
  schema: UPDATE_API_SCHEMA,
  apiVersion: 1,
  stability: 'beta',
  marketVersion: '1.66.6',
  profile: 'desktop',
  runtime: 'desktop',
  features: { check: true, update: true, progress: true, rollback: true, restart: false, updatesSummary: true },
  restart: { supported: false, managedBy: 'desktop-host' },
}

describe('market capabilities', () => {
  it('reads the subset the control branches on', async () => {
    const { client, sent } = clientWith(() => json(capabilities))
    await expect(client.capabilities()).resolves.toEqual({
      marketVersion: '1.66.6',
      profile: 'desktop',
      canUpdate: true,
      restartSupported: false,
    })
    expect(sent[0]?.url).toBe(`${MARKET_API_BASE}/capabilities`)
  })

  it('treats a market predating the update feature as no update surface', async () => {
    const { client } = clientWith(() => json({ schema: UPDATE_API_SCHEMA, features: { check: true }, restart: { supported: true } }))
    await expect(client.capabilities()).resolves.toMatchObject({ canUpdate: false, restartSupported: true })
  })

  it('reports a path nothing answers as unavailable', async () => {
    const { client } = clientWith(() => new Response('<html>not found</html>', { status: 404 }))
    await expect(client.capabilities()).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects another provider answering a different schema', async () => {
    const { client } = clientWith(() => json({ schema: 'other/update/v9' }))
    await expect(client.capabilities()).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('reports a transport failure as unreachable', async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error('Failed to fetch'))
    const client = createMarketClient({ fetchImpl })
    await expect(client.capabilities()).rejects.toMatchObject({ code: 'unreachable' })
  })
})

describe('market update check', () => {
  it('reads the installed and target versions', async () => {
    const { client, sent } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      package: {
        name: '@elves-ai/dsh-llm-nowcoding',
        source: 'github',
        installedVersion: '1429a591e0f806e00f94f05e3a86d784f1442113',
        latestVersion: '010922e17e750b092a71cbd0ca7cad014dc8c8b4',
        updateAvailable: true,
        channelSwitch: null,
      },
    }))
    await expect(client.check('@elves-ai/dsh-llm-nowcoding')).resolves.toEqual({
      name: '@elves-ai/dsh-llm-nowcoding',
      source: 'github',
      installedVersion: '1429a591e0f806e00f94f05e3a86d784f1442113',
      latestVersion: '010922e17e750b092a71cbd0ca7cad014dc8c8b4',
      updateAvailable: true,
    })
    expect(sent[0]?.url).toBe(`${MARKET_API_BASE}/updates?name=%40elves-ai%2Fdsh-llm-nowcoding`)
  })

  it('bypasses the market check cache only when asked', async () => {
    const { client, sent } = clientWith(() => json({ schema: UPDATE_API_SCHEMA, package: { name: 'dshmarket', updateAvailable: false } }))
    await client.check('dshmarket', { force: true })
    expect(sent[0]?.url).toContain('force=1')
  })

  it('reports a check without a package document as unreadable', async () => {
    const { client } = clientWith(() => json({ schema: UPDATE_API_SCHEMA }))
    await expect(client.check('dshmarket')).rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('market update operations', () => {
  it('starts an update and returns its operation id', async () => {
    const { client, sent } = clientWith(() => json({ schema: UPDATE_API_SCHEMA, operationId: '72484-1' }, 202))
    await expect(client.start('dshmarket')).resolves.toBe('72484-1')
    expect(sent[0]?.method).toBe('POST')
    expect(sent[0]?.body).toEqual({ packageName: 'dshmarket' })
  })

  it('passes the force flag through', async () => {
    const { client, sent } = clientWith(() => json({ schema: UPDATE_API_SCHEMA, operationId: 'x' }, 202))
    await client.start('dshmarket', { force: true })
    expect(sent[0]?.body).toEqual({ packageName: 'dshmarket', force: true })
  })

  it('surfaces a refusal with the market sentence and code', async () => {
    const { client } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      error: 'the registry holds this release for another 20 minutes',
      code: 'RELEASE_TOO_FRESH',
    }, 409))
    await expect(client.start('dshmarket')).rejects.toMatchObject({
      code: 'refused',
      marketCode: 'RELEASE_TOO_FRESH',
      message: 'the registry holds this release for another 20 minutes',
    })
  })

  it('reads one operation record', async () => {
    const { client, sent } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      operation: {
        operationId: '72484-1',
        kind: 'update',
        packageName: 'dshmarket',
        state: 'running',
        beforeVersion: '1.66.0',
        installedVersion: null,
        progress: { phase: 'installing', done: 2, total: 5, percent: 40, currentPackage: 'dshmarket', detail: 'pnpm add' },
        outcome: { refreshRequired: false, restartRequired: true, rollback: { available: false, state: 'unavailable', detail: null } },
        failure: null,
      },
    }))
    const operation = await client.operation('72484-1')
    expect(operation).toEqual({
      operationId: '72484-1',
      packageName: 'dshmarket',
      state: 'running',
      beforeVersion: '1.66.0',
      percent: 40,
      detail: 'pnpm add',
      restartRequired: true,
    })
    expect(sent[0]?.url).toBe(`${MARKET_API_BASE}/operations?operationId=72484-1`)
  })

  it('reads a failure record', async () => {
    const { client } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      operation: {
        operationId: 'op',
        packageName: 'dshmarket',
        state: 'failed',
        progress: {},
        outcome: { restartRequired: false },
        failure: { code: 'DOWNGRADE_DETECTED', message: 'the resolved version is older', retryable: false },
      },
    }))
    await expect(client.operation('op')).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'DOWNGRADE_DETECTED', message: 'the resolved version is older', retryable: false },
    })
  })

  it('reports an operation with no known state as unreadable', async () => {
    const { client } = clientWith(() => json({ schema: UPDATE_API_SCHEMA, operation: { operationId: 'op', state: 'melting' } }))
    await expect(client.operation('op')).rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('watching an operation', () => {
  it('follows an operation to its terminal state and reports every read', async () => {
    const states: UpdateOperationState[] = ['queued', 'running', 'running', 'succeeded']
    let index = 0
    const { client } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      operation: { operationId: 'op', packageName: 'dshmarket', state: states[Math.min(index++, states.length - 1)], progress: {}, outcome: {} },
    }))
    const seen: string[] = []
    const operation = await watchOperation(client, 'op', {
      sleep: () => Promise.resolve(),
      onProgress: (progress) => { seen.push(progress.state) },
    })
    expect(operation.state).toBe('succeeded')
    expect(seen).toEqual(['queued', 'running', 'running', 'succeeded'])
  })

  it('gives up on an operation that outlives its deadline', async () => {
    let clock = 0
    const { client } = clientWith(() => json({
      schema: UPDATE_API_SCHEMA,
      operation: { operationId: 'op', packageName: 'dshmarket', state: 'running', progress: {}, outcome: {} },
    }))
    await expect(watchOperation(client, 'op', {
      now: () => clock,
      timeoutMs: 1_000,
      sleep: () => { clock += 600; return Promise.resolve() },
    })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('stops polling once the caller aborts', async () => {
    const abort = new AbortController()
    const { client } = clientWith(() => {
      abort.abort()
      return json({ schema: UPDATE_API_SCHEMA, operation: { operationId: 'op', packageName: 'p', state: 'running', progress: {}, outcome: {} } })
    })
    await expect(watchOperation(client, 'op', {
      signal: abort.signal,
      sleep: () => Promise.reject(new Error('the wait was aborted')),
    })).rejects.toThrow('the wait was aborted')
  })
})

describe('version display', () => {
  it('shortens a resolved commit and keeps a release whole', () => {
    expect(shortVersion('010922e17e750b092a71cbd0ca7cad014dc8c8b4')).toBe('010922e')
    expect(shortVersion('1.66.6')).toBe('1.66.6')
    expect(shortVersion('0.12.1-beta.3')).toBe('0.12.1-beta.3')
  })
})
