import { CdpConnection } from "../../lib/browser-cdp-transport.ts";
import { AcquisitionError, acquisitionBudget, withinSignal } from "./acquisition.ts";
import { browserbaseKey, requestBrowserbase, type Budget } from "./browserbase.ts";
import { classifyUrl } from "./destinations.js";
import { parseHtml } from "./local-parser.ts";
import type { FetchReceipt } from "./fetch-result.ts";
function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }

/** A fresh public page read, not an interactive browser agent or local profile connection. */
export async function renderBrowserbase(url: string, maxChars: number, budget: Budget): Promise<FetchReceipt> {
	if ((await withinSignal(classifyUrl(url), budget.signal)).privateOrLocal) throw new AcquisitionError("invalid-request", "Remote backends are disabled for local/private URLs");
	if (budget.remaining() < 6000) throw new AcquisitionError("timeout", "Insufficient time for an owned browser read and release");
	const started = performance.now(); const key = await browserbaseKey(budget);
	let id: string | undefined, cdp: CdpConnection | undefined, result: FetchReceipt | undefined, failure: unknown, cleanupFailed = false;
	let denied: AcquisitionError | undefined;
	try {
		const created = await requestBrowserbase("/v1/sessions", { timeout: 60, proxies: false, browserSettings: { solveCaptchas: false } }, budget, "browser", key);
		id = string(created.id);
		if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) { id = undefined; throw new AcquisitionError("invalid-response", "Browserbase returned no valid owned session ID"); }
		const endpoint = new URL(string(created.connectUrl) ?? "");
		if (endpoint.protocol !== "wss:" || endpoint.username || endpoint.password || !endpoint.hostname.endsWith(".browserbase.com")) throw new AcquisitionError("invalid-response", "Browserbase returned an unsupported CDP endpoint");
		const reading = acquisitionBudget(Math.max(1, budget.remaining() - 5000), budget.signal);
		const policy = new AbortController(); const signal = AbortSignal.any([reading.signal, policy.signal]);
		cdp = new CdpConnection(endpoint.href, undefined, signal, Math.min(10_000, reading.remaining()));
		const connection = cdp;
		const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => connection.command<unknown>(method, params, sessionId, { signal, timeoutMs: reading.remaining() });
		const targets = record(await command("Target.getTargets"));
		const page = Array.isArray(targets?.targetInfos) ? targets.targetInfos.map(record).find(target => target?.type === "page") : undefined;
		const targetId = string(page?.targetId) ?? string(record(await command("Target.createTarget", { url: "about:blank" }))?.targetId);
		if (!targetId) throw new AcquisitionError("invalid-response", "Owned browser has no page");
		const attached = string(record(await command("Target.attachToTarget", { targetId, flatten: true }))?.sessionId);
		if (!attached) throw new AcquisitionError("invalid-response", "Owned browser page could not be attached");
		await command("Browser.setDownloadBehavior", { behavior: "deny" });
		await command("Page.enable", {}, attached); await command("Network.enable", {}, attached);
		const tree = record(record(await command("Page.getFrameTree", {}, attached))?.frameTree);
		const rootFrame = string(record(tree?.frame)?.id);
		if (!rootFrame) throw new AcquisitionError("invalid-response", "Owned browser has no main frame");
		let loaded: () => void = () => {}; let status: number | undefined;
		const load = new Promise<void>(resolve => { loaded = resolve; });
		connection.onEvent(event => {
			if (event.sessionId !== attached) return;
			if (event.method === "Page.loadEventFired") loaded();
			if (event.method === "Network.responseReceived" && event.params.frameId === rootFrame && event.params.type === "Document") {
				const value = record(event.params.response)?.status;
				if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) status = value;
			}
			if (event.method === "Fetch.requestPaused") {
				const requestId = string(event.params.requestId), target = string(record(event.params.request)?.url);
				void (async () => {
					if (!requestId || !target) throw new AcquisitionError("invalid-response", "Invalid browser request");
					const parsed = new URL(target);
					const localData = ["about:", "data:", "blob:"].includes(parsed.protocol);
					const destination = localData ? undefined : await withinSignal(classifyUrl(target), signal);
					if (destination?.privateOrLocal) {
						denied = new AcquisitionError("invalid-request", "Remote browser attempted a local/private URL");
						await command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, attached); policy.abort(); return;
					}
					await command("Fetch.continueRequest", { requestId }, attached);
				})().catch(() => { denied ??= new AcquisitionError("invalid-request", "Owned browser URL policy rejected a request"); policy.abort(); });
			}
		});
		await command("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, attached);
		const navigation = record(await command("Page.navigate", { url }, attached));
		if (navigation?.errorText) throw new AcquisitionError("unavailable", "Owned browser navigation failed");
		let partial = false;
		try { await withinSignal(load, AbortSignal.any([signal, AbortSignal.timeout(Math.min(15_000, reading.remaining()))])); }
		catch { if (denied) throw denied; signal.throwIfAborted(); partial = true; }
		const context = record(await command("Page.createIsolatedWorld", { frameId: rootFrame, worldName: "pi-public-read" }, attached))?.executionContextId;
		if (typeof context !== "number") throw new AcquisitionError("invalid-response", "Owned browser read context unavailable");
		const evaluation = record(await command("Runtime.evaluate", {
			contextId: context, returnByValue: true,
			expression: "(() => { const html = document.documentElement?.outerHTML ?? ''; return { html: html.slice(0, 500000), truncated: html.length > 500000, url: document.URL }; })()",
		}, attached));
		const captured = record(record(evaluation?.result)?.value);
		const html = string(captured?.html), finalUrl = string(captured?.url);
		if (!html || !finalUrl) throw new AcquisitionError("empty", "Owned browser returned no readable document");
		if ((await withinSignal(classifyUrl(finalUrl), signal)).privateOrLocal) throw new AcquisitionError("invalid-request", "Remote browser ended at a local/private URL");
		if (status !== undefined && status >= 400) throw new AcquisitionError(status === 404 || status === 410 ? "not-found" : status === 401 || status === 403 ? "authentication" : "unavailable", `Browserbase rendered target HTTP ${status}`);
		const parsed = await parseHtml(html, finalUrl, maxChars, acquisitionBudget(reading.remaining(), signal));
		if (denied) throw denied;
		signal.throwIfAborted();
		result = { backend: "browserbase-rendered", content: parsed.content, finalUrl, truncated: parsed.truncated || captured?.truncated === true,
			...(partial ? { quality: "partial" } : {}), session: { id, released: false },
			attempts: [{ backend: "browserbase-rendered", outcome: partial || parsed.truncated || captured?.truncated === true ? "partial" : "useful", elapsedMs: Math.round(performance.now() - started), ...(status === undefined ? {} : { status }) }] };
	} catch (error) { failure = denied ?? error; }
	finally {
		cdp?.close();
		if (id) {
			try {
				await requestBrowserbase(`/v1/sessions/${encodeURIComponent(id)}`, { status: "REQUEST_RELEASE" }, acquisitionBudget(5000), "browser", key, true);
				if (result?.session) result.session.released = true;
			} catch { cleanupFailed = true; }
		}
	}
	budget.signal.throwIfAborted();
	if (failure) throw failure instanceof AcquisitionError ? failure : new AcquisitionError("unavailable", `Browserbase rendered acquisition unavailable${cleanupFailed ? "; owned session release failed" : ""}`);
	if (!result) throw new AcquisitionError("empty", "Browserbase rendered acquisition returned no content");
	if (cleanupFailed) result.content += `\n\nWarning: owned Browserbase session ${id} could not be released; its bounded server timeout remains in effect.`;
	return result;
}
