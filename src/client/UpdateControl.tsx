/**
 * The update control on a plugin's detail page.
 *
 * It renders into `plugins.detail.actions`, the head of the Plugins page's
 * detail view, beside the page's own enable switch and uninstall control. The
 * subject names the package the open page is about; an official entry carries
 * no installed package of its own, so this control renders nothing for it.
 *
 * Nothing is offered until the market in front of this bundle answers: a
 * harness without the market plugin gets no control rather than a broken one,
 * and a market predating the update API gets the same silence.
 *
 * @module @elves-ai/dsh-plugin-updater/client/UpdateControl
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  MarketError,
  createMarketClient,
  shortVersion,
  watchOperation,
  type MarketClient,
  type UpdateOperation,
} from './market.ts'
import type { Translate } from './locales.ts'
import css from './UpdateControl.module.css'

/** The market client this bundle shares across every detail page. */
const client: MarketClient = createMarketClient()

/** Failure codes whose documented remedy is the same action with `force`. */
const FORCEABLE_FAILURES = new Set(['RELEASE_TOO_FRESH', 'VERSION_UNCHANGED'])

/** The detail subject as this control reads it: only bundles and rows carry a package. */
export interface DetailSubject {
  /** `bundle`, `row`, or `item` on the pages the Plugins page opens. */
  readonly kind: string
  /** The package the page is about, absent for an official entry. */
  readonly pkg?: { readonly name?: unknown } | undefined
}

/** Props of the control: the page's subject and this plugin's translate seat. */
export interface UpdateControlProps {
  /** Subject of the open detail page. */
  readonly subject: DetailSubject
  /** Translate seat the renderer binds from this registration's namespace. */
  readonly t: Translate
}

/** What the control draws. */
type View =
  | { kind: 'checking' }
  | { kind: 'hidden' }
  | { kind: 'current'; version?: string }
  | { kind: 'available'; version?: string }
  | { kind: 'working'; percent: number | null }
  | { kind: 'done'; version?: string; restartRequired: boolean }
  | { kind: 'failed'; message: string; retryable: boolean; forceOffered: boolean }

/** The installed package this subject is about, or null when there is none. */
function packageNameOf(subject: DetailSubject): string | null {
  if (subject.kind !== 'bundle' && subject.kind !== 'row') return null
  const name = subject.pkg?.name
  return typeof name === 'string' && name.length > 0 ? name : null
}

/** A version member, present only when the market reported one. */
function versionOf(version: string | undefined): { version?: string } {
  return version === undefined ? {} : { version }
}

/** A sentence for a request that produced no usable answer. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether a failed check is a reason to hide the control rather than report it. */
function isSilent(error: unknown): boolean {
  return error instanceof MarketError && (error.code === 'unavailable' || error.code === 'unreadable')
}

/**
 * The view a finished operation leaves behind.
 * @param operation - the terminal operation record.
 * @param t - translate seat for the sentences an operation without a failure message needs.
 * @returns what the control draws next.
 */
export function outcomeOf(operation: UpdateOperation, t: Translate): View {
  if (operation.state === 'succeeded') {
    return { kind: 'done', ...versionOf(operation.installedVersion), restartRequired: operation.restartRequired }
  }
  const failure = operation.failure
  const fallback = operation.state === 'cancelled'
    ? 'cancelled'
    : operation.state === 'rolled-back' ? 'rolledBack' : 'failedUnknown'
  return {
    kind: 'failed',
    message: failure?.message ?? t(fallback),
    retryable: failure?.retryable ?? true,
    forceOffered: failure !== undefined && FORCEABLE_FAILURES.has(failure.code),
  }
}

/**
 * Draw the update control for one detail page.
 * @param props - the page's subject and this plugin's translate seat.
 * @returns the control, or null when this plugin has nothing to offer here.
 */
export function UpdateControl({ subject, t }: UpdateControlProps): ReactElement | null {
  const packageName = packageNameOf(subject)
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const running = useRef<AbortController | null>(null)

  useEffect(() => {
    if (packageName === null) {
      setView({ kind: 'hidden' })
      return
    }
    const abort = new AbortController()
    setView({ kind: 'checking' })
    void (async () => {
      try {
        const capabilities = await client.capabilities(abort.signal)
        if (abort.signal.aborted) return
        if (!capabilities.canUpdate) {
          setView({ kind: 'hidden' })
          return
        }
        const status = await client.check(packageName, { signal: abort.signal })
        if (abort.signal.aborted) return
        setView(status.updateAvailable
          ? { kind: 'available', ...versionOf(status.latestVersion) }
          : { kind: 'current', ...versionOf(status.installedVersion) })
      } catch (error) {
        if (abort.signal.aborted) return
        setView(isSilent(error)
          ? { kind: 'hidden' }
          : { kind: 'failed', message: messageOf(error), retryable: true, forceOffered: false })
      }
    })()
    return () => { abort.abort() }
  }, [packageName, attempt, t])

  useEffect(() => () => { running.current?.abort() }, [])

  const apply = useCallback(async (force: boolean): Promise<void> => {
    if (packageName === null) return
    running.current?.abort()
    const abort = new AbortController()
    running.current = abort
    setView({ kind: 'working', percent: null })
    try {
      const operationId = await client.start(packageName, { force, signal: abort.signal })
      const operation = await watchOperation(client, operationId, {
        signal: abort.signal,
        onProgress: (progress) => {
          if (!abort.signal.aborted) setView({ kind: 'working', percent: progress.percent })
        },
      })
      if (abort.signal.aborted) return
      setView(outcomeOf(operation, t))
    } catch (error) {
      if (abort.signal.aborted) return
      setView({ kind: 'failed', message: messageOf(error), retryable: true, forceOffered: false })
    }
  }, [packageName, t])

  if (packageName === null || view.kind === 'hidden') return null

  switch (view.kind) {
    case 'checking':
      return <span className={css.status}>{t('checking')}</span>
    case 'current':
      return (
        <span className={css.status}>
          {t('current', versionOf(view.version))}
          <button type="button" className={css.link} onClick={() => { setAttempt(previous => previous + 1) }}>
            {t('recheck')}
          </button>
        </span>
      )
    case 'available':
      return (
        <button type="button" className={css.primary} onClick={() => { void apply(false) }}>
          {t('available', versionOf(view.version))}
        </button>
      )
    case 'working':
      return (
        <span className={css.status}>
          {view.percent === null ? t('updating') : t('updatingPercent', { percent: String(view.percent) })}
        </span>
      )
    case 'done':
      return (
        <span className={css.done}>
          {t('done', versionOf(view.version))}
          {view.restartRequired ? ` · ${t('restart')}` : ''}
        </span>
      )
    case 'failed':
      return (
        <span className={css.failure} role="alert">
          <span className={css.errorText}>{t('failed', { message: view.message })}</span>
          {view.retryable && (
            <button type="button" className={css.link} onClick={() => { void apply(false) }}>{t('retry')}</button>
          )}
          {view.forceOffered && (
            <button
              type="button"
              className={css.link}
              title={t('forceHint')}
              onClick={() => { void apply(true) }}
            >
              {t('force')}
            </button>
          )}
        </span>
      )
  }
}
