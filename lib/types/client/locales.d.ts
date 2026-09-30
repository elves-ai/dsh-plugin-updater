/**
 * Copy for the update control, in the locales this plugin ships.
 *
 * Placeholders use the harness formatter's `{name}` spelling.
 *
 * @module @elves-ai/dsh-plugin-updater/client/locales
 */
/** Every sentence the control renders. */
export type UpdateLocaleKey = 'checking' | 'current' | 'recheck' | 'available' | 'updating' | 'updatingPercent' | 'done' | 'restart' | 'failed' | 'failedUnknown' | 'cancelled' | 'rolledBack' | 'retry' | 'force' | 'forceHint';
/** The translate seat the renderer binds for this plugin's namespace. */
export type Translate = (key: UpdateLocaleKey, params?: Record<string, unknown>) => string;
/** Simplified Chinese copy. */
export declare const zh: Record<UpdateLocaleKey, string>;
/** English copy. */
export declare const en: Record<UpdateLocaleKey, string>;
