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
import { type ReactElement } from 'react';
import { type UpdateOperation } from './market.ts';
import type { Translate } from './locales.ts';
/** The detail subject as this control reads it: only bundles and rows carry a package. */
export interface DetailSubject {
    /** `bundle`, `row`, or `item` on the pages the Plugins page opens. */
    readonly kind: string;
    /** The package the page is about, absent for an official entry. */
    readonly pkg?: {
        readonly name?: unknown;
    } | undefined;
}
/** Props of the control: the page's subject and this plugin's translate seat. */
export interface UpdateControlProps {
    /** Subject of the open detail page. */
    readonly subject: DetailSubject;
    /** Translate seat the renderer binds from this registration's namespace. */
    readonly t: Translate;
}
/** What the control draws. */
type View = {
    kind: 'checking';
} | {
    kind: 'hidden';
} | {
    kind: 'current';
    version?: string;
} | {
    kind: 'available';
    version?: string;
} | {
    kind: 'working';
    percent: number | null;
} | {
    kind: 'done';
    version?: string;
    restartRequired: boolean;
} | {
    kind: 'failed';
    message: string;
    retryable: boolean;
    forceOffered: boolean;
};
/**
 * The view a finished operation leaves behind.
 * @param operation - the terminal operation record.
 * @param t - translate seat for the sentences an operation without a failure message needs.
 * @returns what the control draws next.
 */
export declare function outcomeOf(operation: UpdateOperation, t: Translate): View;
/**
 * Draw the update control for one detail page.
 * @param props - the page's subject and this plugin's translate seat.
 * @returns the control, or null when this plugin has nothing to offer here.
 */
export declare function UpdateControl({ subject, t }: UpdateControlProps): ReactElement | null;
export {};
