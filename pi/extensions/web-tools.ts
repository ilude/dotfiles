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

// Convention exception: no extension-utils helpers apply directly.
// Risk: helper API drifts and this file is not visited by future refactors;
//   web-tools.ts has its own dedicated test file (web-tools.test.ts, 163
//   lines) covering happy-path and error-path behavior.
// Why shared helper is inappropriate: the file's tool returns are not
//   "errors" in the formatToolError sense -- they are normal tool results
//   carrying SearXNG / fetched markdown content. canonicalize does not
//   apply because the file does not handle filesystem paths beyond the
//   home-relative .env load. uiNotify does not apply because the file
//   surfaces results through the tool result envelope, not UI
//   notifications.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SEARXNG_URL = "http://192.168.16.241:8888/search";
const WEB_FETCH_SCRIPT = path.join(os.homedir(), ".dotfiles", "pi", "extensions", "web-fetch", "fetch.js");

// ── .env parsing ────────────────────────────────────────────────────────────

export interface EnvEntry { key: string; value: string }

function parseEnvLine(line: string): EnvEntry | null {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) return null;
	const eq = trimmed.indexOf("=");
	if (eq === -1) return null;
	const key = trimmed.slice(0, eq).trim();
	if (!key) return null;
	const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
	return { key, value };
}

/** Parse KEY=VALUE content. Skips comments, blank lines, lines without '='. Strips surrounding quotes. */
export function parseDotEnv(content: string): EnvEntry[] {
	const entries: EnvEntry[] = [];
	for (const line of content.split("\n")) {
		const entry = parseEnvLine(line);
		if (entry) entries.push(entry);
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

interface StructuredSearchParams {
	query: string;
	exactPhrases?: string[];
	exact_phrases?: string[];
	excludeTerms?: string[];
	exclude_terms?: string[];
	site?: string;
	num_results?: number;
	count?: number;
}

function cleanSearchItems(values?: string[]): string[] {
	return (values ?? [])
		.map((value) => value.trim().replace(/^\"|\"$/g, "").replace(/\s+/g, " "))
		.filter(Boolean);
}

function normalizeSite(site?: string): string | undefined {
	if (!site) return undefined;
	let value = site.trim().replace(/^site:/i, "").trim();
	if (!value) return undefined;
	try {
		const candidate = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
		const parsed = new URL(candidate);
		return parsed.hostname.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "");
	} catch {
		return value.replace(/^www\./, "");
	}
}

function buildSearxngQuery(params: StructuredSearchParams): string {
	const parts = [params.query.trim().replace(/\s+/g, " ")].filter(Boolean);
	const exact = [
		...cleanSearchItems(params.exactPhrases),
		...cleanSearchItems(params.exact_phrases),
	];
	for (const phrase of exact) parts.push(`"${phrase.replace(/"/g, "\\\"")}"`);
	const excluded = [
		...cleanSearchItems(params.excludeTerms),
		...cleanSearchItems(params.exclude_terms),
	];
	for (const term of excluded) {
		parts.push(term.includes(" ") ? `-"${term.replace(/"/g, "\\\"")}"` : `-${term}`);
	}
	const site = normalizeSite(params.site);
	if (site) parts.push(`site:${site}`);
	return parts.join(" ");
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
			query: Type.String({ description: "Base search query" }),
			exactPhrases: Type.Optional(Type.Array(Type.String(), { description: "Exact phrases to require; each becomes a quoted phrase" })),
			exact_phrases: Type.Optional(Type.Array(Type.String(), { description: "Alias for exactPhrases" })),
			excludeTerms: Type.Optional(Type.Array(Type.String(), { description: "Terms or phrases to exclude" })),
			exclude_terms: Type.Optional(Type.Array(Type.String(), { description: "Alias for excludeTerms" })),
			site: Type.Optional(Type.String({ description: "Optional site/domain restriction, e.g. example.com" })),
			num_results: Type.Optional(
				Type.Number({ description: "Number of results to return (default: 5, max: 20)" }),
			),
			count: Type.Optional(Type.Number({ description: "Alias for num_results" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const search = params as StructuredSearchParams;
			const n = Math.min(search.num_results ?? search.count ?? 5, 20);
			const composedQuery = buildSearxngQuery(search);

			const url = `${SEARXNG_URL}?q=${encodeURIComponent(composedQuery)}&format=json&pageno=1`;

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
				return { content: [{ type: "text" as const, text: "No results found." }], details: undefined };
			}

			const text = results
				.map((r, i) => formatSearchResult(r, i + 1))
				.join("\n\n");

			return { content: [{ type: "text" as const, text }], details: { composedQuery, resultCount: results.length } };
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

			return { content: [{ type: "text" as const, text }], details: undefined };
		},
	});
}
