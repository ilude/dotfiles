import { AcquisitionError as SearchAcquisitionError, acquisitionBudget, retryAfterMilliseconds, withinSignal } from "./acquisition.ts";
export { AcquisitionError as SearchAcquisitionError } from "./acquisition.ts";
import { searchApiKey } from "./credentials.ts";
import { searchBrowserbase } from "./browserbase.ts";

type ExistingSearchProvider = "searxng" | "serper" | "brave";
export type SearchProvider = ExistingSearchProvider | "browserbase";
export type SearchSelection = "auto" | SearchProvider;
export type SearchKind = "web" | "images" | "news";
export type SearchResult = { title: string; url: string; content?: string; publishedDate?: string; engine: string; imageUrl?: string; thumbnailUrl?: string; source?: string; width?: number; height?: number };
export type SearchResponse = { results: SearchResult[]; warning?: string; backend: SearchProvider; recovery?: string };
type FailureKind = "transport" | "timeout" | "rate-limit" | "quota" | "credentials" | "unavailable" | "challenge" | "invalid-response" | "invalid-request";
type SearchRequest = { query: string; count: number; provider?: SearchSelection; engines?: string[]; filters?: boolean; kind?: SearchKind };
type Exec = Parameters<typeof searchApiKey>[0];
const labels = { searxng: "SearXNG", serper: "Serper", brave: "Brave Search" };
const defaultSearx = "https://searxng.ilude.com/search";
const serperUrl = "https://google.serper.dev/search";
const braveUrl = "https://api.search.brave.com/res/v1/web/search";
const providers: ExistingSearchProvider[] = ["searxng", "serper", "brave"];

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function httpError(provider: ExistingSearchProvider, response: Response, body: string): SearchAcquisitionError {
	const status = response.status;
	const kind: FailureKind = status === 429 ? "rate-limit" : status === 402 || (status === 403 && /credit|quota|limit|exhaust/i.test(body)) ? "quota" : status === 408 || status === 504 ? "timeout"
		: status === 400 || status === 422 ? "invalid-request" : "unavailable";
	return new SearchAcquisitionError(kind, `${labels[provider]} HTTP ${status}`, retryAfterMilliseconds(response));
}

async function request(provider: ExistingSearchProvider, input: SearchRequest, key: string | undefined, signal: AbortSignal): Promise<SearchResponse> {
	let url: URL;
	const options: RequestInit = { signal };
	if (provider === "searxng") {
		try { url = new URL(process.env.SEARXNG_URL ?? defaultSearx); }
		catch { throw new SearchAcquisitionError("unavailable", "Invalid SearXNG endpoint"); }
		url.searchParams.set("q", input.query); url.searchParams.set("format", "json"); url.searchParams.set("pageno", "1");
		url.searchParams.set("categories", input.kind === "images" ? "images" : input.kind === "news" ? "news" : "general");
		if (input.engines !== undefined) {
			const engines = input.engines.map(value => value.trim()).filter(Boolean).join(",");
			if (engines) url.searchParams.set("engines", engines); else url.searchParams.delete("engines");
		}
	} else if (provider === "serper") {
		url = new URL(serperUrl); options.method = "POST";
		options.headers = { "X-API-KEY": key ?? "", "Content-Type": "application/json" };
		options.body = JSON.stringify({ q: input.query, num: input.count });
	} else {
		url = new URL(braveUrl); url.searchParams.set("q", input.query); url.searchParams.set("count", String(input.count));
		options.headers = { Accept: "application/json", "X-Subscription-Token": key ?? "" };
	}
	let response: Response;
	try { response = await withinSignal(fetch(provider === "serper" ? url.href : url, options), signal); }
	catch (error) {
		signal.throwIfAborted();
		throw new SearchAcquisitionError("transport", `${labels[provider]} transport unavailable`, undefined);
	}
	if (!response.ok) {
		const body = response.status === 403 ? await withinSignal(response.text(), signal) : "";
		if (response.status !== 403) void response.body?.cancel().catch(() => {});
		throw httpError(provider, response, body);
	}
	let data: Record<string, unknown> | undefined;
	try { data = record(await withinSignal(response.json(), signal)); }
	catch { signal.throwIfAborted(); throw new SearchAcquisitionError("invalid-response", `${labels[provider]} returned invalid JSON`); }
	const raw = provider === "searxng" ? data?.results : provider === "serper" ? data?.organic : record(data?.web)?.results;
	if (!Array.isArray(raw)) throw new SearchAcquisitionError("invalid-response", `${labels[provider]} returned an invalid results response`);
	const failures = provider === "searxng" && Array.isArray(data?.unresponsive_engines) ? data.unresponsive_engines : [];
	if (!raw.length && failures.length) {
		const reasons = JSON.stringify(failures);
		const kind = /rate.?limit|too many requests|quota/i.test(reasons) ? "rate-limit" : /captcha|challenge/i.test(reasons) ? "challenge" : "unavailable";
		throw new SearchAcquisitionError(kind, kind === "challenge" ? "SearXNG engine challenge (CAPTCHA)" : `SearXNG engine ${kind}`);
	}
	return {
		backend: provider,
		...(failures.length ? { warning: `SearXNG engine failures (partial or unavailable results): ${JSON.stringify(failures).slice(0, 2000)}` } : {}),
		results: raw.map((value): SearchResult => {
			const item = record(value) ?? {};
			return {
				title: text(item.title) ?? "(untitled)", url: text(provider === "serper" ? item.link : item.url) ?? "",
				content: text(provider === "serper" ? item.snippet : provider === "brave" ? item.description : item.content),
				publishedDate: text(provider === "serper" ? item.date : provider === "brave" ? item.page_age ?? item.age : item.publishedDate),
				engine: provider === "searxng" ? text(item.engine) ?? provider : provider,
				...(input.kind === "images" ? { imageUrl: text(item.img_src), thumbnailUrl: text(item.thumbnail_src) } : {}),
				...(input.kind === "news" && text(item.source) ? { source: text(item.source) } : {}),
			};
		}).filter(item => item.url || item.imageUrl),
	};
}

/** Existing search providers only. Keys stay lazy; each failed attempt leaves usable fallback time. */
export function createSearch(exec: Exec) {
	const backoff = new Map<SearchProvider, { until: number; identity: string; error: SearchAcquisitionError }>();
	return async (input: SearchRequest, parent?: AbortSignal): Promise<SearchResponse> => {
		parent?.throwIfAborted();
		const selected = input.provider ?? "auto";
		if (input.engines !== undefined && selected !== "auto" && selected !== "searxng") throw new SearchAcquisitionError("invalid-request", "engines can only be used with SearXNG");
		const budget = acquisitionBudget(20_000, parent);
		if (selected === "browserbase") return searchBrowserbase(input, budget);
		const strict = selected !== "auto" || input.engines !== undefined;
		const order: ExistingSearchProvider[] = selected !== "auto" ? [selected] : input.engines !== undefined ? ["searxng"] : providers;
		const failures: string[] = [];
		for (const provider of order) {
			budget.signal.throwIfAborted();
			if (input.kind && input.kind !== "web" && provider !== "searxng") {
				if (strict) throw new SearchAcquisitionError("unsupported", `${labels[provider]} has no enabled ${input.kind} capability`);
				failures.push(`${provider}:unsupported`); continue;
			}
			let key: string | undefined;
			if (provider !== "searxng") {
				const credentialSignal = budget.attempt(2000);
				try { key = await withinSignal(searchApiKey(exec, provider === "serper" ? "SERPER_API_KEY" : "BRAVE_SEARCH_API_KEY", credentialSignal), credentialSignal); }
				catch { budget.signal.throwIfAborted(); }
				if (!key) {
					const error = new SearchAcquisitionError("credentials", `${labels[provider]} credential unavailable`);
					if (strict) throw error;
					failures.push(`${provider}:credentials`); continue;
				}
			}
			const identity = provider === "searxng" ? process.env.SEARXNG_URL ?? defaultSearx : key ?? "";
			const blocked = backoff.get(provider);
			if (blocked && blocked.identity === identity && blocked.until > Date.now()) {
				if (strict) throw blocked.error;
				failures.push(`${provider}:${blocked.error.kind}`); continue;
			}
			const attempt = budget.attempt(6000);
			try {
				const result = await request(provider, input, key, attempt);
				backoff.delete(provider);
				return { ...result, ...(failures.length ? { recovery: failures.join("; ") } : {}) };
			} catch (cause) {
				budget.signal.throwIfAborted();
				const error = cause instanceof SearchAcquisitionError ? cause
					: new SearchAcquisitionError(attempt.aborted || (cause instanceof Error && cause.name === "TimeoutError") ? "timeout" : "transport", `${labels[provider]} request failed`);
				// Engine-specific failures do not disable unrelated SearXNG engines.
				if ((error.kind === "rate-limit" || error.kind === "quota") && !error.message.startsWith("SearXNG engine")) {
					backoff.set(provider, { identity, until: Date.now() + (error.retryAfterMs ?? 30_000), error });
				}
				if (strict || !error.eligible) throw error;
				failures.push(`${provider}:${error.kind}${error.kind === "challenge" ? " (CAPTCHA)" : ""}`);
			}
		}
		throw new SearchAcquisitionError("unavailable", `No search provider available: ${failures.join("; ")}`);
	};
}
