// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UpdateControl, outcomeOf, type DetailSubject } from '../src/client/UpdateControl.tsx'
import type { Translate } from '../src/client/locales.ts'

/** A translate seat that shows which key was asked for. */
const t: Translate = (key, params) => (params === undefined ? key : `${key}(${JSON.stringify(params)})`)

/** One operation record as the market reports it. */
function operation(overrides: Partial<Parameters<typeof outcomeOf>[0]> = {}) {
  return {
    operationId: 'op',
    packageName: 'dshmarket',
    state: 'succeeded' as const,
    percent: null,
    detail: null,
    restartRequired: false,
    ...overrides,
  }
}

describe('the update control', () => {
  it('draws nothing for a detail page that carries no installed package', () => {
    const subject: DetailSubject = { kind: 'item' }
    expect(renderToStaticMarkup(createElement(UpdateControl, { subject, t }))).toBe('')
  })

  it('opens on the checking state for a bundle page', () => {
    const subject: DetailSubject = { kind: 'bundle', pkg: { name: 'dshmarket' } }
    expect(renderToStaticMarkup(createElement(UpdateControl, { subject, t }))).toContain('checking')
  })
})

describe('the outcome a finished operation leaves', () => {
  it('reports the installed version and whether a restart is owed', () => {
    expect(outcomeOf(operation({ installedVersion: '1.67.0', restartRequired: true }), t)).toEqual({
      kind: 'done',
      version: '1.67.0',
      restartRequired: true,
    })
  })

  it('offers the force retry only for the failures the market documents it for', () => {
    expect(outcomeOf(operation({
      state: 'failed',
      failure: { code: 'RELEASE_TOO_FRESH', message: 'too fresh', retryable: true },
    }), t)).toEqual({ kind: 'failed', message: 'too fresh', retryable: true, forceOffered: true })

    expect(outcomeOf(operation({
      state: 'failed',
      failure: { code: 'DOWNGRADE_DETECTED', message: 'older', retryable: false },
    }), t)).toEqual({ kind: 'failed', message: 'older', retryable: false, forceOffered: false })
  })

  it('names a cancelled or rolled-back operation when the market sent no sentence', () => {
    expect(outcomeOf(operation({ state: 'cancelled' }), t)).toMatchObject({ kind: 'failed', message: 'cancelled' })
    expect(outcomeOf(operation({ state: 'rolled-back' }), t)).toMatchObject({ kind: 'failed', message: 'rolledBack' })
    expect(outcomeOf(operation({ state: 'failed' }), t)).toMatchObject({ kind: 'failed', message: 'failedUnknown' })
  })
})
