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
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTranscriptTiming } from "../lib/tool-timing.js";

const DEFAULT_SEARXNG_URL = "https://searxng.ilude.com/search";
const WEB_FETCH_SCRIPT = path.join(os.homedir(), ".dotfiles", "pi", "extensions", "web-fetch", "fetch.js");
const DEFAULT_WEB_FETCH_MAX_CHARS = 8000;
const MAX_WEB_FETCH_CHARS = 50000;
const WEB_FETCH_TIMEOUT_MS = 30000;

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
		.map((value) => value.trim().replace(/^"|"$/g, "").replace(/\s+/g, " "))
		.filter(Boolean);
}

function normalizeSite(site?: string): string | undefined {
	if (!site) return undefined;
	const value = site.trim().replace(/^site:/i, "").trim();
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

function displayUrl(url: string | undefined): string {
	if (!url) return "(missing URL)";
	return url.length > 120 ? `${url.slice(0, 117)}...` : url;
}

function renderWebCall(label: string, value: string, theme: any, context: any): Text {
	const state = context.state ?? (context.state = {});
	if (context.executionStarted && state.startedAt === undefined)
		state.startedAt = Date.now();
	const timing = formatTranscriptTiming(state.startedAt, undefined);
	return new Text(
		`${theme.fg("accent", `${label} `)}${theme.fg("toolTitle", value)}${timing ? `\n  ${theme.fg("dim", timing)}` : ""}`,
		0,
		0,
	);
}

function renderWebResult(result: any, options: any, theme: any, context: any): Text {
	const text = result.content?.[0]?.text ?? "(no output)";
	const elapsed = Number(result.details?.elapsed);
	const durationMs = Number.isFinite(elapsed)
		? elapsed * 1000
		: context.state?.startedAt === undefined
			? undefined
			: Date.now() - context.state.startedAt;
	const timing = formatTranscriptTiming(
		context.state?.startedAt,
		options.isPartial ? undefined : durationMs,
	);
	return new Text(`${timing ? `${timing}\n` : ""}${text}`, 0, 0);
}

export function classifyWebSearchFailure(error: unknown): string {
	if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
	if (error instanceof Error && error.name === "AbortError") return "aborted";
	const code =
		error instanceof Error && "cause" in error
			? String((error.cause as { code?: unknown } | undefined)?.code ?? "")
			: "";
	if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "dns";
	if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(code))
		return "connection";
	if (error instanceof TypeError) return "network";
	return "request";
}

export function normalizeWebFetchMaxChars(value: number | undefined): number {
	if (value === undefined) return DEFAULT_WEB_FETCH_MAX_CHARS;
	if (!Number.isFinite(value) || value <= 0)
		throw new Error("max_chars must be a positive number");
	return Math.min(Math.floor(value), MAX_WEB_FETCH_CHARS);
}

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
			exact_phrases: Type.Optional(
				Type.Array(Type.String(), {
					description: "Exact phrases to require; each becomes a quoted phrase",
				}),
			),
			exclude_terms: Type.Optional(
				Type.Array(Type.String(), { description: "Terms or phrases to exclude" }),
			),
			site: Type.Optional(Type.String({ description: "Optional site/domain restriction, e.g. example.com" })),
			num_results: Type.Optional(
				Type.Number({ description: "Number of results to return (default: 5, max: 20)" }),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const search = params as StructuredSearchParams;
			const n = Math.min(search.num_results ?? search.count ?? 5, 20);
			const composedQuery = buildSearxngQuery(search);

			const searxngUrl = (process.env.SEARXNG_URL ?? DEFAULT_SEARXNG_URL).replace(/\/$/, "");
			const url = `${searxngUrl}?q=${encodeURIComponent(composedQuery)}&format=json&pageno=1`;

			let resp: Response;
			try {
				resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
			} catch (error) {
				throw new Error(
					`SearXNG ${classifyWebSearchFailure(error)} failure at ${new URL(searxngUrl).hostname}: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: error },
				);
			}
			if (!resp.ok) {
				throw new Error(
					`SearXNG HTTP failure at ${new URL(searxngUrl).hostname}: ${resp.status} ${resp.statusText}`,
				);
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

			const header = `web_search(${JSON.stringify(composedQuery)})`;
			if (results.length === 0) {
				return { content: [{ type: "text" as const, text: `${header}\nNo results found.` }], details: { composedQuery, resultCount: 0 } };
			}

			const text = [
				header,
				results.map((r, i) => formatSearchResult(r, i + 1)).join("\n\n"),
			].join("\n");

			return { content: [{ type: "text" as const, text }], details: { composedQuery, resultCount: results.length } };
		},
		renderCall(args, theme, context) {
			return renderWebCall("web_search", JSON.stringify((args as StructuredSearchParams).query ?? ""), theme, context);
		},
		renderResult: renderWebResult,
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
			const normalizedMaxChars = normalizeWebFetchMaxChars(max_chars);

			const args = [WEB_FETCH_SCRIPT, url, "--max-chars", String(normalizedMaxChars)];

			const result = await pi.exec("node", args, {
				timeout: WEB_FETCH_TIMEOUT_MS,
			});

			const text = result.stdout.trim() || result.stderr.trim() || "(no content extracted)";

			return { content: [{ type: "text" as const, text }], details: undefined };
		},
		renderCall(args, theme, context) {
			return renderWebCall(
				"web_fetch",
				displayUrl((args as { url?: string }).url),
				theme,
				context,
			);
		},
		renderResult: renderWebResult,
	});
}
