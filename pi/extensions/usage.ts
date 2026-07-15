// Source: https://github.com/davis7dotsh/my-pi-setup/blob/main/extensions/usage.ts
// Pulled from davis7dotsh/my-pi-setup main at file blob d0032ec53597d9d7f442af3eedc601068a155709.
// Keep this attribution so we can periodically compare against upstream for updates.
// Local changes: this version computes usage with a deterministic TypeScript parser
// instead of asking the agent to rebuild parsing scripts from prompt text.

import * as fs from "node:fs/promises";
import { stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	enumerateJsonlFiles,
	readJsonlFile,
	resolveAgentDir,
	resolveSessionRoot,
} from "../lib/session-jsonl.ts";

const WINDOWS = [1, 7, 30, 90] as const;
const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type UsageRecord = {
	source: "Pi" | "Codex CLI";
	model: string;
	timestamp: number;
	input: number;
	output: number;
	cached: number;
	total: number;
};

type Aggregate = Omit<UsageRecord, "timestamp"> & {
	turns: number;
	price: number;
};

type Price = {
	input: number;
	output: number;
	cached: number;
	matched?: string;
};

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function timestampFrom(
	record: Record<string, unknown>,
	fallbackTimestamp: number,
): number {
	for (const key of ["timestamp", "time", "created_at", "createdAt", "date"]) {
		const value = record[key];
		if (typeof value === "number") return value > 1e12 ? value / 1000 : value;
		if (typeof value === "string") {
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed)) return parsed / 1000;
		}
	}
	return fallbackTimestamp;
}

async function statMtimeSeconds(filePath: string): Promise<number> {
	try {
		return (await stat(filePath)).mtimeMs / 1000;
	} catch {
		return Date.now() / 1000;
	}
}

function modelKey(provider: unknown, model: unknown): string {
	const modelText = typeof model === "string" && model ? model : "unknown";
	return typeof provider === "string" && provider
		? `${provider}/${modelText}`
		: modelText;
}

async function parsePiSessions(
	root: string,
	skipped: Record<string, number>,
): Promise<{ files: string[]; records: UsageRecord[] }> {
	const files = await enumerateJsonlFiles(root);
	const records: UsageRecord[] = [];
	for (const file of files) {
		const fallbackTimestamp = await statMtimeSeconds(file);
		for await (const { value } of readJsonlFile(file, {
			onMalformedLine: () => (skipped.Pi += 1),
		})) {
			const json = objectValue(value);
			const message = objectValue(json?.message);
			const usage = objectValue(message?.usage);
			if (json?.type !== "message" || message?.role !== "assistant" || !usage)
				continue;
			const input = numberValue(
				usage.input ?? usage.inputTokens ?? usage.prompt_tokens,
			);
			const output = numberValue(
				usage.output ?? usage.outputTokens ?? usage.completion_tokens,
			);
			const cached = numberValue(
				usage.cacheRead ??
					usage.cachedInput ??
					usage.cached_input_tokens ??
					usage.cache_read,
			);
			records.push({
				source: "Pi",
				model: modelKey(
					message.provider ?? json.provider,
					message.model ?? json.model,
				),
				timestamp: timestampFrom(json, fallbackTimestamp),
				input,
				output,
				cached,
				total:
					numberValue(usage.totalTokens ?? usage.total_tokens ?? usage.total) ||
					input + output + cached,
			});
		}
	}
	return { files, records };
}

async function parseCodexSessions(
	root: string,
	skipped: Record<string, number>,
): Promise<{ files: string[]; records: UsageRecord[] }> {
	const files = await enumerateJsonlFiles(root);
	const records: UsageRecord[] = [];
	for (const file of files) {
		let currentModel: unknown;
		let currentProvider: unknown = "codex-cli";
		const fallbackTimestamp = await statMtimeSeconds(file);
		for await (const { value } of readJsonlFile(file, {
			onMalformedLine: () => (skipped["Codex CLI"] += 1),
		})) {
			const json = objectValue(value);
			if (!json) continue;
			const payload = objectValue(json.payload);
			if (
				payload &&
				(json.type === "turn_context" || json.type === "session_meta")
			) {
				currentModel = payload.model ?? currentModel;
				currentProvider =
					payload.provider ?? payload.model_provider ?? currentProvider;
			}
			const info = objectValue(payload?.info);
			const usage = objectValue(info?.last_token_usage);
			if (payload?.type !== "token_count" || !usage) continue;
			const input = numberValue(usage.input_tokens);
			const output = numberValue(usage.output_tokens);
			const cached = numberValue(usage.cached_input_tokens);
			records.push({
				source: "Codex CLI",
				model: modelKey(currentProvider, currentModel),
				timestamp: timestampFrom(json, fallbackTimestamp),
				input,
				output,
				cached,
				total: numberValue(usage.total_tokens) || input + output + cached,
			});
		}
	}
	return { files, records };
}

async function refreshPricingCache(cachePath: string): Promise<void> {
	const response = await fetch(MODELS_DEV_URL, {
		headers: { "User-Agent": "Mozilla/5.0 pi-usage" },
	});
	if (!response.ok)
		throw new Error(`${response.status} ${response.statusText}`);
	await fs.writeFile(cachePath, await response.text());
}

async function appendUsageLog(event: Record<string, unknown>): Promise<void> {
	const logPath = path.join(resolveAgentDir(), "logs", "usage.jsonl");
	await fs.mkdir(path.dirname(logPath), { recursive: true });
	await fs.appendFile(
		logPath,
		`${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
	);
}

function refreshPricingCacheInBackground(cachePath: string): void {
	const started = Date.now();
	void appendUsageLog({
		event: "pricing_cache_refresh_start",
		cachePath,
		reason: "stale_cache",
	});
	void refreshPricingCache(cachePath)
		.then(() => {
			const elapsedMs = Date.now() - started;
			void appendUsageLog({
				event: "pricing_cache_refresh_complete",
				cachePath,
				elapsedMs,
			});
		})
		.catch((error) => {
			const elapsedMs = Date.now() - started;
			const message = error instanceof Error ? error.message : String(error);
			void appendUsageLog({
				event: "pricing_cache_refresh_failed",
				cachePath,
				elapsedMs,
				error: message,
			});
			// Best-effort refresh only. The next /usage run will retry if the cache is still stale.
		});
}

async function loadPricing(
	refresh = false,
): Promise<{ prices: Map<string, Price>; note: string }> {
	const cachePath = path.join(
		resolveAgentDir(),
		"cache",
		"models-dev-api.json",
	);
	await fs.mkdir(path.dirname(cachePath), { recursive: true });
	let cacheExists = true;
	let cacheIsStale = false;
	try {
		const stat = await fs.stat(cachePath);
		cacheIsStale = Date.now() - stat.mtimeMs > CACHE_MAX_AGE_MS;
	} catch {
		cacheExists = false;
	}

	let note = cacheIsStale
		? "stale cache; background refresh started"
		: "fresh cache";
	if (refresh || !cacheExists) {
		try {
			await refreshPricingCache(cachePath);
			note = refresh ? "force-refreshed" : "created cache";
		} catch (error) {
			note = `refresh failed; using cache if available (${error instanceof Error ? error.message : String(error)})`;
		}
	} else if (cacheIsStale) {
		refreshPricingCacheInBackground(cachePath);
	}

	const data = JSON.parse(await fs.readFile(cachePath, "utf8"));
	const prices = new Map<string, Price>();
	for (const [provider, providerValue] of Object.entries(
		objectValue(data) ?? {},
	)) {
		const models = objectValue(objectValue(providerValue)?.models);
		if (!models) continue;
		for (const [model, modelValue] of Object.entries(models)) {
			const cost = objectValue(objectValue(modelValue)?.cost);
			if (!cost) continue;
			prices.set(`${provider}/${model}`.toLowerCase(), {
				input: numberValue(cost.input),
				output: numberValue(cost.output),
				cached: numberValue(
					cost.cache_read ?? cost.cached_input ?? cost.cacheRead,
				),
				matched: `${provider}/${model}`,
			});
		}
	}
	return { prices, note: `${note}; ${cachePath}` };
}

function lookupPrice(model: string, prices: Map<string, Price>): Price {
	const keys = [
		model.toLowerCase(),
		model.split("/").at(-1)?.toLowerCase(),
	].filter(Boolean) as string[];
	for (const key of keys) {
		const exact = prices.get(key);
		if (exact) return exact;
		for (const [priceKey, price] of prices) {
			if (priceKey.endsWith(`/${key}`)) return price;
		}
	}
	return { input: 0, output: 0, cached: 0 };
}

function aggregate(
	records: UsageRecord[],
	days: number,
	prices: Map<string, Price>,
): Aggregate[] {
	const cutoff = Date.now() / 1000 - days * 24 * 60 * 60;
	const map = new Map<string, Aggregate>();
	for (const record of records) {
		if (record.timestamp < cutoff) continue;
		const key = `${record.source}\0${record.model}`;
		const item = map.get(key) ?? {
			source: record.source,
			model: record.model,
			turns: 0,
			input: 0,
			output: 0,
			cached: 0,
			total: 0,
			price: 0,
		};
		item.turns += 1;
		item.input += record.input;
		item.output += record.output;
		item.cached += record.cached;
		item.total += record.total;
		map.set(key, item);
	}
	for (const item of map.values()) {
		const price = lookupPrice(item.model, prices);
		item.price =
			(item.input * price.input +
				item.output * price.output +
				item.cached * price.cached) /
			1_000_000;
	}
	return [...map.values()].sort(
		(a, b) => b.price - a.price || a.model.localeCompare(b.model),
	);
}

function money(value: number): string {
	return `$${(Math.ceil(value * 100) / 100).toFixed(2)}`;
}

function row(item: Aggregate): string {
	return `| ${item.source} | ${item.model} | ${item.turns.toLocaleString()} | ${item.input.toLocaleString()} | ${item.output.toLocaleString()} | ${item.cached.toLocaleString()} | ${item.total.toLocaleString()} | ${money(item.price)} |`;
}

export async function buildUsageReport(
	refreshPricing = false,
	sessionRoot = resolveSessionRoot(),
	codexRoots: readonly string[] = [
		path.join(os.homedir(), ".codex", "sessions"),
		path.join(os.homedir(), ".codex", "archived_sessions"),
	],
): Promise<string> {
	const skipped = { Pi: 0, "Codex CLI": 0 };
	const pi = await parsePiSessions(sessionRoot, skipped);
	const codex = await Promise.all(
		codexRoots.map((root) => parseCodexSessions(root, skipped)),
	);
	const piFiles = pi.files;
	const codexFiles = codex.flatMap(({ files }) => files);
	const records = [...pi.records, ...codex.flatMap(({ records }) => records)];
	const { prices, note } = await loadPricing(refreshPricing);
	const lines = [`Generated: ${new Date().toISOString()}`];
	for (const days of WINDOWS) {
		const items = aggregate(records, days, prices);
		const total: Aggregate = {
			source: "Pi",
			model: "",
			turns: 0,
			input: 0,
			output: 0,
			cached: 0,
			total: 0,
			price: 0,
		};
		for (const item of items) {
			total.turns += item.turns;
			total.input += item.input;
			total.output += item.output;
			total.cached += item.cached;
			total.total += item.total;
			total.price += item.price;
		}
		lines.push(
			`\n## Last ${days} day${days === 1 ? "" : "s"}`,
			"| Source | Model | Messages/Turns | Input | Output | Cached In | Total Tokens | Price |",
			"|---|---|---:|---:|---:|---:|---:|---:|",
			...items.map(row),
			`| **Total** |  | **${total.turns.toLocaleString()}** | **${total.input.toLocaleString()}** | **${total.output.toLocaleString()}** | **${total.cached.toLocaleString()}** | **${total.total.toLocaleString()}** | **${money(total.price)}** |`,
		);
	}
	lines.push(
		"\n## Pricing notes",
		`- models.dev cache: ${note}.`,
		`- Parsed files: Pi ${piFiles.length}, Codex CLI ${codexFiles.length}. Records counted: ${records.length.toLocaleString()}.`,
		`- Skipped malformed JSONL lines: Pi ${skipped.Pi}, Codex CLI ${skipped["Codex CLI"]}.`,
		"- Codex CLI token_count uses last_token_usage; reasoning_output_tokens is assumed included in output/total when present.",
		"- Cached output/write tokens are intentionally not reported.",
	);
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "usage_report",
		label: "Pi Usage Report",
		description:
			"Parse local Pi and Codex CLI session logs and return token/cost usage tables.",
		parameters: Type.Object({
			refreshPricing: Type.Optional(
				Type.Boolean({
					description: "Force-refresh models.dev pricing cache.",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			const markdown = await buildUsageReport(params.refreshPricing ?? false);
			return {
				content: [{ type: "text", text: markdown }],
				details: { markdown },
			};
		},
	});

	pi.registerCommand("usage-stats", {
		description:
			"Summarize Pi/Codex token usage and cost for the last 1, 7, 30, and 90 days",
		handler: async (args, ctx) => {
			const refreshPricing = args.trim() === "--refresh-pricing";
			const markdown = await buildUsageReport(
				refreshPricing,
				ctx.sessionManager.getSessionDir(),
			);
			pi.sendMessage(
				{
					customType: "usage-stats",
					content: markdown,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
