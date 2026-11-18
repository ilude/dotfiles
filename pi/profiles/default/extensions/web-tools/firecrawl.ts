import { AcquisitionError, AllowanceBackoff, acquisitionBudget, readJsonResponse, retryAfterMilliseconds, withinSignal } from "./acquisition.ts";
import { invalidateProviderApiKey, providerApiKey } from "./credentials.ts";
import type { Extraction } from "./structured.ts";
import type { FetchReceipt } from "./fetch-result.ts";
import type { SearchResponse, SearchResult, SearchKind } from "./search.ts";

type Budget = ReturnType<typeof acquisitionBudget>;
const api = "https://api.firecrawl.dev/v2";
const backoff = new AllowanceBackoff<"credits" | "/scrape" | "/search" | "json">();
function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
/** API requests only; no Interact, actions, crawler, profile, proxy retries or account changes. */
export async function requestFirecrawl(path: "/scrape" | "/search", input: Record<string, unknown>, budget: Budget): Promise<Record<string, unknown>> {
	const credentialSignal = budget.attempt(10_000);
	let key: string | undefined;
	try { key = await withinSignal(providerApiKey("FIRECRAWL_API_KEY", credentialSignal), credentialSignal); }
	catch { budget.signal.throwIfAborted(); throw new AcquisitionError("credentials", "Firecrawl credential unavailable"); }
	budget.signal.throwIfAborted();
	if (!key) throw new AcquisitionError("credentials", "Firecrawl credential unavailable");
	const capability = path === "/scrape" && Array.isArray(input.formats) && input.formats.some(format => record(format)?.type === "json") ? "json" : path;
	backoff.check("credits", key); backoff.check(capability, key);
	const milliseconds = Math.min(45_000, budget.remaining() - 250);
	if (milliseconds < 1000) throw new AcquisitionError("timeout", "Insufficient acquisition time for Firecrawl's minimum request timeout");
	const signal = budget.attempt(milliseconds + 250);
	const body = path === "/scrape" ? { ...input, timeout: milliseconds } : input;
	try {
		const response = await withinSignal(fetch(`${api}${path}`, {
			method: "POST", redirect: "error", signal,
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
		}), signal);
		if (!response.ok) {
			if (response.status === 401) invalidateProviderApiKey("FIRECRAWL_API_KEY", key);
			void response.body?.cancel().catch(() => {});
			const kind = response.status === 402 ? "quota" : response.status === 429 ? "rate-limit" : response.status === 401 ? "credentials"
				: response.status === 403 ? "unsupported" : response.status === 400 || response.status === 422 ? "invalid-request" : "unavailable";
			throw new AcquisitionError(kind, `Firecrawl API HTTP ${response.status}`, retryAfterMilliseconds(response));
		}
		const data = record(await readJsonResponse(response, signal, "Firecrawl"));
		if (!data || data.success !== true) throw new AcquisitionError(data?.code === "insufficient_credits" ? "quota" : data?.code === "THIRD_PARTY_DATA_TERMS_REQUIRED" ? "unsupported" : "unavailable", "Firecrawl reported unsuccessful acquisition", retryAfterMilliseconds(response));
		return data;
	} catch (error) {
		budget.signal.throwIfAborted();
		const failure = error instanceof AcquisitionError ? error : new AcquisitionError(signal.aborted ? "timeout" : "transport", "Firecrawl request unavailable");
		backoff.note(failure.kind === "quota" ? "credits" : capability, key, failure); throw failure;
	}
}

export async function searchFirecrawl(input: { query: string; count: number; kind?: SearchKind }, budget: Budget): Promise<SearchResponse> {
	const kind = input.kind ?? "web";
	const response = await requestFirecrawl("/search", { query: input.query, limit: input.count, sources: [kind], highlights: false, domainTools: false }, budget);
	const data = record(response.data);
	const hits = data?.[kind];
	if (!Array.isArray(hits)) throw new AcquisitionError("invalid-response", `Firecrawl returned invalid ${kind} results`);
	return { backend: "firecrawl", ...(typeof response.warning === "string" ? { warning: response.warning.slice(0, 2000) } : {}), results: hits.map((value): SearchResult => {
		const item = record(value) ?? {};
		return { title: typeof item.title === "string" ? item.title : "(untitled)", url: typeof item.url === "string" ? item.url : "", engine: "firecrawl",
			...(typeof (kind === "news" ? item.snippet : item.description) === "string" ? { content: String(kind === "news" ? item.snippet : item.description) } : {}),
			...(kind === "images" && typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}),
			...(typeof item.imageWidth === "number" && Number.isSafeInteger(item.imageWidth) && item.imageWidth > 0 ? { width: item.imageWidth } : {}),
			...(typeof item.imageHeight === "number" && Number.isSafeInteger(item.imageHeight) && item.imageHeight > 0 ? { height: item.imageHeight } : {}),
			...(kind === "news" && typeof item.date === "string" ? { publishedDate: item.date } : {}) };
	}).filter(item => item.url || item.imageUrl) };
}

export async function fetchFirecrawl(url: string, maxChars: number, budget: Budget, extraction?: Extraction): Promise<FetchReceipt> {
	const started = performance.now();
	const response = await requestFirecrawl("/scrape", {
		url, formats: extraction ? [{ type: "json", schema: extraction.schema }] : ["markdown"], onlyMainContent: true, proxy: "basic", parsers: [],
		// Preserve the provider's default accepted cache age. Do not request
		// LLM cleanup, screenshots, PDF/image OCR or force a fresh scrape.
	}, budget);
	const data = record(response.data);
	if (!data) throw new AcquisitionError("invalid-response", "Firecrawl returned no page data");
	const metadata = record(data.metadata);
	const reportedStatus = metadata?.statusCode;
	const status = typeof reportedStatus === "number" && Number.isInteger(reportedStatus) && reportedStatus >= 100 && reportedStatus <= 599 ? reportedStatus : undefined;
	if (typeof status === "number" && status >= 400) {
		const kind = status === 404 || status === 410 ? "not-found" : status === 401 || status === 403 ? "authentication" : status === 429 ? "rate-limit" : "unavailable";
		throw new AcquisitionError(kind, `Firecrawl target HTTP ${status}`);
	}
	if (extraction) {
		const structured = extraction.result(data.json, typeof data.warning === "string" ? data.warning : typeof response.warning === "string" ? response.warning : undefined);
		return { backend: "firecrawl", finalUrl: null, ...structured, attempts: [{ backend: "firecrawl", outcome: structured.truncated ? "partial" : "useful", elapsedMs: Math.round(performance.now() - started), ...(status === undefined ? {} : { status }) }] };
	}
	if (typeof data.markdown !== "string" || !data.markdown.trim()) throw new AcquisitionError("empty", "Firecrawl returned no readable page content");
	const title = typeof metadata?.title === "string" ? metadata.title.slice(0, 500) : "";
	const warning = typeof response.warning === "string" ? response.warning : typeof data.warning === "string" ? data.warning : "";
	const page = [title ? `# ${title}` : "", data.markdown, warning ? `Provider warning: ${warning.slice(0, 2000)}` : ""].filter(Boolean).join("\n\n");
	const truncated = page.length > maxChars || data.truncated === true;
	const cache: NonNullable<FetchReceipt["cache"]> = {};
	if (metadata?.cacheState === "hit" || metadata?.cacheState === "miss") cache.state = metadata.cacheState;
	if (typeof metadata?.cachedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(metadata.cachedAt) && Number.isFinite(Date.parse(metadata.cachedAt))) cache.cachedAt = new Date(metadata.cachedAt).toISOString();
	return {
		backend: "firecrawl", content: page.slice(0, maxChars) + (truncated ? "\n\n[Truncated by acquisition]" : ""),
		// sourceURL is the requested source, not a verified final redirect URL.
		finalUrl: null, truncated,
		attempts: [{ backend: "firecrawl", outcome: truncated ? "partial" : "useful", elapsedMs: Math.round(performance.now() - started), ...(typeof status === "number" ? { status } : {}) }],
		...(cache.state || cache.cachedAt ? { cache } : {}),
	};
}
