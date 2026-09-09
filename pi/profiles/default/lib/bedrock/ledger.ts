import * as fs from "node:fs/promises";
import { getAgentDir as profileDir } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { lock } from "proper-lockfile";
import { estimateUsage, type PriceResult, type TokenUsage } from "./pricing.js";

export const LEDGER_FILE = "bedrock-usage.jsonl";
export const BASELINE_FILE = "bedrock-cost-baseline.json";
export interface UsageRecord {
	id: string; timestamp: string; month: string; session?: string;
	provider: string; model: string; target?: string; transport: string; region?: string;
	usage: Required<TokenUsage>; pricing: PriceResult;
}
export interface CostBaseline {
	schemaVersion: 1; month: string; principal: string; amount: number; invocations: number;
	capturedAt: string; source: "cloudwatch-bedrock-invocation-logs";
}
export interface UsageSummary { month: string; records: UsageRecord[]; cost: number; unpriced: number; baseline: number; baselineDetails?: CostBaseline; error?: string }
export const ledgerPath = () => path.join(profileDir(), LEDGER_FILE);
export const baselinePath = () => path.join(profileDir(), BASELINE_FILE);
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

export function makeRecord(input: { timestamp?: number; session?: string; provider: string; model: string; target?: string; transport?: string; region?: string; usage: TokenUsage }): UsageRecord {
	const timestamp = new Date(input.timestamp ?? Date.now());
	const usage = { input: finite(input.usage.input), output: finite(input.usage.output), cacheRead: finite(input.usage.cacheRead), cacheWrite: finite(input.usage.cacheWrite) };
	const identity = `${input.session ?? "ephemeral"}|${timestamp.getTime()}|${input.provider}|${input.model}|${input.target ?? ""}`;
	return { id: createHash("sha256").update(identity).digest("hex").slice(0, 24), timestamp: timestamp.toISOString(), month: monthKey(timestamp), session: input.session, provider: input.provider, model: input.model, target: input.target, transport: input.transport ?? (input.provider === "amazon-bedrock" ? "runtime" : "unknown"), region: input.region, usage, pricing: estimateUsage(input.target ?? (input.provider === "amazon-bedrock" ? input.model : undefined), usage) };
}

export async function readRecords(file = ledgerPath(), maxBytes = 1024 * 1024): Promise<UsageRecord[]> {
	try {
		const handle = await fs.open(file, "r");
		try { const stat = await handle.stat(); const start = Math.max(0, stat.size - maxBytes); const buffer = Buffer.alloc(stat.size - start); await handle.read(buffer, 0, buffer.length, start); const text = buffer.toString("utf8").replace(start ? /^[^\n]*\n?/ : /^/, ""); return text.split(/\r?\n/).filter(Boolean).flatMap(line => { try { const item = JSON.parse(line); return item?.id ? [item as UsageRecord] : []; } catch { return []; } }); } finally { await handle.close(); }
	} catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

export async function appendRecord(record: UsageRecord, file = ledgerPath()): Promise<boolean> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.appendFile(file, "", "utf8");
	const release = await lock(file, { realpath: false, retries: { retries: 40, minTimeout: 10, maxTimeout: 25 } });
	try { if ((await readRecords(file)).some(item => item.id === record.id)) return false; await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8"); return true; } finally { await release(); }
}

async function oldBaseline(month: string): Promise<number> {
	try { const value = JSON.parse(await fs.readFile(path.join(profileDir(), "operator-footer-usage.json"), "utf8")); return finite(value?.[month]); } catch { return 0; }
}
export async function readBaseline(file = baselinePath()): Promise<CostBaseline | undefined> {
	try {
		const value = JSON.parse(await fs.readFile(file, "utf8"));
		if (value?.schemaVersion !== 1 || value?.source !== "cloudwatch-bedrock-invocation-logs" || typeof value?.principal !== "string" || !/^\d{4}-\d{2}$/.test(value?.month) || !Number.isFinite(value?.amount) || value.amount < 0 || !Number.isInteger(value?.invocations) || value.invocations < 0 || !Number.isFinite(Date.parse(value?.capturedAt))) throw new Error(`Invalid Bedrock cost baseline at ${file}`);
		return value as CostBaseline;
	} catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export async function writeBaseline(baseline: CostBaseline, file = baselinePath()): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, "", { flag: "a" });
	const release = await lock(file, { realpath: false, retries: { retries: 40, minTimeout: 10, maxTimeout: 25 } });
	try {
		const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
		await fs.writeFile(temporary, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await fs.rename(temporary, file);
	} finally { await release(); }
}
export async function summarize(month = monthKey()): Promise<UsageSummary> {
	const baselineDetails = await readBaseline();
	const cutoff = baselineDetails?.month === month ? Date.parse(baselineDetails.capturedAt) : undefined;
	const records = (await readRecords()).filter(record => record.month === month && (cutoff === undefined || Date.parse(record.timestamp) > cutoff));
	const legacyBaseline = baselineDetails?.month === month ? 0 : await oldBaseline(month);
	return { month, records, cost: records.reduce((sum, record) => sum + (record.pricing.total ?? 0), 0), unpriced: records.filter(record => record.pricing.status === "unpriced").length, baseline: baselineDetails?.month === month ? baselineDetails.amount : legacyBaseline, baselineDetails: baselineDetails?.month === month ? baselineDetails : undefined };
}
export function formatStatus(summary: UsageSummary): string { const total = summary.cost + summary.baseline; const suffix = summary.unpriced ? ` + ${summary.unpriced} unpriced` : ""; return `bedrock: $${total.toFixed(2)}${suffix}`; }
function compactTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
	return `${(tokens / 1_000_000).toFixed(1)}M`;
}
function shortModelName(model: string): string {
	const match = model.match(/(?:claude-)?(opus|fable|sonnet|haiku)-(\d+(?:-\d+)?)/);
	return match ? `${match[1]}-${match[2]}` : model;
}
export function formatUsage(summary: UsageSummary): string {
	if (!summary.records.length && !summary.baseline) return "Bedrock: no local usage recorded this month.";
	const groups = new Map<string, { input: number; output: number; read: number; write: number; cost: number }>();
	for (const record of summary.records) { const key = shortModelName(record.model); const g = groups.get(key) ?? { input: 0, output: 0, read: 0, write: 0, cost: 0 }; g.input += record.usage.input; g.output += record.usage.output; g.read += record.usage.cacheRead; g.write += record.usage.cacheWrite; g.cost += record.pricing.total ?? 0; groups.set(key, g); }
	const lines = ["Bedrock local estimate:"];
	for (const [name, g] of groups) {
		const cost = g.cost.toFixed(2);
		if (cost === "0.00") continue;
		lines.push(`  ${name}: $${cost} Tokens: ${compactTokens(g.input)} in, ${compactTokens(g.output)} out, ${compactTokens(g.read)} cache read, ${compactTokens(g.write)} cache write`);
	}
	if (summary.baselineDetails) lines.push(`  CloudWatch baseline: $${summary.baseline.toFixed(2)} (${summary.baselineDetails.invocations} invocation(s))`);
	else if (summary.baseline) lines.push(`  Pre-port baseline: $${summary.baseline.toFixed(2)}`);
	if (summary.unpriced) lines.push(`  Unpriced: ${summary.unpriced} request(s)`);
	lines.push(`  Total:  $${(summary.cost + summary.baseline).toFixed(2)}`);
	return lines.join("\n");
}
