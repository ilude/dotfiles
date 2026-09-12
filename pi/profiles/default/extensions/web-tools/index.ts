import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { truncateHead, type ModelRuntime, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../../lib/model-runtime.ts";
import { Type } from "typebox";
import { SCREEN_PROMPT, screenContent, type Reviewer } from "./screen.ts";
import { GatewayCircuit } from "./circuit.ts";
import { GatewayError, gatewayText, requestGateway, withinSignal } from "./gateway.ts";
import { gatewayCredentials, searchApiKey } from "./credentials.ts";
import { classifyUrl } from "./destinations.js";

const directory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEARCH_URL = "https://searxng.ilude.com/search";
const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

type SearchResult = { title: string; url: string; content?: string; publishedDate?: string; engine: string };
type SearchResponse = { results: SearchResult[]; warning?: string; backend: "searxng" | "serper" | "brave" };

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function rateLimitedFailures(value: unknown): boolean {
	return Array.isArray(value) && value.some((failure) => JSON.stringify(failure).toLowerCase().match(/rate.?limit|too many requests|quota/));
}

async function requestSearx(query: string, engines: string[] | undefined, signal?: AbortSignal): Promise<SearchResponse | undefined> {
	const url = new URL(process.env.SEARXNG_URL ?? DEFAULT_SEARCH_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	url.searchParams.set("pageno", "1");
	if (engines !== undefined) {
		const selected = engines.map((engine) => engine.trim()).filter(Boolean).join(",");
		if (selected) url.searchParams.set("engines", selected);
		else url.searchParams.delete("engines");
	}
	let response: Response;
	try { response = await fetch(url, { signal }); }
	catch (error) { signal?.throwIfAborted(); throw new Error(`SearXNG request failed at ${url.hostname}`, { cause: error }); }
	if (response.status === 429 && engines === undefined) return undefined;
	if (!response.ok) throw new Error(`SearXNG HTTP ${response.status} at ${url.hostname}`);
	const data = record(await response.json());
	if (!data || !Array.isArray(data.results)) throw new Error("SearXNG returned an invalid results response");
	const failures = Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : [];
	if (!data.results.length && engines === undefined && rateLimitedFailures(failures)) return undefined;
	const warning = failures.length ? `SearXNG engine failures (partial or unavailable results): ${bounded(JSON.stringify(failures), 2000)}` : undefined;
	if (!data.results.length && warning) throw new Error(`Search returned no results with backend failures. ${warning}`);
	return {
		backend: "searxng",
		warning,
		results: data.results.map((value): SearchResult => {
			const item = record(value) ?? {};
			return { title: text(item.title) ?? "(untitled)", url: text(item.url) ?? "", content: text(item.content), publishedDate: text(item.publishedDate), engine: text(item.engine) ?? "searxng" };
		}).filter((item) => item.url),
	};
}

async function requestSerper(query: string, count: number, key: string | undefined, signal?: AbortSignal): Promise<SearchResponse | undefined> {
	if (!key) return undefined;
	const response = await fetch(SERPER_SEARCH_URL, { method: "POST", headers: { "X-API-KEY": key, "Content-Type": "application/json" }, body: JSON.stringify({ q: query, num: count }), signal });
	if (response.status === 402 || response.status === 429) return undefined;
	if (!response.ok) {
		const errorBody = await response.text();
		if (response.status === 403 && /credit|quota|limit|exhaust/i.test(errorBody)) return undefined;
		throw new Error(`Serper HTTP ${response.status}`);
	}
	const data = record(await response.json());
	if (!data || !Array.isArray(data.organic)) throw new Error("Serper returned an invalid results response");
	return { backend: "serper", results: data.organic.map((value): SearchResult => {
		const item = record(value) ?? {};
		return { title: text(item.title) ?? "(untitled)", url: text(item.link) ?? "", content: text(item.snippet), publishedDate: text(item.date), engine: "serper" };
	}).filter((item) => item.url) };
}

async function requestBrave(query: string, count: number, key: string | undefined, signal?: AbortSignal): Promise<SearchResponse | undefined> {
	if (!key) return undefined;
	const url = new URL(BRAVE_SEARCH_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("count", String(count));
	const response = await fetch(url, { headers: { "Accept": "application/json", "X-Subscription-Token": key }, signal });
	if (!response.ok) throw new Error(`Brave Search HTTP ${response.status}`);
	const data = record(await response.json());
	const web = record(data?.web);
	if (!web || !Array.isArray(web.results)) throw new Error("Brave Search returned an invalid results response");
	return { backend: "brave", results: web.results.map((value): SearchResult => {
		const item = record(value) ?? {};
		return { title: text(item.title) ?? "(untitled)", url: text(item.url) ?? "", content: text(item.description), publishedDate: text(item.page_age) ?? text(item.age), engine: "brave" };
	}).filter((item) => item.url) };
}

export function bounded(text: string, maxChars = 50_000): string {
	const result = truncateHead(text.slice(0, maxChars), { maxBytes: 45_000, maxLines: 1800 });
	return result.content + (result.truncated || text.length > maxChars ? "\n\n[Truncated; request a more focused page or query for additional content.]" : "");
}

export function searchQuery(params: { query: string; exact_phrases?: string[]; exclude_terms?: string[]; site?: string }): string {
	const clean = (value: string) => value.trim().replace(/^"|"$/g, "").replace(/\s+/g, " ");
	const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;
	const parts = [clean(params.query)];
	for (const phrase of params.exact_phrases ?? []) if (clean(phrase)) parts.push(quote(clean(phrase)));
	for (const term of params.exclude_terms ?? []) if (clean(term)) parts.push(`-${/\s/.test(clean(term)) ? quote(clean(term)) : clean(term)}`);
	if (params.site?.trim()) {
		const site = params.site.trim().replace(/^site:/i, "").trim();
		const parsed = new URL(/^[a-z]+:\/\//i.test(site) ? site : `https://${site}`);
		parts.push(`site:${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`);
	}
	return parts.filter(Boolean).join(" ");
}

export default function webTools(pi: ExtensionAPI) {
	const circuit = new GatewayCircuit();
	// Reuse only a successfully initialized runtime. Reload creates a fresh instance.
	let runtime: ModelRuntime | undefined;
	const review: Reviewer = async (text, signal) => {
		if (!runtime) {
			runtime = await createProfileModelRuntime(signal);
		}
		const model = runtime.getModel("openai-codex", "gpt-5.6-luna");
		if (!model) throw new Error("Luna unavailable");
		const reply = await runtime.completeSimple(model, {
			systemPrompt: SCREEN_PROMPT,
			messages: [{ role: "user", content: text, timestamp: Date.now() }],
		}, { reasoning: "low", maxTokens: 1000, signal });
		if (reply.stopReason === "error" || reply.stopReason === "aborted") throw new Error("Luna review failed");
		return { text: reply.content.filter((part) => part.type === "text").map((part) => part.text).join(""), usage: reply.usage };
	};
	const finish = async (text: string, signal?: AbortSignal, header = "") => {
		const result = await screenContent(text, review, signal);
		return { content: [{ type: "text" as const, text: header + result.text }], details: { screening: result.status }, usage: result.usage };
	};
	const fetchHeader = (url: string) => `webfetch: ${url}\n`;
	const localContent = (text: string) => text.replace(/^Source: [^\r\n]+\r?\n(?:\r?\n)?/, "");

	pi.registerTool({
		name: "web_search", label: "Web Search",
		description: "Search SearXNG for titles, URLs, snippets, and dates, with Serper then Brave Search fallback when general SearXNG search is rate limited. Uses server engine defaults; explicit engines remain SearXNG-only. Backend failures are reported. Results receive best-effort Luna prompt-injection screening without blocking or rewriting content. Output is limited to 45KB/1800 lines.",
		promptSnippet: "Search the web for current information and documentation",
		parameters: Type.Object({
			query: Type.String({ minLength: 1, description: "Base search query" }),
			exact_phrases: Type.Optional(Type.Array(Type.String())),
			exclude_terms: Type.Optional(Type.Array(Type.String())),
			site: Type.Optional(Type.String({ description: "Optional domain or site URL" })),
			num_results: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Default: 5" })),
			engines: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "SearXNG engine names, e.g. google, brave, github. Defaults to the endpoint engines setting or server defaults. Empty array uses server defaults." })),
		}),
		async execute(_id, params, signal) {
			const query = searchQuery(params);
			if (!query) throw new Error("Search query must not be empty");
			const count = params.num_results ?? 5;
			const timeout = AbortSignal.timeout(10_000);
			const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
			let search = await requestSearx(query, params.engines, requestSignal);
			if (!search) search = await requestSerper(query, count, await searchApiKey(pi.exec.bind(pi), "SERPER_API_KEY", requestSignal), requestSignal);
			if (!search) search = await requestBrave(query, count, await searchApiKey(pi.exec.bind(pi), "BRAVE_SEARCH_API_KEY", requestSignal), requestSignal);
			if (!search) throw new Error("SearXNG was rate limited and no configured fallback search provider was available");
			const results = search.results.slice(0, count);
			const resultText = results.map((item, index) => [
				`--- Result ${index + 1} ---`, `Title: ${item.title}`, `URL: ${item.url}`,
				item.publishedDate ? `Date: ${item.publishedDate}` : "",
				`Engine: ${item.engine}`, `Snippet: ${item.content ?? "(no snippet)"}`,
			].filter(Boolean).join("\n")).join("\n\n");
			const header = `websearch: ${query}\n`;
			if (!results.length) return { content: [{ type: "text" as const, text: `${header}No results found.` }], details: { screening: "no-results", backend: search.backend } };
			const finished = await finish(bounded([search.warning, resultText].filter(Boolean).join("\n\n")), signal, header);
			return { ...finished, details: { ...finished.details, backend: search.backend } };
		},
	});
	pi.registerTool({
		name: "web_fetch", label: "Web Fetch",
		description: "Fetch readable HTTP(S) content through the optional adaptive gateway, or locally with public Jina fallback. Local/private URLs stay local. Auto mode recovers locally on gateway outages; explicit backends stay strict. Luna blocks content it flags as prompt injection. Default 8000 chars; max 50000 chars and 45KB/1800 lines.",
		promptSnippet: "Fetch a web page as readable text",
		parameters: Type.Object({
			url: Type.String({ description: "HTTP or HTTPS URL" }),
			max_chars: Type.Optional(Type.Integer({ minimum: 1, maximum: 50_000 })),
			backend: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("direct"), Type.Literal("trawl"), Type.Literal("jina")], { description: "Default auto; explicit backend selection never substitutes another backend." })),
		}),
		async execute(_id, params, signal) {
			const deadline = performance.now() + 60_000;
			const acquisition = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]);
			const backend = params.backend ?? "auto";
			let recovery: string | undefined;
			const destination = await withinSignal(classifyUrl(params.url), acquisition);
			acquisition.throwIfAborted();
			if (destination.privateOrLocal) {
				if (backend === "trawl" || backend === "jina") throw new Error("Remote backends are disabled for local/private URLs");
			} else {
				let credentials;
				try { credentials = await gatewayCredentials(pi.exec.bind(pi), acquisition); }
				catch (error) {
					if (backend === "trawl" || backend === "jina") throw new Error("Gateway credential unavailable", { cause: error });
					recovery = "credential-unavailable";
				}
				if (credentials) {
					const { endpoint, token } = credentials;
					circuit.configure(endpoint, token);
					if (backend !== "auto" || circuit.acquire()) {
						try {
							const reply = await requestGateway(endpoint, token, { url: params.url, max_chars: params.max_chars ?? 8000, backend }, acquisition);
							circuit.reachable();
							const result = await finish(bounded(gatewayText(reply)), signal, fetchHeader(params.url));
							return { ...result, details: { ...result.details, backend: reply.backend, quality: reply.quality, finalUrl: reply.final_url, recovery } };
						} catch (error) {
							if (signal?.aborted) { circuit.cancelled(); signal.throwIfAborted(); }
							if (!(error instanceof GatewayError) || error.kind !== "availability") { circuit.reachable(); throw error; }
							circuit.unavailable();
							if (backend !== "auto") throw error;
							recovery = "gateway-unavailable";
						}
					} else recovery = "circuit-open";
				}
			}
			acquisition.throwIfAborted();
			const remaining = Math.max(1, Math.floor(deadline - performance.now()));
			const result = await pi.exec(process.execPath, [join(directory, "fetch.js"), params.url, "--max-chars", String(params.max_chars ?? 8000), "--backend", backend, "--budget-ms", String(Math.max(1, remaining - 250))], { timeout: remaining, signal });
			signal?.throwIfAborted();
			if (result.killed || result.code !== 0) throw new Error(result.killed ? "Web fetch timed out" : result.stderr.trim() || `Web fetch failed (${result.code})`);
			if (!result.stdout.trim()) throw new Error("No content extracted");
			const finished = await finish(bounded(localContent(result.stdout.trim())), signal, fetchHeader(params.url));
			return { ...finished, details: { ...finished.details, backend: "local", quality: undefined, finalUrl: null, recovery } };
		},
	});
}
