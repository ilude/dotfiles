import { AcquisitionError, AllowanceBackoff, acquisitionBudget, readJsonResponse, retryAfterMilliseconds, withinSignal } from "./acquisition.ts";
import { invalidateProviderApiKey, providerApiKey } from "./credentials.ts";
import type { SearchResponse, SearchResult } from "./search.ts";
import type { FetchReceipt } from "./fetch-result.ts";
import { classifyUrl } from "./destinations.js";
import { parseHtml } from "./local-parser.ts";

export type Budget = ReturnType<typeof acquisitionBudget>;
type Meter = "search" | "raw-fetch" | "extract" | "browser";
const backoff = new AllowanceBackoff<Meter>();
const api = "https://api.browserbase.com";
function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export async function requestBrowserbase(path: string, body: Record<string, unknown>, budget: Budget, meter: Meter): Promise<Record<string, unknown>> {
	const credentialSignal = budget.attempt(10_000);
	let key: string | undefined;
	try { key = await withinSignal(providerApiKey("BROWSERBASE_API_KEY", credentialSignal), credentialSignal); }
	catch { budget.signal.throwIfAborted(); throw new AcquisitionError("credentials", "Browserbase credential unavailable"); }
	budget.signal.throwIfAborted();
	if (!key) throw new AcquisitionError("credentials", "Browserbase credential unavailable");
	backoff.check(meter, key);
	const signal = budget.attempt(45_000);
	try {
		const response = await withinSignal(fetch(api + path, {
			method: "POST", redirect: "error", signal,
			headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(body),
		}), signal);
		if (!response.ok) {
			void response.body?.cancel().catch(() => {});
			if (response.status === 401) invalidateProviderApiKey("BROWSERBASE_API_KEY", key);
			const kind = response.status === 402 ? "quota" : response.status === 429 ? "rate-limit" : response.status === 403 ? "unsupported"
				: response.status === 401 ? "credentials" : response.status === 400 ? "invalid-request" : response.status === 504 ? "timeout" : "unavailable";
			throw new AcquisitionError(kind, `Browserbase API HTTP ${response.status}`, retryAfterMilliseconds(response));
		}
		if (response.status === 204) return {};
		const data = record(await readJsonResponse(response, signal, "Browserbase"));
		if (!data) throw new AcquisitionError("invalid-response", "Browserbase returned an invalid response");
		return data;
	} catch (cause) {
		budget.signal.throwIfAborted();
		const error = cause instanceof AcquisitionError ? cause : new AcquisitionError(signal.aborted ? "timeout" : "transport", "Browserbase request unavailable");
		backoff.note(meter, key, error); throw error;
	}
}
export async function fetchBrowserbase(url: string, maxChars: number, budget: Budget): Promise<FetchReceipt> {
	const started = performance.now(); let current = url;
	for (let redirects = 0; redirects <= 5; redirects++) {
		const destination = await withinSignal(classifyUrl(current), budget.signal);
		if (destination.privateOrLocal) throw new AcquisitionError("invalid-request", "Remote backends are disabled for local/private URLs");
		const data = await requestBrowserbase("/v1/fetch", { url: current, format: "raw", allowRedirects: false, allowInsecureSsl: false, proxies: false }, budget, "raw-fetch");
		const status = data.statusCode;
		if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) throw new AcquisitionError("invalid-response", "Browserbase returned no valid target status");
		if ([301, 302, 303, 307, 308].includes(status)) {
			const headers = record(data.headers);
			const location = headers && Object.entries(headers).find(([name]) => name.toLowerCase() === "location")?.[1];
			if (typeof location !== "string") throw new AcquisitionError("invalid-response", "Browserbase returned a redirect without Location");
			current = new URL(location, current).href; continue;
		}
		if (status >= 400) throw new AcquisitionError(status === 404 || status === 410 ? "not-found" : status === 401 || status === 403 ? "authentication" : "unavailable", `Browserbase target HTTP ${status}`);
		if (data.encoding === "base64" || typeof data.content !== "string" || /pdf|octet-stream|^image\//i.test(String(data.contentType ?? ""))) throw new AcquisitionError("unsupported", "Browserbase static response is not supported readable text");
		if (!data.content.trim()) throw new AcquisitionError("empty", "Browserbase returned empty content");
		const html = /html/i.test(String(data.contentType ?? "")) || /^\s*</.test(data.content);
		const parsed = html ? await parseHtml(data.content, current, maxChars, budget) : undefined;
		const truncated = parsed?.truncated ?? data.content.length > maxChars;
		return { backend: "browserbase-static", content: parsed?.content ?? data.content.slice(0, maxChars), finalUrl: current, truncated,
			attempts: [{ backend: "browserbase-static", outcome: truncated ? "partial" : "useful", status, elapsedMs: Math.round(performance.now() - started) }] };
	}
	throw new AcquisitionError("invalid-response", "Browserbase exceeded the redirect limit");
}

export async function searchBrowserbase(input: { query: string; count: number; filters?: boolean; kind?: "web" | "images" | "news" }, budget: Budget): Promise<SearchResponse> {
	if (input.kind && input.kind !== "web") throw new AcquisitionError("unsupported", "Browserbase has no documented image/news search mode");
	if (input.query.length > 200 || input.filters) throw new AcquisitionError("unsupported", "Browserbase Search does not document the requested query length or structured filters");
	const data = await requestBrowserbase("/v1/search", { query: input.query, numResults: input.count, provider: "parallel", mode: "fast", excerpts: true }, budget, "search");
	if (!Array.isArray(data.results) || (data.provider !== undefined && data.provider !== "parallel") || (data.mode !== undefined && data.mode !== "fast")) throw new AcquisitionError("invalid-response", "Browserbase returned an unrequested search mode or invalid results");
	const engine = data.provider === "parallel" ? `browserbase:parallel${data.mode === "fast" ? ":fast" : ""}` : "browserbase";
	return { backend: "browserbase", results: data.results.map((value): SearchResult => {
		const item = record(value) ?? {};
		const excerpts = Array.isArray(item.excerpts) ? item.excerpts.filter((value): value is string => typeof value === "string").join("\n") : undefined;
		return { title: typeof item.title === "string" ? item.title : "(untitled)", url: typeof item.url === "string" ? item.url : "", engine,
			...(excerpts ? { content: excerpts } : {}), ...(typeof item.publishedDate === "string" ? { publishedDate: item.publishedDate } : {}) };
	}).filter(item => item.url) };
}
