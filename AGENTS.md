# AGENTS.md — dsh-plugin-updater

An out-of-tree DSH plugin that contributes an **update control** to the plugins page's detail view. It owns no update machinery: it drives the plugin market's public update API from the browser half, and its host half registers nothing.

## Layout

| Path | Responsibility |
|---|---|
| `src/index.ts` | Host half: the profile row's entry. Named exports `name`/`apply`, no default export, no services, routes, or tools. |
| `src/client/market.ts` | The market's update API v1 (`dsh-market/update-api/v1`), narrowed to the fields the control reads. Every failure is a `MarketError` with a stable code. |
| `src/client/UpdateControl.tsx` | The control: check on open, start, follow to a terminal state, and the view each outcome draws. |
| `src/client/locales.ts` | Chinese and English copy, plus the `Translate` seat type. |
| `src/client/index.tsx` | Slot and locale registration: the plugin's browser entry. |
| `tsdown.config.ts` | Host bundle (ESM) and the browser module-loader factory, with the client purity gate and CSS Modules inlining. |
| `tests/` | Unit specs. No spec may reach the network or a running harness. |

One fact, one home: the API's request and response reading lives only in `market.ts`; what an outcome looks like lives only in `UpdateControl.tsx`; every sentence lives only in `locales.ts`.

## Commands

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit over src, tests, and the build config
pnpm test            # unit suite, no network
pnpm run build       # tsc declarations to lib/types, then tsdown bundles
```

There is no lint or coverage gate here. `pnpm run typecheck && pnpm test && pnpm run build` is the full local check, and `build` is what catches bundle mistakes the unit suite cannot see.

### Distribution: `lib/` is committed on purpose

The plugin is installed from its repository (`dsh plugin --profile desktop add github:elves-ai/dsh-plugin-updater`), and a git install runs no build. pnpm 11 refuses a git dependency's build scripts unless every consumer allowlists the exact tarball URL — the allowlist key embeds the commit — so `prepare` does not degrade, it fails the install outright. The repository therefore ships the bundles.

- **Rebuild and commit `lib/` in the same change as any `src/` edit.** Users run the bundle, not the source.
- **Never add `prepare` back.** `prepack` covers the publish path instead.

## Contracts that must not drift

### The update API is the market's, not ours

`market.ts` reads `dsh-market/update-api/v1` over the same origin and nothing else. Two properties are load-bearing:

- **Absence is not failure.** A 404/405/501, a schema marker naming another API, or an answer this client cannot read means "no update surface here": `capabilities` and the silent codes are what the control hides on. **Do not** turn those into alerts, and do not add a fallback that spawns a package manager — two implementations of "replace a plugin in a running profile" is how a profile gets corrupted.
- **The API is beta.** Read only the fields used here, and keep the schema check: a future provider answering different JSON must fail closed.

The request set is exactly four calls (capabilities, check, start, operation). `updates/summary`, `rollback`, and `restart` exist upstream and are deliberately unused: a badge and a rollback control need their own design pass.

### The host half registers nothing

No service, route, tool, or child process. The control is browser-side because the market's API is same-origin HTTP; anything needing the Host process belongs in the market or in DSH itself, not here.

### The browser half stays a stranger to the shell

- Seats are declared structurally in `src/client/index.tsx`. Importing the shell's `SlotMap` or `LocaleNamespaceMap` would pin this bundle to one client build; a third-party plugin registers against the runtime contract those types describe.
- `tsdown.config.ts` enforces the other half of that rule: a non-platform `@deepseek-ai/*` value import fails the build. Cross-plugin collaboration goes through cordis services and the slots a package declares.
- Copy is locale-owned: every sentence goes through `t`, dictionaries live in `locales.ts`, and placeholders use the formatter's `{name}` spelling (not `{{name}}`).

## Verified facts, and how to re-verify them

Checked against a running desktop host on **2026-09-30** (dshmarket 1.66.6, profile `desktop`, DSH 0.1.7-rc.2).

| Fact | Value | How to re-check |
|---|---|---|
| The API answers on the app's own origin | `GET /dsh-market/api/v1/capabilities` | `curl -s localhost:<port>/dsh-market/api/v1/capabilities` |
| Desktop cannot restart itself | `features.restart: false`, `restart.managedBy: "desktop-host"` | same document |
| A git package is checked by commit | `source: "github"`, versions are 40-char SHAs | `GET /dsh-market/api/v1/updates?name=<pkg>&force=1` |
| Refusals carry a machine code | `RELEASE_TOO_FRESH`, `VERSION_UNCHANGED` | the market's own `UPDATE-API-V1.md` in its package, and a failed operation record |
| The slot exists for third-party controls | `plugins.detail.actions`, owner props `{ subject }` | `packages/client/ui-plugin-manager/src/client/slot-contract.ts` in the DSH checkout |

**The market must be installed for any of this to be observable.** Without it the control hides, which is the correct state and not a bug to chase.

## Verification expectations

| Change | Run at least |
|---|---|
| `market.ts` | `pnpm test` — drive `createMarketClient` and `watchOperation` with an injected `fetch`; cover 404, a foreign schema, a refusal with a code, and the poll deadline |
| `UpdateControl.tsx` | `pnpm test` — render through `react-dom/server` for the states that need no effect, and cover `outcomeOf` for success, forceable failure, and a missing sentence |
| `locales.ts` | `pnpm run typecheck` — the key type is what keeps both dictionaries complete |
| `src/client/index.tsx`, `tsdown.config.ts` | `pnpm run build` — the purity gate and the module-loader factory are only exercised there |
| Anything under `src/` | `pnpm run build`, then commit the refreshed `lib/` with the source change |
| Anything user-visible | Update `README.md` and `README.zh.md` in the same change |

## Gotchas

- **The bundle id is the package name.** `window.__ModuleLoader__.load({ id: '@elves-ai/dsh-plugin-updater', … })` must match the name the profile row resolves, or the row loads nothing.
- **`lib/types` is generated.** `tsdown` runs with `clean: false` so it cannot wipe the declaration tree; never hand-edit `lib/`.
- **A version that is a commit deserves shortening.** `shortVersion()` is the only place that decides; a raw 40-char SHA in a button is a bug.
- **`dsh plugin` forwards to pnpm inside the profile.** Installing here does not install there.
