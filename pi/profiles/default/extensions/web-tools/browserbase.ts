import { AcquisitionError, AllowanceBackoff, acquisitionBudget, readJsonResponse, retryAfterMilliseconds, withinSignal } from "./acquisition.ts";
import { invalidateProviderApiKey, providerApiKey } from "./credentials.ts";
import type { SearchResponse, SearchResult } from "./search.ts";

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
export async function searchBrowserbase(input: { query: string; count: number; filters?: boolean }, budget: Budget): Promise<SearchResponse> {
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
