/**
 * Copy for the update control, in the locales this plugin ships.
 *
 * Placeholders use the harness formatter's `{name}` spelling.
 *
 * @module @elves-ai/dsh-plugin-updater/client/locales
 */

/** Every sentence the control renders. */
export type UpdateLocaleKey =
  | 'checking'
  | 'current'
  | 'recheck'
  | 'available'
  | 'updating'
  | 'updatingPercent'
  | 'done'
  | 'restart'
  | 'failed'
  | 'failedUnknown'
  | 'cancelled'
  | 'rolledBack'
  | 'retry'
  | 'force'
  | 'forceHint'

/** The translate seat the renderer binds for this plugin's namespace. */
export type Translate = (key: UpdateLocaleKey, params?: Record<string, unknown>) => string

/** Simplified Chinese copy. */
export const zh: Record<UpdateLocaleKey, string> = {
  checking: '正在检查更新…',
  current: '已是最新版本',
  recheck: '重新检查',
  available: '更新到 {version}',
  updating: '正在更新…',
  updatingPercent: '正在更新 {percent}%',
  done: '已更新到 {version}',
  restart: '重启 DSH 后生效',
  failed: '更新失败：{message}',
  failedUnknown: '更新未能完成',
  cancelled: '更新已取消',
  rolledBack: '更新失败，已回滚到更新前的版本',
  retry: '重试',
  force: '强制更新',
  forceHint: '站方对刚发布的版本设有等待期；强制更新会跳过它',
}

/** English copy. */
export const en: Record<UpdateLocaleKey, string> = {
  checking: 'Checking for updates…',
  current: 'Up to date',
  recheck: 'Check again',
  available: 'Update to {version}',
  updating: 'Updating…',
  updatingPercent: 'Updating {percent}%',
  done: 'Updated to {version}',
  restart: 'Restart DSH to apply',
  failed: 'Update failed: {message}',
  failedUnknown: 'The update did not finish',
  cancelled: 'The update was cancelled',
  rolledBack: 'The update failed and the previous version was restored',
  retry: 'Retry',
  force: 'Force update',
  forceHint: 'The registry holds new releases for a waiting period; forcing skips it',
}
