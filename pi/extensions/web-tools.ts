/**
 * Web Tools Extension
 *
 * Registers two tools:
 *   - web_search: queries the local SearXNG instance
 *   - web_fetch:  fetches a URL and returns clean markdown
 *
 * Also loads ~/.env at init so keys are available without shell profile changes.
 * Shell environment takes precedence — existing vars are never overwritten.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SEARXNG_URL = "http://192.168.16.241:8888/search";
const WEB_FETCH_SCRIPT = path.join(os.homedir(), ".dotfiles", "pi", "extensions", "web-fetch", "fetch.js");

// ── .env parsing ────────────────────────────────────────────────────────────

export interface EnvEntry { key: string; value: string }

/** Parse KEY=VALUE content. Skips comments, blank lines, lines without '='. Strips surrounding quotes. */
export function parseDotEnv(content: string): EnvEntry[] {
	const entries: EnvEntry[] = [];
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
		if (key) entries.push({ key, value });
	}
	return entries;
}

function loadDotEnv(): void {
	const envPath = path.join(os.homedir(), ".env");
	try {
		const content = fs.readFileSync(envPath, "utf-8");
		for (const { key, value } of parseDotEnv(content)) {
			if (!(key in process.env)) {
				process.env[key] = value;
			}
		}
	} catch {
		// No ~/.env — silently skip
	}
}

export interface SearchResult {
	title: string;
	url: string;
	content?: string;
	publishedDate?: string;
	engine?: string;
}

/** Format a single search result for LLM consumption. */
export function formatSearchResult(r: SearchResult, index: number): string {
	const lines = [
		`--- Result ${index} ---`,
		`Title: ${r.title}`,
		`URL: ${r.url}`,
	];
	if (r.publishedDate) lines.push(`Date: ${r.publishedDate}`);
	if (r.engine) lines.push(`Engine: ${r.engine}`);
	lines.push(`Snippet: ${r.content ?? "(no snippet)"}`);
	return lines.join("\n");
}

loadDotEnv();

export default function (pi: ExtensionAPI) {
	// ── Tool: web_search ────────────────────────────────────────────────────────
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web via SearXNG. Returns titles, URLs, snippets, and dates. " +
			"Use for finding documentation, current information, or researching any topic.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			num_results: Type.Optional(
				Type.Number({ description: "Number of results to return (default: 5, max: 20)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { query, num_results } = params as { query: string; num_results?: number };
			const n = Math.min(num_results ?? 5, 20);

			const url = `${SEARXNG_URL}?q=${encodeURIComponent(query)}&format=json&pageno=1`;

			const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
			if (!resp.ok) {
				throw new Error(`SearXNG error: HTTP ${resp.status} ${resp.statusText}`);
			}

			const data = (await resp.json()) as {
				results?: Array<{
					title: string;
					url: string;
					content?: string;
					publishedDate?: string;
					engine?: string;
				}>;
			};

			const results = (data.results ?? []).slice(0, n);

			if (results.length === 0) {
				return { content: [{ type: "text" as const, text: "No results found." }] };
			}

			const text = results
				.map((r, i) => formatSearchResult(r, i + 1))
				.join("\n\n");

			return { content: [{ type: "text" as const, text }] };
		},
	});

	// ── Tool: web_fetch ─────────────────────────────────────────────────────────
	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch a URL and return its content as clean markdown. " +
			"Uses Readability to extract the main article content, stripping navigation and boilerplate.",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
			max_chars: Type.Optional(
				Type.Number({ description: "Maximum characters to return (default: 8000)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { url, max_chars } = params as { url: string; max_chars?: number };

			const args = [WEB_FETCH_SCRIPT, url];
			if (max_chars) args.push("--max-chars", String(max_chars));

			const result = await pi.exec("node", args);

			const text = result.stdout.trim() || result.stderr.trim() || "(no content extracted)";

			return { content: [{ type: "text" as const, text }] };
		},
	});
}
