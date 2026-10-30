import { readFile } from "node:fs/promises";
import type { CodexAuthRegistry } from "../codex-auth.ts";
import { fetchCodexUsage, type CodexUsage } from "../codex-usage.ts";
import { ledgerPath, type UsageRecord } from "../bedrock/ledger.ts";
import { estimateUsage } from "../bedrock/pricing.ts";

export type UsageObservation<T> = ({ status: "available"; observedAt: number } & T)
	| { status: "unavailable"; observedAt: number; reason: string };
export type GoalBedrockUsage = UsageObservation<{ usd: number; responses: number }>;
export type GoalCodexUsage = UsageObservation<{
	/** Shared account quota, NOT spend attributable to this goal. */
	usedPercent: number; resetAt: number; windowSeconds: number;
}>;
export interface GoalUsage { bedrock: GoalBedrockUsage; codex: GoalCodexUsage }

/** Persist this manifest with the goal. Session strings must match accounting's
 * bedrockSessionReference (normally the session FILE, not the session ID).
 * Enroll only this run's orchestrator and explicitly propagated descendants,
 * never every member of an inherited session tree. Bounds are [from, until).
 */
export interface GoalUsageAttribution {
	runId: string;
	launchedAt: number;
	sessions: { session: string; from: number; until?: number }[];
	/** Runtime attestation: all enrolled response accounting has settled and
	 * persisted, no lineage gaps, and any Bedrock helper calls are accounted.
	 * Ledger reads alone cannot establish this. Persist failures across resume.
	 */
	complete: boolean;
	incompleteReason?: string;
}
/** Transport-neutral finalized accounting signal for root/descendant runtime
 * wiring. Emit AFTER accountBedrockMessage returns, even when persisted=false.
 * Route by exact propagated runId/session, deduplicate by recordId, and persist
 * any failure as incomplete run coverage. A runtime accounting fence must wait
 * for pending signals before attesting complete; this interface does not supply
 * cross-process delivery or account uninstrumented helper model calls.
 */
export interface GoalAccountingEvent {
	type: "goal-accounting";
	runId: string;
	session: string;
	recordId: string;
	timestamp: number;
	persisted: boolean;
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function object(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function unavailable(observedAt: number, reason: string): UsageObservation<never> {
	return { status: "unavailable", observedAt, reason };
}

/** Read the ENTIRE ledger, not readRecords' default 1 MiB tail or monthly/CUR
 * summary. Malformed/truncated observations and missing files are not zero.
 * Existing recorded prices stay fixed; missing prices use the shared resolver.
 */
export async function readGoalBedrockUsage(attribution: GoalUsageAttribution, file = ledgerPath(), observedAt = Date.now()): Promise<GoalBedrockUsage> {
	if (!attribution.complete) return unavailable(observedAt, attribution.incompleteReason || "Whole-run Bedrock accounting coverage is incomplete.");
	if (!attribution.runId || !finite(attribution.launchedAt) || !finite(observedAt) || observedAt < attribution.launchedAt || !attribution.sessions.length
		|| attribution.sessions.some(row => !row.session || !finite(row.from) || (row.until !== undefined && (!finite(row.until) || row.until < row.from))))
		return unavailable(observedAt, "Invalid whole-run session attribution.");
	try {
		const text = await readFile(file, "utf8");
		const seen = new Map<string, string>();
		let usd = 0, responses = 0;
		for (const line of text.split(/\r?\n/)) {
			if (!line.trim()) continue;
			const row = object(JSON.parse(line));
			if (!row || typeof row.id !== "string" || !row.id || typeof row.timestamp !== "string" || !Number.isFinite(Date.parse(row.timestamp)))
				return unavailable(observedAt, "Bedrock ledger contains an invalid observation.");
			const timestamp = Date.parse(row.timestamp);
			if (timestamp < attribution.launchedAt || timestamp > observedAt || !attribution.sessions.some(session => session.session === row.session && timestamp >= session.from && (session.until === undefined || timestamp < session.until))) continue;
			if (row.provider !== "amazon-bedrock" && row.provider !== "bedrock-mantle") return unavailable(observedAt, "Unexpected provider in attributed Bedrock ledger.");
			const tokens = object(row.usage), recorded = object(row.pricing);
			if (!tokens || !recorded || ["input", "output", "cacheRead", "cacheWrite"].some(key => !finite(tokens[key]) || tokens[key] < 0)
				|| (tokens.cacheWrite1h !== undefined && (!finite(tokens.cacheWrite1h) || tokens.cacheWrite1h < 0 || tokens.cacheWrite1h > Number(tokens.cacheWrite))))
				return unavailable(observedAt, "Bedrock ledger has unavailable token usage or pricing.");
			const usage: UsageRecord["usage"] = { input: Number(tokens.input), output: Number(tokens.output), cacheRead: Number(tokens.cacheRead), cacheWrite: Number(tokens.cacheWrite), ...(tokens.cacheWrite1h === undefined ? {} : { cacheWrite1h: Number(tokens.cacheWrite1h) }) };
			const target = typeof row.target === "string" ? row.target : row.provider === "amazon-bedrock" && typeof row.model === "string" ? row.model : undefined;
			const pricing = recorded.status === "unpriced" ? estimateUsage(target, usage) : recorded;
			if (pricing.status !== "estimated" || !finite(pricing.total) || pricing.total < 0) return unavailable(observedAt, "Attributed Bedrock responses have unavailable prices.");
			const identity = JSON.stringify([row.timestamp, row.session, row.provider, row.model, target, usage, pricing.total]);
			const previous = seen.get(row.id);
			if (previous !== undefined) {
				if (previous !== identity) return unavailable(observedAt, "Conflicting duplicate Bedrock response identity.");
				continue;
			}
			seen.set(row.id, identity);
			usd += pricing.total;
			responses++;
		}
		return finite(usd) ? { status: "available", observedAt, usd, responses } : unavailable(observedAt, "Bedrock total is not finite.");
	} catch {
		return unavailable(observedAt, "Full Bedrock ledger could not be read or parsed.");
	}
}

export function observeGoalCodexUsage(usage: CodexUsage, observedAt = Date.now()): GoalCodexUsage {
	const weekly = [usage.rate_limit?.primary_window, usage.rate_limit?.secondary_window].filter(window => window?.limit_window_seconds === 604800);
	if (weekly.length !== 1) return unavailable(observedAt, "Codex weekly quota window is unavailable or ambiguous.");
	const window = weekly[0]!;
	const resetAt = finite(window.reset_at) ? (window.reset_at > 10_000_000_000 ? window.reset_at : window.reset_at * 1000)
		: finite(window.reset_after_seconds) ? observedAt + window.reset_after_seconds * 1000 : undefined;
	if (!finite(window.used_percent) || window.used_percent < 0 || window.used_percent > 100 || !finite(resetAt) || resetAt <= observedAt)
		return unavailable(observedAt, "Codex weekly usage or reset time is unavailable or expired.");
	return { status: "available", observedAt, usedPercent: window.used_percent, resetAt, windowSeconds: 604800 };
}

export interface ReadGoalUsageOptions {
	attribution?: GoalUsageAttribution;
	/** Use ctx.modelRegistry, preserving existing quota auth and renewal. */
	modelRegistry?: CodexAuthRegistry;
	signal: AbortSignal;
	ledgerFile?: string;
}
export async function readGoalUsage(options: ReadGoalUsageOptions): Promise<GoalUsage> {
	options.signal.throwIfAborted();
	const bedrock = options.attribution ? readGoalBedrockUsage(options.attribution, options.ledgerFile) : Promise.resolve(unavailable(Date.now(), "Bedrock accounting was not requested."));
	const codex = (async (): Promise<GoalCodexUsage> => {
		if (!options.modelRegistry) return unavailable(Date.now(), "Codex quota reader has no model registry.");
		try { return observeGoalCodexUsage(await fetchCodexUsage(options.modelRegistry, options.signal)); }
		catch { return unavailable(Date.now(), "Codex weekly quota request failed; retry /usage or check quota login."); }
	})();
	const result = { bedrock: await bedrock, codex: await codex };
	options.signal.throwIfAborted();
	return result;
}
