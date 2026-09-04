import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	enumerateJsonlFiles,
	readJsonlFile,
	resolveAgentDir,
	resolveSessionRoot,
} from "../session-jsonl.ts";
import type { MetricsEvent } from "../metrics.ts";

export type UsageSource = "Pi" | "Codex CLI";

export type UsageRecord = {
	source: UsageSource;
	model: string;
	timestamp: number;
	input: number;
	output: number;
	cached: number;
	total: number;
};

export type UsageAggregate = Omit<UsageRecord, "timestamp"> & {
	turns: number;
	price: number;
};

export type UsagePrice = {
	input: number;
	output: number;
	cached: number;
	matched?: string;
};

export type UsageReadResult = {
	piFiles: string[];
	codexFiles: string[];
	records: UsageRecord[];
	skipped: Record<UsageSource, number>;
};

export type UsagePricing = {
	prices: Map<string, UsagePrice>;
	note: string;
};

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const backgroundRefreshes = new Set<Promise<void>>();

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
	skipped: UsageReadResult["skipped"],
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
	skipped: UsageReadResult["skipped"],
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

export async function readHistoricalUsage(
	sessionRoot = resolveSessionRoot(),
	codexRoots: readonly string[] = [
		path.join(os.homedir(), ".codex", "sessions"),
		path.join(os.homedir(), ".codex", "archived_sessions"),
	],
): Promise<UsageReadResult> {
	const skipped: UsageReadResult["skipped"] = { Pi: 0, "Codex CLI": 0 };
	const pi = await parsePiSessions(sessionRoot, skipped);
	const codex = await Promise.all(
		codexRoots.map((root) => parseCodexSessions(root, skipped)),
	);
	return {
		piFiles: pi.files,
		codexFiles: codex.flatMap(({ files }) => files),
		records: [...pi.records, ...codex.flatMap(({ records }) => records)],
		skipped,
	};
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
	const ts = new Date().toISOString();
	await fs.mkdir(path.dirname(logPath), { recursive: true });
	await fs.appendFile(
		logPath,
		`${JSON.stringify({ ...event, schemaVersion: 1, id: crypto.randomUUID(), ts, timestamp: ts })}\n`,
	);
}

function refreshPricingCacheInBackground(cachePath: string): void {
	const started = Date.now();
	const startLog = appendUsageLog({
		event: "pricing_cache_refresh_start",
		cachePath,
		reason: "stale_cache",
	});
	const refresh = refreshPricingCache(cachePath)
		.then(() => {
			const elapsedMs = Date.now() - started;
			return appendUsageLog({
				event: "pricing_cache_refresh_complete",
				cachePath,
				elapsedMs,
			});
		})
		.catch((error) => {
			const elapsedMs = Date.now() - started;
			const message = error instanceof Error ? error.message : String(error);
			// Best-effort refresh only. The next /usage run will retry if the cache is still stale.
			return appendUsageLog({
				event: "pricing_cache_refresh_failed",
				cachePath,
				elapsedMs,
				error: message,
			});
		});
	const pending = Promise.all([startLog, refresh]).then(() => undefined);
	backgroundRefreshes.add(pending);
	void pending.finally(() => backgroundRefreshes.delete(pending)).catch(() => undefined);
}

export async function waitForUsageBackgroundTasks(): Promise<void> {
	await Promise.all([...backgroundRefreshes]);
}

export async function loadUsagePricing(
	refresh = false,
): Promise<UsagePricing> {
	const cachePath = path.join(
		resolveAgentDir(),
		"cache",
		"models-dev-api.json",
	);
	await fs.mkdir(path.dirname(cachePath), { recursive: true });
	let cacheExists = true;
	let cacheIsStale = false;
	try {
		const cacheStat = await fs.stat(cachePath);
		cacheIsStale = Date.now() - cacheStat.mtimeMs > CACHE_MAX_AGE_MS;
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

	const data = JSON.parse(await fs.readFile(cachePath, "utf8")) as unknown;
	const prices = new Map<string, UsagePrice>();
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

export function lookupUsagePrice(
	model: string,
	prices: Map<string, UsagePrice>,
): UsagePrice {
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

export function aggregateUsage(
	records: readonly UsageRecord[],
	days: number,
	prices: Map<string, UsagePrice>,
	now = Date.now(),
): UsageAggregate[] {
	const cutoff = now / 1000 - days * 24 * 60 * 60;
	const map = new Map<string, UsageAggregate>();
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
		const price = lookupUsagePrice(item.model, prices);
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

export function readMetricEventsFromJsonl(
	filePath: string,
	limit = 100,
	matches: (event: MetricsEvent) => boolean = () => true,
): MetricsEvent[] {
	// This synchronous compatibility reader is intentionally narrow: callers use
	// it for bounded diagnostics while bulk analytics use the typed store API.
	try {
		const raw = fsSync.readFileSync(filePath, "utf8");
		const events: MetricsEvent[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const parsed: unknown = JSON.parse(trimmed);
				if (isMetricsEvent(parsed) && matches(parsed)) events.push(parsed);
			} catch {
				// Skip malformed lines to preserve diagnostic behavior.
			}
		}
		events.reverse();
		return events.slice(0, limit);
	} catch {
		return [];
	}
}

function isMetricsEvent(value: unknown): value is MetricsEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		record.schemaVersion === 1 &&
		typeof record.id === "string" &&
		typeof record.ts === "string" &&
		typeof record.event === "string"
	);
}