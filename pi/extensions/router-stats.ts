import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const RANGE_DAYS = [1, 7, 30, 60, 90] as const;
const DEFAULT_REPORT_DAYS = [1, 7, 30] as const;

type ModelSize = "small" | "medium" | "large" | "unknown";

interface RouterRecord {
	ts: number;
	promptHash: string;
	promptExcerpt: string;
	modelSize: ModelSize;
	effort: string;
	confidence: number | null;
	elapsedMs: number | null;
	tokens: number;
}

interface BucketRow {
	key: string;
	calls: number;
	tokens: number;
	confidenceSum: number;
	confidenceCount: number;
	latencyMs: number[];
}

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function sessionRoot(): string {
	return path.join(agentDir(), "sessions");
}

function routingLogPath(cwd: string): string {
	return path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl");
}

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function parseDays(args: string): number[] {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return [...DEFAULT_REPORT_DAYS];
	if (parts.length === 1 && parts[0]?.toLowerCase() === "all") return [...RANGE_DAYS];
	const out = new Set<number>(DEFAULT_REPORT_DAYS);
	for (const part of parts) {
		const n = Number(part);
		if (n === 60 || n === 90) out.add(n);
	}
	return [...out].sort((a, b) => a - b);
}

function localMidnight(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function formatInt(n: number): string {
	return Math.round(n).toLocaleString();
}

function formatPct(n: number): string {
	return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

function formatMs(values: number[]): { avg: string; p50: string; p95: string } {
	if (values.length === 0) return { avg: "--", p50: "--", p95: "--" };
	const sorted = [...values].sort((a, b) => a - b);
	const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
	const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
	return { avg: `${avg.toFixed(0)} ms`, p50: `${percentile(0.5).toFixed(0)} ms`, p95: `${percentile(0.95).toFixed(0)} ms` };
}

function toNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeModelSize(obj: any): ModelSize {
	const direct = obj?.primary?.model_size;
	if (direct === "small" || direct === "medium" || direct === "large") return direct;
	const tier = typeof obj?.tier === "string" ? obj.tier : typeof obj?.raw_pred === "string" ? obj.raw_pred : null;
	if (tier === "low" || tier === "small") return "small";
	if (tier === "mid" || tier === "medium") return "medium";
	if (tier === "high" || tier === "large") return "large";
	return "unknown";
}

function normalizeEffort(obj: any): string {
	return typeof obj?.primary?.effort === "string" ? obj.primary.effort : "unknown";
}

function normalizeConfidence(obj: any): number | null {
	const direct = toNumber(obj?.confidence);
	if (direct !== null) return direct;
	if (obj?.proba && typeof obj.proba === "object") {
		return Math.max(...Object.values(obj.proba).map((v) => (typeof v === "number" ? v : 0)));
	}
	return null;
}

async function readRoutingRecords(cwd: string): Promise<RouterRecord[]> {
	const filePath = routingLogPath(cwd);
	const records: RouterRecord[] = [];
	try {
		await fs.access(filePath);
	} catch {
		return records;
	}
	const stream = createReadStream(filePath, { encoding: "utf8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line);
				const ts = toNumber(obj?.ts);
				if (!ts) continue;
				records.push({
					ts,
					promptHash: typeof obj?.prompt_hash === "string" ? obj.prompt_hash : "",
					promptExcerpt: typeof obj?.prompt_excerpt === "string" ? obj.prompt_excerpt : "",
					modelSize: normalizeModelSize(obj),
					effort: normalizeEffort(obj),
					confidence: normalizeConfidence(obj),
					elapsedMs: toNumber(obj?.elapsed_us) === null ? null : (toNumber(obj.elapsed_us) ?? 0) / 1000,
					tokens: 0,
				});
			} catch {
				continue;
			}
		}
	} finally {
		rl.close();
		stream.destroy();
	}
	return records;
}

async function walkJsonl(root: string): Promise<string[]> {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (!dir) continue;
		let entries: import("node:fs").Dirent[] = [];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const p = path.join(dir, entry.name);
			if (entry.isDirectory()) stack.push(p);
			if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(p);
		}
	}
	return out;
}

function extractUserText(message: any): string | null {
	if (message?.role !== "user") return null;
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return null;
	const text = message.content
		.filter((block: any) => block?.type === "text" && typeof block?.text === "string")
		.map((block: any) => block.text)
		.join("\n");
	return text.length > 0 ? text : null;
}

function usageTokens(usage: any): number {
	if (!usage) return 0;
	return [usage.input, usage.output, usage.cacheRead, usage.cacheWrite]
		.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0))
		.reduce((a, b) => a + b, 0);
}

async function readTokenByPromptHash(hashes: Set<string>): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	if (hashes.size === 0) return out;
	for (const filePath of await walkJsonl(sessionRoot())) {
		const stream = createReadStream(filePath, { encoding: "utf8" });
		const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
		let pendingHash: string | null = null;
		try {
			for await (const line of rl) {
				if (!line.trim()) continue;
				let obj: any;
				try {
					obj = JSON.parse(line);
				} catch {
					continue;
				}
				if (obj?.type !== "message") continue;
				const text = extractUserText(obj.message);
				if (text !== null) {
					const hash = sha256Hex(text.trim());
					pendingHash = hashes.has(hash) ? hash : null;
					continue;
				}
				if (!pendingHash || obj?.message?.role !== "assistant") continue;
				const tokens = usageTokens(obj?.usage ?? obj?.message?.usage);
				if (tokens > 0) out.set(pendingHash, (out.get(pendingHash) ?? 0) + tokens);
				pendingHash = null;
			}
		} finally {
			rl.close();
			stream.destroy();
		}
	}
	return out;
}

function addBucket(map: Map<string, BucketRow>, key: string, record: RouterRecord): void {
	const row = map.get(key) ?? { key, calls: 0, tokens: 0, confidenceSum: 0, confidenceCount: 0, latencyMs: [] };
	row.calls += 1;
	row.tokens += record.tokens;
	if (record.confidence !== null) {
		row.confidenceSum += record.confidence;
		row.confidenceCount += 1;
	}
	if (record.elapsedMs !== null) row.latencyMs.push(record.elapsedMs);
	map.set(key, row);
}

function confidenceBucket(c: number | null): string {
	if (c === null) return "unknown";
	if (c < 0.25) return "<0.25";
	if (c < 0.5) return "0.25-0.50";
	if (c < 0.75) return "0.50-0.75";
	return ">=0.75";
}

function renderBucketTable(rows: BucketRow[], total: number): string {
	if (rows.length === 0) return "_No records._";
	const lines = ["| Name | Calls | Est. tokens | Avg tokens | Avg confidence | Avg latency | Share |", "|---|---:|---:|---:|---:|---:|---:|"];
	for (const row of rows.sort((a, b) => b.calls - a.calls)) {
		const avgTokens = row.calls > 0 ? row.tokens / row.calls : 0;
		const avgConfidence = row.confidenceCount > 0 ? row.confidenceSum / row.confidenceCount : 0;
		const latency = formatMs(row.latencyMs).avg;
		lines.push(`| ${row.key} | ${formatInt(row.calls)} | ${formatInt(row.tokens)} | ${formatInt(avgTokens)} | ${row.confidenceCount > 0 ? avgConfidence.toFixed(2) : "--"} | ${latency} | ${formatPct((row.calls / total) * 100)} |`);
	}
	return lines.join("\n");
}

function nowrap(value: string): string {
	return `<span style="white-space: nowrap">${value}</span>`;
}

function renderPromptRows(records: RouterRecord[], mode: "tokens" | "confidence"): string {
	const rows = [...records]
		.filter((r) => (mode === "tokens" ? r.tokens > 0 : r.confidence !== null))
		.sort((a, b) => (mode === "tokens" ? b.tokens - a.tokens : (a.confidence ?? 0) - (b.confidence ?? 0)))
		.slice(0, 10);
	if (rows.length === 0) return "_No records._";
	const lines = ["| Time | Size | Effort | Tokens | Confidence | Prompt excerpt |", "|---|---|---|---:|---:|---|"];
	for (const r of rows) {
		const time = new Date(r.ts * 1000).toISOString().slice(0, 16).replace("T", " ");
		lines.push(`| ${nowrap(time)} | ${r.modelSize} | ${r.effort} | ${formatInt(r.tokens)} | ${r.confidence === null ? "--" : r.confidence.toFixed(2)} | ${r.promptExcerpt.replace(/\s+/g, " ").slice(0, 100)} |`);
	}
	return lines.join("\n");
}

async function renderReport(cwd: string, daysList: number[]): Promise<string> {
	const records = await readRoutingRecords(cwd);
	const tokenByHash = await readTokenByPromptHash(new Set(records.map((r) => r.promptHash).filter(Boolean)));
	for (const record of records) record.tokens = tokenByHash.get(record.promptHash) ?? 0;

	const now = localMidnight(new Date());
	const lines = [
		"# Router stats",
		"",
		`Generated: ${new Date().toISOString()}`,
		`Log: ${routingLogPath(cwd)}`,
		"Attribution: routing_log.jsonl plus prompt-hash session token join.",
	];

	for (const days of daysList) {
		const start = addDays(now, -(days - 1));
		const subset = records.filter((r) => localMidnight(new Date(r.ts * 1000)) >= start && localMidnight(new Date(r.ts * 1000)) <= now);
		const totalTokens = subset.reduce((sum, r) => sum + r.tokens, 0);
		const confidenceRows = subset.filter((r) => r.confidence !== null);
		const avgConfidence = confidenceRows.length > 0 ? confidenceRows.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / confidenceRows.length : 0;
		const latency = formatMs(subset.flatMap((r) => (r.elapsedMs === null ? [] : [r.elapsedMs])));
		lines.push("", `## Last ${days} days`, `${formatInt(subset.length)} routed prompts · ${formatInt(totalTokens)} est. tokens · avg confidence ${confidenceRows.length > 0 ? avgConfidence.toFixed(2) : "--"} · avg latency ${latency.avg} · p95 latency ${latency.p95}`);

		const bySize = new Map<string, BucketRow>();
		const byEffort = new Map<string, BucketRow>();
		const byConfidence = new Map<string, BucketRow>();
		for (const record of subset) {
			addBucket(bySize, record.modelSize, record);
			addBucket(byEffort, record.effort, record);
			addBucket(byConfidence, confidenceBucket(record.confidence), record);
		}
		lines.push("", "### By model size", renderBucketTable([...bySize.values()], subset.length));
		lines.push("", "### By effort", renderBucketTable([...byEffort.values()], subset.length));
		lines.push("", "### Confidence buckets", renderBucketTable([...byConfidence.values()], subset.length));
		lines.push("", "### Highest-token routed prompts", renderPromptRows(subset, "tokens"));
		lines.push("", "### Lowest-confidence routed prompts", renderPromptRows(subset, "confidence"));
	}
	return lines.join("\n");
}

export default function routerStatsExtension(pi: ExtensionAPI) {
	pi.registerCommand("router-stats", {
		description: "Show prompt-router model-size, effort, confidence, latency, and token attribution stats",
		handler: async (args: string, ctx: ExtensionContext) => {
			const markdown = await renderReport(ctx.cwd, parseDays(args));
			pi.sendMessage({ customType: "router-stats", content: markdown, display: true }, { triggerTurn: false });
		},
	});
}
