# dsh-plugin-updater

An **Update** control for the DeepSeek Harness plugins page. Open any installed bundle's detail page and the head row tells you whether a newer version exists, applies it in place, and follows the operation to its outcome — no terminal, no `dsh plugin update`, no package manager spawned by this plugin.

Everything runs through the plugin market's public update API (`dsh-market/update-api/v1`), which the market publishes for exactly this: a plugin-owned update button that does not copy the market's installation algorithm or bind to its private fields.

## What it does

| Where | What you see |
|---|---|
| Detail head, update available | **更新到 {version}** / **Update to {version}** — a git package shows the short commit |
| Detail head, up to date | 已是最新版本 with a **重新检查** link |
| While it runs | 正在更新… with the package manager's percentage when it reports one |
| Finished | 已更新到 {version} · 重启 DSH 后生效 |
| Failed | The market's bounded failure sentence, **重试**, and **强制更新** for the two codes the market documents it for (`RELEASE_TOO_FRESH`, `VERSION_UNCHANGED`) |
| Market absent or too old | Nothing at all — the control hides itself rather than offering an action the host would refuse |

## Requirements

- **The plugin market plugin** (`dshmarket`) installed in the same profile, and answering `GET /dsh-market/api/v1/capabilities` with `features.update: true`. This plugin has no update machinery of its own.
- DSH `0.1.7-rc.2` or `0.2.0-rc.2` (the two client lines whose slot contract it registers against).

## Install

```sh
dsh plugin --profile desktop add github:elves-ai/dsh-plugin-updater
```

Use `--profile web` when you run `dsh web` instead of the desktop app. Restart DSH afterwards and hard-refresh the page (Cmd/Ctrl+Shift+R) so the browser half loads.

**The repository ships its built bundles, so installation copies files and runs nothing.** `lib/` is committed on purpose: pnpm 11 refuses to run a git dependency's build scripts unless every consumer allowlists the exact tarball URL (the key embeds the commit), so a `prepare` script fails the install outright instead of degrading. [AGENTS.md](AGENTS.md) carries the rule that keeps it current.

## How it works

```
Plugins page detail  ──▶  dsh-plugin-updater (browser half)
                             │
                             ├─ GET  /dsh-market/api/v1/capabilities          once per page: is there an update surface?
                             ├─ GET  /dsh-market/api/v1/updates?name=<pkg>    installed vs latest
                             ├─ POST /dsh-market/api/v1/updates               { packageName } -> operationId
                             └─ GET  /dsh-market/api/v1/operations?id=…       poll to a terminal state
```

Requests are same-origin: the browser half fetches the host that served it, which is the origin the market's own fence admits. Nothing here carries a credential, a port, or a host name, and the host half of this plugin registers no service, route, or tool.

**This plugin never restarts the host.** `capabilities.restart.supported` is false on the desktop runtime, where the app owns its own lifecycle, so a finished update says so instead of offering a restart button.

## Known limitations

- **It depends on the market plugin.** Without `dshmarket` — or with one older than the update API — the control stays invisible. There is no fallback that spawns pnpm itself, deliberately: two implementations of "replace a plugin in a running profile" is how a profile gets corrupted.
- **The update API is beta.** The market reports `stability: "beta"` at `/capabilities`; field names may still move. This plugin reads only the fields it needs and checks the schema marker on every answer.
- **Official entries have no control.** A detail page for an official plugin (subject kind `item`) describes no installed package, so there is nothing to update there.
- **The old version keeps running until you restart.** The files on disk are replaced immediately; the code in memory is not. Every finished update says so.
- **A git dependency moves to the default branch head.** Whether that is a newer commit is the market's answer, not this plugin's guess; a package you pinned to a tag stays where it is.
- **No batch update.** One package per click. The market's `updates/summary` endpoint could drive a badge over the list; this plugin does not do that yet.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit over src, tests, and the build config
pnpm test            # unit suite, no network, no dsh profile
pnpm run build       # tsc declarations into lib/types, then tsdown bundles
```

| File | Responsibility |
|---|---|
| `src/index.ts` | Host half: the plugin row's entry. Registers nothing. |
| `src/client/market.ts` | The market's update API v1, narrowed to what the control asks. |
| `src/client/UpdateControl.tsx` | The control rendered into `plugins.detail.actions`. |
| `src/client/locales.ts` | Chinese and English copy for the control. |
| `src/client/index.tsx` | Slot and locale registration; the plugin's browser entry. |

`pnpm run build` must be followed by committing `lib/` whenever `src/` changes.

## License

[MIT](LICENSE).
