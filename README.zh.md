# dsh-plugin-updater

给 DSH「插件」页加一个**更新**入口：打开任意已安装插件的详情页，标题行就会告诉你有没有新版本、直接更新，并跟进到最终结果 —— 不用终端、不用 `dsh plugin update`，这个插件自己也不启动任何包管理器。

一切走插件市场公开的更新 API（`dsh-market/update-api/v1`）。市场发布这个 API 的目的正是如此：让插件拥有自己的更新按钮，而不用复制市场的安装算法，也不用绑定它内部的私有字段。

## 你会看到什么

| 位置 | 显示 |
|---|---|
| 详情页标题行 · 有更新 | **更新到 {version}** —— git 依赖显示短 commit |
| 详情页标题行 · 已最新 | 已是最新版本，旁边有「重新检查」 |
| 更新进行中 | 正在更新…，包管理器报告进度时显示百分比 |
| 更新完成 | 已更新到 {version} · 重启 DSH 后生效 |
| 更新失败 | 市场给出的失败原因、「重试」，以及市场明确支持的两个错误码（`RELEASE_TOO_FRESH`、`VERSION_UNCHANGED`）下的「强制更新」 |
| 未装市场／市场过旧 | 什么都不显示 —— 与其给出一个宿主会拒绝的按钮，不如安静隐藏 |

## 环境要求

- **插件市场插件**（`dshmarket`）装在同一个 profile，且 `GET /dsh-market/api/v1/capabilities` 返回 `features.update: true`。本插件自身没有任何更新实现。
- DSH `0.1.7-rc.2` 或 `0.2.0-rc.2`（它注册的插槽契约所属的两条客户端线）。

## 安装

```sh
dsh plugin --profile desktop add github:elves-ai/dsh-plugin-updater
```

跑 `dsh web` 而不是桌面 App 时，把 profile 换成 `web`。装完重启 DSH 并硬刷新页面（Cmd/Ctrl+Shift+R），浏览器端才会加载。

**仓库直接提供构建产物，安装只复制文件、不跑任何脚本。** `lib/` 是刻意提交的：pnpm 11 默认拒绝执行 git 依赖的构建脚本，除非每个使用方都精确放行到 tarball URL（其 key 里嵌了 commit），所以 `prepare` 不是降级而是直接让安装失败。[AGENTS.md](AGENTS.md) 记录了维持它最新的规则。

## 工作方式

```
插件详情页  ──▶  dsh-plugin-updater（浏览器端）
                   │
                   ├─ GET  /dsh-market/api/v1/capabilities          每次打开页面：有没有更新能力
                   ├─ GET  /dsh-market/api/v1/updates?name=<包名>    已装版本 vs 最新版本
                   ├─ POST /dsh-market/api/v1/updates               { packageName } -> operationId
                   └─ GET  /dsh-market/api/v1/operations?id=…       轮询到终态
```

请求是同源的：浏览器端访问的就是提供页面的那个宿主，也正是市场自己的同源校验允许的来源。这里不携带任何凭据、端口或主机名，插件的 Host 端也不注册任何服务、路由或工具。

**这个插件从不重启宿主。** 桌面运行时 `capabilities.restart.supported` 为 false —— 生命周期归 App 自己管 —— 所以更新完成后它只提示重启，不提供重启按钮。

## 已知限制

- **依赖市场插件。** 没装 `dshmarket`，或者版本早于更新 API，控件就一直隐藏。这里刻意不做「自己调 pnpm」的兜底：把「替换运行中 profile 里的插件」实现两遍，是 profile 被写坏的最快路径。
- **更新 API 仍是 beta。** 市场在 `/capabilities` 里报 `stability: "beta"`，字段名可能还会变。本插件只读需要的字段，并对每个响应校验 schema 标记。
- **官方条目没有更新控件。** 官方插件的详情页（subject 为 `item`）不代表某个已安装包，没有可更新的对象。
- **重启前跑的还是旧版本。** 磁盘上的文件立即替换，内存里的代码不会；每次更新完成都会说明这一点。
- **git 依赖更新到默认分支最新提交。** 这是市场的判断而不是本插件的猜测；固定到某个 tag 的依赖不会被移动。
- **没有批量更新。** 一次一个包。市场的 `updates/summary` 端点足以在列表上做个角标，本插件暂时没做。

## 开发

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit，覆盖 src、tests 与构建配置
pnpm test            # 单测：不联网、不需要 dsh profile
pnpm run build       # tsc 产出 lib/types，再由 tsdown 打包
```

| 文件 | 职责 |
|---|---|
| `src/index.ts` | Host 端：插件行的入口，不注册任何东西。 |
| `src/client/market.ts` | 市场更新 API v1，收窄到控件实际需要的部分。 |
| `src/client/UpdateControl.tsx` | 渲染进 `plugins.detail.actions` 的控件。 |
| `src/client/locales.ts` | 控件的中英文文案。 |
| `src/client/index.tsx` | 插槽与语言注册，插件的浏览器入口。 |

`src/` 有任何改动，都要重新跑 `pnpm run build` 并把 `lib/` 一起提交。

## 许可证

[MIT](LICENSE).
