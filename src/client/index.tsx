/**
 * Browser half: the update control on a plugin's detail page.
 *
 * It contributes to `plugins.detail.actions` — the head of the Plugins page's
 * detail view — and owns one translation namespace. Both seats are declared
 * structurally: importing the shell's `SlotMap` or `LocaleNamespaceMap` would
 * pin this bundle to one client build, while a third-party plugin registers
 * against the runtime contract those types describe.
 *
 * @module @elves-ai/dsh-plugin-updater/client
 */

import type { ReactElement } from 'react'
import { UpdateControl, type UpdateControlProps } from './UpdateControl.tsx'
import { en, zh } from './locales.ts'

/** Dictionary namespace this plugin owns. */
export const NS = 'pluginUpdater'

/** The slots operations this plugin calls. */
interface SlotsSeat {
  /** Contribute once the named slot is declared, and withdraw when it collapses. */
  inject(name: string, contribute: () => void | (() => void)): void
  /** Register one entry of a list slot. */
  register(
    options: {
      /** Slot the entry belongs to. */
      name: string
      /** Entry identity within that slot. */
      id: string
      /** Place among the slot's entries. */
      order?: number
      /** Dictionary namespace that puts `t` on the entry's props. */
      locale?: string
    },
    component: (props: UpdateControlProps) => ReactElement | null,
  ): () => void
}

/** The locale operations this plugin calls. */
interface LocaleSeat {
  /** Register this plugin's dictionaries under its own namespace. */
  register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void
}

/** The browser plugin context share this half reads. */
interface ClientContext {
  /** Slot registration. */
  slots: SlotsSeat
  /** Product copy. */
  locale: LocaleSeat
  /** Effect scope: a registration lives exactly as long as this plugin does. */
  effect(callback: () => (() => void) | void, label?: string): void
}

/** Services this half needs before it mounts. */
export const inject = ['slots', 'locale']

/**
 * Contribute the update control to the Plugins page.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-updater: dictionaries')
  ctx.slots.inject('plugins.detail.actions', () => ctx.slots.register({
    name: 'plugins.detail.actions',
    id: 'plugin-updater',
    order: 40,
    locale: NS,
  }, UpdateControl))
}
