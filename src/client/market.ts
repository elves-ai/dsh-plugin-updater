/**
 * Client for the plugin market's versioned update API, `dsh-market/update-api/v1`.
 *
 * The market is a separate plugin: it may be absent, may predate this API, or
 * may be replaced by another provider implementing the same paths. Every read
 * therefore narrows only the fields it needs, checks the schema marker when one
 * is present, and reports a path nothing answers as {@link MarketError} with
 * code `unavailable` — a state callers hide the control for rather than show
 * as a failure.
 *
 * Requests are same-origin: the browser half fetches the host that served it,
 * which is the origin the market's own fence admits. Nothing here carries a
 * credential, port, or host name of its own.
 *
 * @module @elves-ai/dsh-plugin-updater/client/market
 */

/** Path prefix of the market's versioned update API. */
export const MARKET_API_BASE = '/dsh-market/api/v1'

/** The marker every answer of this API carries. */
export const UPDATE_API_SCHEMA = 'dsh-market/update-api/v1'

/** Why a market request produced no usable answer. */
export type MarketFailureCode =
  /** Nothing answers this path: no market is installed, or it predates the API. */
  | 'unavailable'
  /** The request never reached the host. */
  | 'unreachable'
  /** The market answered an error body. */
  | 'refused'
  /** The market answered something that is not this API's JSON. */
  | 'unreadable'
  /** An operation was accepted but did not reach a terminal state in time. */
  | 'timeout'

/** A market request that produced no usable answer. */
export class MarketError extends Error {
  constructor(
    readonly code: MarketFailureCode,
    message: string,
    /** The market's own machine code, when its answer carried one. */
    readonly marketCode?: string,
  ) {
    super(message)
    this.name = 'MarketError'
  }
}

/** What this control needs to know about the market in front of it. */
export interface MarketCapabilities {
  /** Market version, for diagnostics. */
  marketVersion: string
  /** Profile the market manages, for diagnostics. */
  profile: string
  /** Whether the market can start an update. */
  canUpdate: boolean
  /** Whether the market restarts the host itself; false means the user restarts it. */
  restartSupported: boolean
}

/** One installed package as the market's update check reports it. */
export interface PackageUpdateStatus {
  /** Package name the market checked. */
  name: string
  /** Where the package came from: `npm`, `github`, a path, … */
  source: string
  /** Version on disk; a git package reports the resolved commit. */
  installedVersion?: string
  /** Version the market would install. */
  latestVersion?: string
  /** Whether {@link PackageUpdateStatus.latestVersion} differs from the installed one. */
  updateAvailable: boolean
}

/** Every state an update operation can report. */
export type UpdateOperationState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'rolled-back'

/** States an operation never leaves. */
export const TERMINAL_OPERATION_STATES: readonly UpdateOperationState[] = ['succeeded', 'failed', 'cancelled', 'rolled-back']

/** Why an update stopped. */
export interface UpdateFailure {
  /** Stable machine code (`RELEASE_TOO_FRESH`, `RESOLVED_VERSION_MISMATCH`, …). */
  code: string
  /** Bounded user-facing sentence. */
  message: string
  /** Whether retrying unchanged can succeed. */
  retryable: boolean
}

/** One update the market is running or has finished. */
export interface UpdateOperation {
  /** Id to poll with. */
  operationId: string
  /** Package the operation is updating. */
  packageName: string
  /** Where the operation stands. */
  state: UpdateOperationState
  /** Version on disk before the operation. */
  beforeVersion?: string
  /** Version on disk once it finished. */
  installedVersion?: string
  /** Package-manager progress, 0-100, when it reports any. */
  percent: number | null
  /** What the package manager is doing, when it says. */
  detail: string | null
  /** Whether the new code is on disk but the running process still holds the old one. */
  restartRequired: boolean
  /** Present once the operation failed. */
  failure?: UpdateFailure
}

/** The market's update API, narrowed to what this plugin asks of it. */
export interface MarketClient {
  /**
   * Read what the market in front of this client supports.
   * @param signal - cancellation for this request.
   * @returns the capability subset this control branches on.
   */
  capabilities(signal?: AbortSignal): Promise<MarketCapabilities>
  /**
   * Ask whether one installed package has an update.
   * @param name - installed package name.
   * @param options - `force` bypasses the market's short check cache.
   * @returns the installed and target versions.
   */
  check(name: string, options?: { force?: boolean; signal?: AbortSignal }): Promise<PackageUpdateStatus>
  /**
   * Start an update.
   * @param name - installed package name.
   * @param options - `force` opts this operation out of the registry release-age wait.
   * @returns the operation id to poll.
   */
  start(name: string, options?: { force?: boolean; signal?: AbortSignal }): Promise<string>
  /**
   * Read one operation.
   * @param operationId - id the market returned from {@link MarketClient.start}.
   * @param signal - cancellation for this request.
   * @returns the operation's current record.
   */
  operation(operationId: string, signal?: AbortSignal): Promise<UpdateOperation>
}

/** Transport seam for tests and for deployments behind a different origin. */
export interface MarketClientOptions {
  /** Transport override; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** API prefix override; defaults to {@link MARKET_API_BASE}. */
  base?: string
}

/** True for a JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A non-empty string member, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** A finite number member, or null. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The message an error answer carries, whichever spelling it used. */
function refusalOf(body: Record<string, unknown> | undefined): { message: string | undefined; code: string | undefined } {
  if (body === undefined) return { message: undefined, code: undefined }
  const failure = isRecord(body.failure) ? body.failure : undefined
  return {
    message: text(body.error) ?? text(body.message) ?? (failure === undefined ? undefined : text(failure.message)),
    code: text(body.code) ?? (failure === undefined ? undefined : text(failure.code)),
  }
}

/** A version member, present only when the market reported one. */
function versionMember(source: Record<string, unknown>, key: string): { [key: string]: string } {
  const value = text(source[key])
  return value === undefined ? {} : { [key]: value }
}

/**
 * Build the market client.
 * @param options - transport and API-prefix seams.
 * @returns a client whose failures are {@link MarketError}.
 */
export function createMarketClient(options: MarketClientOptions = {}): MarketClient {
  const base = options.base ?? MARKET_API_BASE

  async function request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    const url = base + path
    let response: Response
    try {
      response = await fetchImpl(url, { ...init, headers: { accept: 'application/json', ...init.headers } })
    } catch (error) {
      if (init.signal?.aborted === true) throw error
      throw new MarketError('unreachable', `${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`)
    }
    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      parsed = undefined
    }
    const body = isRecord(parsed) ? parsed : undefined
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new MarketError('unavailable', `no plugin market answers ${url} (HTTP ${response.status})`)
    }
    if (!response.ok) {
      const refusal = refusalOf(body)
      throw new MarketError('refused', refusal.message ?? `${url} answered HTTP ${response.status}`, refusal.code)
    }
    if (body === undefined) {
      throw new MarketError('unreadable', `${url} answered a body that is not the update API's JSON`)
    }
    const schema = text(body.schema)
    if (schema !== undefined && schema !== UPDATE_API_SCHEMA) {
      throw new MarketError('unreadable', `${url} answered schema "${schema}" instead of ${UPDATE_API_SCHEMA}`)
    }
    return body
  }

  return {
    async capabilities(signal?: AbortSignal): Promise<MarketCapabilities> {
      const body = await request('/capabilities', { method: 'GET', ...signal === undefined ? {} : { signal } })
      const features = isRecord(body.features) ? body.features : {}
      const restart = isRecord(body.restart) ? body.restart : {}
      return {
        marketVersion: text(body.marketVersion) ?? 'unknown',
        profile: text(body.profile) ?? '',
        // A market that predates the update feature answers capabilities without
        // this flag; reading absence as "cannot update" keeps the control hidden
        // instead of offering an action the market would refuse.
        canUpdate: features.update === true,
        restartSupported: restart.supported === true,
      }
    },

    async check(name: string, requestOptions = {}): Promise<PackageUpdateStatus> {
      const query = new URLSearchParams({ name })
      if (requestOptions.force === true) query.set('force', '1')
      const body = await request(`/updates?${query.toString()}`, {
        method: 'GET',
        ...requestOptions.signal === undefined ? {} : { signal: requestOptions.signal },
      })
      const status = isRecord(body.package) ? body.package : undefined
      if (status === undefined) {
        throw new MarketError('unreadable', `the market answered no package document for ${name}`)
      }
      return {
        name: text(status.name) ?? name,
        source: text(status.source) ?? '',
        ...versionMember(status, 'installedVersion'),
        ...versionMember(status, 'latestVersion'),
        updateAvailable: status.updateAvailable === true,
      }
    },

    async start(name: string, requestOptions = {}): Promise<string> {
      const body = await request('/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageName: name, ...requestOptions.force === true ? { force: true } : {} }),
        ...requestOptions.signal === undefined ? {} : { signal: requestOptions.signal },
      })
      const nested = isRecord(body.operation) ? body.operation : undefined
      const operationId = text(body.operationId) ?? (nested === undefined ? undefined : text(nested.operationId))
      if (operationId === undefined) {
        throw new MarketError('unreadable', `the market accepted ${name} without an operation id`)
      }
      return operationId
    },

    async operation(operationId: string, signal?: AbortSignal): Promise<UpdateOperation> {
      const body = await request(`/operations?operationId=${encodeURIComponent(operationId)}`, {
        method: 'GET',
        ...signal === undefined ? {} : { signal },
      })
      const record = isRecord(body.operation) ? body.operation : body
      const state = text(record.state)
      if (state === undefined || !isOperationState(state)) {
        throw new MarketError('unreadable', `operation ${operationId} reports no known state`)
      }
      const progress = isRecord(record.progress) ? record.progress : {}
      const outcome = isRecord(record.outcome) ? record.outcome : {}
      const failure = isRecord(record.failure) ? record.failure : undefined
      return {
        operationId: text(record.operationId) ?? operationId,
        packageName: text(record.packageName) ?? '',
        state,
        ...versionMember(record, 'beforeVersion'),
        ...versionMember(record, 'installedVersion'),
        percent: numberOrNull(progress.percent),
        detail: text(progress.detail) ?? text(progress.phase) ?? null,
        restartRequired: outcome.restartRequired === true,
        ...failure === undefined ? {} : {
          failure: {
            code: text(failure.code) ?? '',
            message: text(failure.message) ?? '',
            retryable: failure.retryable === true,
          },
        },
      }
    },
  }
}

/** Whether a string is one of the operation states this API defines. */
function isOperationState(value: string): value is UpdateOperationState {
  return value === 'queued' || value === 'running' || value === 'succeeded'
    || value === 'failed' || value === 'cancelled' || value === 'rolled-back'
}

/** How long to wait between two reads of one operation. */
export const DEFAULT_OPERATION_POLL_MS = 1_000

/** How long one accepted operation may run before this client stops waiting. */
export const DEFAULT_OPERATION_TIMEOUT_MS = 30 * 60 * 1_000

/** Options for {@link watchOperation}. */
export interface WatchOperationOptions {
  /** Cancellation: aborts the running read and the wait between reads. */
  signal?: AbortSignal
  /** Milliseconds between reads. */
  intervalMs?: number
  /** Milliseconds one operation may take before this call gives up. */
  timeoutMs?: number
  /** Called with every record read, including the terminal one. */
  onProgress?: (operation: UpdateOperation) => void
  /** Sleep seam for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Clock seam for tests. */
  now?: () => number
}

/** Sleep that ends early when its signal aborts. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('the wait was aborted'))
    }, { once: true })
  })
}

/**
 * Follow one accepted operation to its terminal state.
 *
 * @param client - the market client that accepted it.
 * @param operationId - id the market returned.
 * @param options - polling cadence, deadline, cancellation, and progress sink.
 * @returns the operation record in a terminal state.
 */
export async function watchOperation(
  client: MarketClient,
  operationId: string,
  options: WatchOperationOptions = {},
): Promise<UpdateOperation> {
  const intervalMs = options.intervalMs ?? DEFAULT_OPERATION_POLL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? ((): number => Date.now())
  const deadline = now() + timeoutMs
  for (;;) {
    const operation = await client.operation(operationId, options.signal)
    options.onProgress?.(operation)
    if (TERMINAL_OPERATION_STATES.includes(operation.state)) return operation
    if (now() >= deadline) {
      throw new MarketError('timeout', `operation ${operationId} was still ${operation.state} after ${timeoutMs}ms`)
    }
    await sleep(intervalMs, options.signal)
  }
}

/**
 * A version as a person reads it: a resolved commit shortened, a release kept whole.
 * @param version - the market's version string.
 * @returns the display form.
 */
export function shortVersion(version: string): string {
  return /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 7) : version
}
