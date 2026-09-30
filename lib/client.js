window.__ModuleLoader__.load({
	id: "@elves-ai/dsh-plugin-updater",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		/** The marker every answer of this API carries. */
		const UPDATE_API_SCHEMA = "dsh-market/update-api/v1";
		/** A market request that produced no usable answer. */
		var MarketError = class extends Error {
			code;
			marketCode;
			constructor(code, message, marketCode) {
				super(message);
				this.code = code;
				this.marketCode = marketCode;
				this.name = "MarketError";
			}
		};
		/** States an operation never leaves. */
		const TERMINAL_OPERATION_STATES = [
			"succeeded",
			"failed",
			"cancelled",
			"rolled-back"
		];
		/** True for a JSON object. */
		function isRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		/** A non-empty string member, or undefined. */
		function text(value) {
			return typeof value === "string" && value.length > 0 ? value : void 0;
		}
		/** A finite number member, or null. */
		function numberOrNull(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : null;
		}
		/** The message an error answer carries, whichever spelling it used. */
		function refusalOf(body) {
			if (body === void 0) return {
				message: void 0,
				code: void 0
			};
			const failure = isRecord(body.failure) ? body.failure : void 0;
			return {
				message: text(body.error) ?? text(body.message) ?? (failure === void 0 ? void 0 : text(failure.message)),
				code: text(body.code) ?? (failure === void 0 ? void 0 : text(failure.code))
			};
		}
		/** A version member, present only when the market reported one. */
		function versionMember(source, key) {
			const value = text(source[key]);
			return value === void 0 ? {} : { [key]: value };
		}
		/**
		* Build the market client.
		* @param options - transport and API-prefix seams.
		* @returns a client whose failures are {@link MarketError}.
		*/
		function createMarketClient(options = {}) {
			const base = options.base ?? "/dsh-market/api/v1";
			async function request(path, init) {
				const fetchImpl = options.fetchImpl ?? globalThis.fetch;
				const url = base + path;
				let response;
				try {
					response = await fetchImpl(url, {
						...init,
						headers: {
							accept: "application/json",
							...init.headers
						}
					});
				} catch (error) {
					if (init.signal?.aborted === true) throw error;
					throw new MarketError("unreachable", `${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
				}
				let parsed;
				try {
					parsed = await response.json();
				} catch {
					parsed = void 0;
				}
				const body = isRecord(parsed) ? parsed : void 0;
				if (response.status === 404 || response.status === 405 || response.status === 501) throw new MarketError("unavailable", `no plugin market answers ${url} (HTTP ${response.status})`);
				if (!response.ok) {
					const refusal = refusalOf(body);
					throw new MarketError("refused", refusal.message ?? `${url} answered HTTP ${response.status}`, refusal.code);
				}
				if (body === void 0) throw new MarketError("unreadable", `${url} answered a body that is not the update API's JSON`);
				const schema = text(body.schema);
				if (schema !== void 0 && schema !== "dsh-market/update-api/v1") throw new MarketError("unreadable", `${url} answered schema "${schema}" instead of ${UPDATE_API_SCHEMA}`);
				return body;
			}
			return {
				async capabilities(signal) {
					const body = await request("/capabilities", {
						method: "GET",
						...signal === void 0 ? {} : { signal }
					});
					const features = isRecord(body.features) ? body.features : {};
					const restart = isRecord(body.restart) ? body.restart : {};
					return {
						marketVersion: text(body.marketVersion) ?? "unknown",
						profile: text(body.profile) ?? "",
						canUpdate: features.update === true,
						restartSupported: restart.supported === true
					};
				},
				async check(name, requestOptions = {}) {
					const query = new URLSearchParams({ name });
					if (requestOptions.force === true) query.set("force", "1");
					const body = await request(`/updates?${query.toString()}`, {
						method: "GET",
						...requestOptions.signal === void 0 ? {} : { signal: requestOptions.signal }
					});
					const status = isRecord(body.package) ? body.package : void 0;
					if (status === void 0) throw new MarketError("unreadable", `the market answered no package document for ${name}`);
					return {
						name: text(status.name) ?? name,
						source: text(status.source) ?? "",
						...versionMember(status, "installedVersion"),
						...versionMember(status, "latestVersion"),
						updateAvailable: status.updateAvailable === true
					};
				},
				async start(name, requestOptions = {}) {
					const body = await request("/updates", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							packageName: name,
							...requestOptions.force === true ? { force: true } : {}
						}),
						...requestOptions.signal === void 0 ? {} : { signal: requestOptions.signal }
					});
					const nested = isRecord(body.operation) ? body.operation : void 0;
					const operationId = text(body.operationId) ?? (nested === void 0 ? void 0 : text(nested.operationId));
					if (operationId === void 0) throw new MarketError("unreadable", `the market accepted ${name} without an operation id`);
					return operationId;
				},
				async operation(operationId, signal) {
					const body = await request(`/operations?operationId=${encodeURIComponent(operationId)}`, {
						method: "GET",
						...signal === void 0 ? {} : { signal }
					});
					const record = isRecord(body.operation) ? body.operation : body;
					const state = text(record.state);
					if (state === void 0 || !isOperationState(state)) throw new MarketError("unreadable", `operation ${operationId} reports no known state`);
					const progress = isRecord(record.progress) ? record.progress : {};
					const outcome = isRecord(record.outcome) ? record.outcome : {};
					const failure = isRecord(record.failure) ? record.failure : void 0;
					return {
						operationId: text(record.operationId) ?? operationId,
						packageName: text(record.packageName) ?? "",
						state,
						...versionMember(record, "beforeVersion"),
						...versionMember(record, "installedVersion"),
						percent: numberOrNull(progress.percent),
						detail: text(progress.detail) ?? text(progress.phase) ?? null,
						restartRequired: outcome.restartRequired === true,
						...failure === void 0 ? {} : { failure: {
							code: text(failure.code) ?? "",
							message: text(failure.message) ?? "",
							retryable: failure.retryable === true
						} }
					};
				}
			};
		}
		/** Whether a string is one of the operation states this API defines. */
		function isOperationState(value) {
			return value === "queued" || value === "running" || value === "succeeded" || value === "failed" || value === "cancelled" || value === "rolled-back";
		}
		/** Sleep that ends early when its signal aborts. */
		function defaultSleep(ms, signal) {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(resolve, ms);
				signal?.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("the wait was aborted"));
				}, { once: true });
			});
		}
		/**
		* Follow one accepted operation to its terminal state.
		*
		* @param client - the market client that accepted it.
		* @param operationId - id the market returned.
		* @param options - polling cadence, deadline, cancellation, and progress sink.
		* @returns the operation record in a terminal state.
		*/
		async function watchOperation(client, operationId, options = {}) {
			const intervalMs = options.intervalMs ?? 1e3;
			const timeoutMs = options.timeoutMs ?? 18e5;
			const sleep = options.sleep ?? defaultSleep;
			const now = options.now ?? (() => Date.now());
			const deadline = now() + timeoutMs;
			for (;;) {
				const operation = await client.operation(operationId, options.signal);
				options.onProgress?.(operation);
				if (TERMINAL_OPERATION_STATES.includes(operation.state)) return operation;
				if (now() >= deadline) throw new MarketError("timeout", `operation ${operationId} was still ${operation.state} after ${timeoutMs}ms`);
				await sleep(intervalMs, options.signal);
			}
		}
		//#endregion
		//#region \0dsh-css:/Users/lingyun/mywork/dsh-plugin-updater/src/client/UpdateControl.module.css.mjs
		const css = ".updater_VufRna_status{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;display:inline-flex}.updater_VufRna_primary{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:var(--dsw-font-xs-13);cursor:pointer;border:none;padding:4px 12px}.updater_VufRna_primary:hover{background:var(--dsw-alias-button-primary-hover)}.updater_VufRna_primary:disabled{background:var(--dsw-alias-button-primary-dimmed);cursor:default}.updater_VufRna_link{color:var(--dsw-alias-link);font:inherit;cursor:pointer;background:0 0;border:none;padding:0}.updater_VufRna_done{font:var(--dsw-font-xs-13);color:var(--dsw-alias-state-success-primary);align-items:center;gap:6px;display:inline-flex}.updater_VufRna_failure{max-width:420px;font:var(--dsw-font-xs-13);color:var(--dsw-alias-state-error-primary);align-items:center;gap:8px;display:inline-flex}.updater_VufRna_errorText{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}";
		const tagId = "@elves-ai/dsh-plugin-updater/UpdateControl.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@elves-ai/dsh-plugin-updater";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var UpdateControl_module_css_default = {
			"primary": "updater_VufRna_primary",
			"failure": "updater_VufRna_failure",
			"status": "updater_VufRna_status",
			"link": "updater_VufRna_link",
			"done": "updater_VufRna_done",
			"errorText": "updater_VufRna_errorText"
		};
		//#endregion
		//#region src/client/UpdateControl.tsx
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
		/** The market client this bundle shares across every detail page. */
		const client = createMarketClient();
		/** Failure codes whose documented remedy is the same action with `force`. */
		const FORCEABLE_FAILURES = /* @__PURE__ */ new Set(["RELEASE_TOO_FRESH", "VERSION_UNCHANGED"]);
		/** The installed package this subject is about, or null when there is none. */
		function packageNameOf(subject) {
			if (subject.kind !== "bundle" && subject.kind !== "row") return null;
			const name = subject.pkg?.name;
			return typeof name === "string" && name.length > 0 ? name : null;
		}
		/** A version member, present only when the market reported one. */
		function versionOf(version) {
			return version === void 0 ? {} : { version };
		}
		/** A sentence for a request that produced no usable answer. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Whether a failed check is a reason to hide the control rather than report it. */
		function isSilent(error) {
			return error instanceof MarketError && (error.code === "unavailable" || error.code === "unreadable");
		}
		/**
		* The view a finished operation leaves behind.
		* @param operation - the terminal operation record.
		* @param t - translate seat for the sentences an operation without a failure message needs.
		* @returns what the control draws next.
		*/
		function outcomeOf(operation, t) {
			if (operation.state === "succeeded") return {
				kind: "done",
				...versionOf(operation.installedVersion),
				restartRequired: operation.restartRequired
			};
			const failure = operation.failure;
			const fallback = operation.state === "cancelled" ? "cancelled" : operation.state === "rolled-back" ? "rolledBack" : "failedUnknown";
			return {
				kind: "failed",
				message: failure?.message ?? t(fallback),
				retryable: failure?.retryable ?? true,
				forceOffered: failure !== void 0 && FORCEABLE_FAILURES.has(failure.code)
			};
		}
		/**
		* Draw the update control for one detail page.
		* @param props - the page's subject and this plugin's translate seat.
		* @returns the control, or null when this plugin has nothing to offer here.
		*/
		function UpdateControl({ subject, t }) {
			const packageName = packageNameOf(subject);
			const [view, setView] = (0, react.useState)({ kind: "checking" });
			const [attempt, setAttempt] = (0, react.useState)(0);
			const running = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (packageName === null) {
					setView({ kind: "hidden" });
					return;
				}
				const abort = new AbortController();
				setView({ kind: "checking" });
				(async () => {
					try {
						const capabilities = await client.capabilities(abort.signal);
						if (abort.signal.aborted) return;
						if (!capabilities.canUpdate) {
							setView({ kind: "hidden" });
							return;
						}
						const status = await client.check(packageName, { signal: abort.signal });
						if (abort.signal.aborted) return;
						setView(status.updateAvailable ? {
							kind: "available",
							...versionOf(status.latestVersion)
						} : {
							kind: "current",
							...versionOf(status.installedVersion)
						});
					} catch (error) {
						if (abort.signal.aborted) return;
						setView(isSilent(error) ? { kind: "hidden" } : {
							kind: "failed",
							message: messageOf(error),
							retryable: true,
							forceOffered: false
						});
					}
				})();
				return () => {
					abort.abort();
				};
			}, [
				packageName,
				attempt,
				t
			]);
			(0, react.useEffect)(() => () => {
				running.current?.abort();
			}, []);
			const apply = (0, react.useCallback)(async (force) => {
				if (packageName === null) return;
				running.current?.abort();
				const abort = new AbortController();
				running.current = abort;
				setView({
					kind: "working",
					percent: null
				});
				try {
					const operationId = await client.start(packageName, {
						force,
						signal: abort.signal
					});
					const operation = await watchOperation(client, operationId, {
						signal: abort.signal,
						onProgress: (progress) => {
							if (!abort.signal.aborted) setView({
								kind: "working",
								percent: progress.percent
							});
						}
					});
					if (abort.signal.aborted) return;
					setView(outcomeOf(operation, t));
				} catch (error) {
					if (abort.signal.aborted) return;
					setView({
						kind: "failed",
						message: messageOf(error),
						retryable: true,
						forceOffered: false
					});
				}
			}, [packageName, t]);
			if (packageName === null || view.kind === "hidden") return null;
			switch (view.kind) {
				case "checking": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UpdateControl_module_css_default.status,
					children: t("checking")
				});
				case "current": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: UpdateControl_module_css_default.status,
					children: [t("current", versionOf(view.version)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: UpdateControl_module_css_default.link,
						onClick: () => {
							setAttempt((previous) => previous + 1);
						},
						children: t("recheck")
					})]
				});
				case "available": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: UpdateControl_module_css_default.primary,
					onClick: () => {
						apply(false);
					},
					children: t("available", versionOf(view.version))
				});
				case "working": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UpdateControl_module_css_default.status,
					children: view.percent === null ? t("updating") : t("updatingPercent", { percent: String(view.percent) })
				});
				case "done": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: UpdateControl_module_css_default.done,
					children: [t("done", versionOf(view.version)), view.restartRequired ? ` · ${t("restart")}` : ""]
				});
				case "failed": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: UpdateControl_module_css_default.failure,
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: UpdateControl_module_css_default.errorText,
							children: t("failed", { message: view.message })
						}),
						view.retryable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: UpdateControl_module_css_default.link,
							onClick: () => {
								apply(false);
							},
							children: t("retry")
						}),
						view.forceOffered && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: UpdateControl_module_css_default.link,
							title: t("forceHint"),
							onClick: () => {
								apply(true);
							},
							children: t("force")
						})
					]
				});
			}
		}
		//#endregion
		//#region src/client/locales.ts
		/** Simplified Chinese copy. */
		const zh = {
			checking: "正在检查更新…",
			current: "已是最新版本",
			recheck: "重新检查",
			available: "更新到 {version}",
			updating: "正在更新…",
			updatingPercent: "正在更新 {percent}%",
			done: "已更新到 {version}",
			restart: "重启 DSH 后生效",
			failed: "更新失败：{message}",
			failedUnknown: "更新未能完成",
			cancelled: "更新已取消",
			rolledBack: "更新失败，已回滚到更新前的版本",
			retry: "重试",
			force: "强制更新",
			forceHint: "站方对刚发布的版本设有等待期；强制更新会跳过它"
		};
		/** English copy. */
		const en = {
			checking: "Checking for updates…",
			current: "Up to date",
			recheck: "Check again",
			available: "Update to {version}",
			updating: "Updating…",
			updatingPercent: "Updating {percent}%",
			done: "Updated to {version}",
			restart: "Restart DSH to apply",
			failed: "Update failed: {message}",
			failedUnknown: "The update did not finish",
			cancelled: "The update was cancelled",
			rolledBack: "The update failed and the previous version was restored",
			retry: "Retry",
			force: "Force update",
			forceHint: "The registry holds new releases for a waiting period; forcing skips it"
		};
		//#endregion
		//#region src/client/index.tsx
		/** Dictionary namespace this plugin owns. */
		const NS = "pluginUpdater";
		/** Services this half needs before it mounts. */
		const inject = ["slots", "locale"];
		/**
		* Contribute the update control to the Plugins page.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "plugin-updater: dictionaries");
			ctx.slots.inject("plugins.detail.actions", () => ctx.slots.register({
				name: "plugins.detail.actions",
				id: "plugin-updater",
				order: 40,
				locale: NS
			}, UpdateControl));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map