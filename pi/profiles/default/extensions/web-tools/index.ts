import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, ModelRuntime, truncateHead, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { SCREEN_PROMPT, screenContent, type Reviewer } from "./screen.ts";

const directory = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEARCH_URL = "https://searxng.ilude.com/search";

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
	// Reuse only a successfully initialized runtime. Reload creates a fresh instance.
	let runtime: ModelRuntime | undefined;
	const review: Reviewer = async (text, signal) => {
		if (!runtime) {
			const profile = getAgentDir();
			runtime = await ModelRuntime.create({ authPath: join(profile, "auth.json"), modelsPath: join(profile, "models.json"), modelsStorePath: join(profile, "models-store.json"), allowModelNetwork: false, signal });
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

	pi.registerTool({
		name: "web_search", label: "Web Search",
		description: "Search SearXNG for titles, URLs, snippets, and dates. Uses server engine defaults; engines can select alternatives. Backend failures are reported. Results receive best-effort Luna prompt-injection screening without blocking or rewriting content. Output is limited to 45KB/1800 lines.",
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
			const url = new URL(process.env.SEARXNG_URL ?? DEFAULT_SEARCH_URL);
			url.searchParams.set("q", query);
			url.searchParams.set("format", "json");
			url.searchParams.set("pageno", "1");
			if (params.engines !== undefined) {
				const engines = params.engines.map((engine) => engine.trim()).filter(Boolean).join(",");
				if (engines) url.searchParams.set("engines", engines);
				else url.searchParams.delete("engines");
			}
			const timeout = AbortSignal.timeout(10_000);
			let response: Response;
			try { response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout }); }
			catch (error) { signal?.throwIfAborted(); throw new Error(`SearXNG request failed at ${url.hostname}`, { cause: error }); }
			if (!response.ok) throw new Error(`SearXNG HTTP ${response.status} at ${url.hostname}`);
			const data = await response.json();
			if (!Array.isArray(data.results)) throw new Error("SearXNG returned an invalid results response");
			const results = data.results.slice(0, params.num_results ?? 5);
			const failures = Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : [];
			const warning = failures.length ? `SearXNG engine failures (partial or unavailable results): ${bounded(JSON.stringify(failures), 2000)}` : "";
			if (!results.length && warning) throw new Error(`Search returned no results with backend failures. ${warning}`);
			const text = results.map((item: any, index: number) => [
				`--- Result ${index + 1} ---`, `Title: ${item.title}`, `URL: ${item.url}`,
				item.publishedDate ? `Date: ${item.publishedDate}` : "",
				item.engine ? `Engine: ${item.engine}` : "", `Snippet: ${item.content ?? "(no snippet)"}`,
			].filter(Boolean).join("\n")).join("\n\n");
			const header = `web_search(${JSON.stringify(query)})\n`;
			if (!results.length) return { content: [{ type: "text" as const, text: `${header}No results found.` }], details: { screening: "no-results" } };
			return finish(bounded([warning, text].filter(Boolean).join("\n\n")), signal, header);
		},
	});
	pi.registerTool({
		name: "web_fetch", label: "Web Fetch",
		description: "Fetch HTTP(S) content as readable Markdown or plain text. Uses local extraction with automatic Jina Reader fallback for public URLs. Local/private URLs are supported directly. Best-effort Luna injection screening annotates but never blocks content. Default 8000 chars; max 50000 chars and 45KB/1800 lines.",
		promptSnippet: "Fetch a web page as readable text",
		parameters: Type.Object({
			url: Type.String({ description: "HTTP or HTTPS URL" }),
			max_chars: Type.Optional(Type.Integer({ minimum: 1, maximum: 50_000 })),
		}),
		async execute(_id, params, signal) {
			const result = await pi.exec(process.execPath, [join(directory, "fetch.js"), params.url, "--max-chars", String(params.max_chars ?? 8000)], { timeout: 30_000, signal });
			signal?.throwIfAborted();
			if (result.killed || result.code !== 0) throw new Error(result.killed ? "Web fetch timed out" : result.stderr.trim() || `Web fetch failed (${result.code})`);
			if (!result.stdout.trim()) throw new Error("No content extracted");
			return finish(bounded(result.stdout.trim()), signal, `Requested URL: ${params.url}\n\n`);
		},
	});
}
