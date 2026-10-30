import type { GoalUsage } from "./usage.ts";

export interface GoalBudgetLimits { bedrockUsd?: number; codexPercent?: number }
/** Durable launch snapshot. Persist unchanged across continuations and resume.
 * A valid quota reset changes the observed window, not this launch snapshot.
 * Emergency reserve is fixed once, never compounded or refreshed on reset.
 */
export interface GoalBudgetBaseline {
	capturedAt: number;
	limits: GoalBudgetLimits;
	codex?: { usedPercent: number; resetAt: number; emergencyCeilingPercent: number };
}
export interface GoalBudgetMetric {
	used: number;
	normalCeiling: number;
	emergencyCeiling: number;
	normalHeadroom: number;
	emergencyHeadroom: number;
	/** Observed units/hour, not a completion estimate. Codex is shared quota. */
	pacePerHour?: number;
	shared: boolean;
	resetAt?: number;
	windowElapsedPercent?: number;
}
export interface GoalCodexCheckpoint { usedPercent: number; resetAt: number; observedAt: number }
export interface GoalBudgetEvaluation {
	decision: "continue" | "pause";
	reasons: string[];
	bedrock?: GoalBudgetMetric;
	codex?: GoalBudgetMetric;
	/** Persist for pacing/reset observations only, never replace the launch baseline. */
	codexObservation?: GoalCodexCheckpoint;
	codexReset?: GoalCodexCheckpoint & { previousResetAt: number };
	suggestion: "ordinary" | "small-bounded-step" | "restore-buildability-only" | "pause";
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function validateGoalBudgetLimits(limits: GoalBudgetLimits): void {
	if (limits.bedrockUsd !== undefined && (!finite(limits.bedrockUsd) || limits.bedrockUsd <= 0 || !finite(limits.bedrockUsd + limits.bedrockUsd / 10))) throw new Error("Bedrock budget must be a finite positive dollar amount.");
	if (limits.codexPercent !== undefined && (!finite(limits.codexPercent) || limits.codexPercent <= 0 || limits.codexPercent > 100)) throw new Error("Codex budget must be an absolute weekly ceiling above 0 and at most 100 percent.");
}

/** Validate a JSON-persisted launch snapshot without refreshing its reserve. */
export function restoreGoalBudgetBaseline(value: unknown): GoalBudgetBaseline | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const row = value as Record<string, unknown>;
	if (!finite(row.capturedAt) || !row.limits || typeof row.limits !== "object" || Array.isArray(row.limits)) return;
	const rawLimits = row.limits as Record<string, unknown>;
	if ((rawLimits.bedrockUsd !== undefined && !finite(rawLimits.bedrockUsd)) || (rawLimits.codexPercent !== undefined && !finite(rawLimits.codexPercent))) return;
	const limits: GoalBudgetLimits = { ...(finite(rawLimits.bedrockUsd) ? { bedrockUsd: rawLimits.bedrockUsd } : {}), ...(finite(rawLimits.codexPercent) ? { codexPercent: rawLimits.codexPercent } : {}) };
	try { validateGoalBudgetLimits(limits); } catch { return; }
	let codex: GoalBudgetBaseline["codex"];
	if (limits.codexPercent !== undefined) {
		if (!row.codex || typeof row.codex !== "object" || Array.isArray(row.codex)) return;
		const raw = row.codex as Record<string, unknown>;
		if (!finite(raw.usedPercent) || raw.usedPercent < 0 || raw.usedPercent > 100 || !finite(raw.resetAt) || raw.resetAt <= row.capturedAt
			|| raw.emergencyCeilingPercent !== Math.min(100, limits.codexPercent + Math.ceil(Math.max(0, limits.codexPercent - raw.usedPercent) / 10))) return;
		codex = { usedPercent: raw.usedPercent, resetAt: raw.resetAt, emergencyCeilingPercent: Number(raw.emergencyCeilingPercent) };
	}
	return { capturedAt: row.capturedAt, limits, ...(codex ? { codex } : {}) };
}

/** Capture only at launch after fresh usage. Throws rather than treating
 * unavailable observations as zero. Persist before any budgeted work starts.
 */
export function captureGoalBudgetBaseline(limits: GoalBudgetLimits, usage: GoalUsage, capturedAt = Math.min(Date.now(), ...[limits.bedrockUsd === undefined ? undefined : usage.bedrock.observedAt, limits.codexPercent === undefined ? undefined : usage.codex.observedAt].filter(finite))): GoalBudgetBaseline {
	validateGoalBudgetLimits(limits);
	if (!finite(capturedAt)) throw new Error("Invalid budget capture time.");
	if (limits.bedrockUsd !== undefined && usage.bedrock.status !== "available") throw new Error("Bedrock usage is unavailable; pause before launch.");
	let codex: GoalBudgetBaseline["codex"];
	if (limits.codexPercent !== undefined) {
		if (usage.codex.status !== "available" || !finite(usage.codex.usedPercent) || usage.codex.usedPercent < 0 || usage.codex.usedPercent > 100 || !finite(usage.codex.resetAt) || usage.codex.resetAt <= capturedAt)
			throw new Error("Codex weekly usage is unavailable; pause before launch.");
		const remaining = Math.max(0, limits.codexPercent - usage.codex.usedPercent);
		codex = { usedPercent: usage.codex.usedPercent, resetAt: usage.codex.resetAt, emergencyCeilingPercent: Math.min(100, limits.codexPercent + Math.ceil(remaining / 10)) };
	}
	return { capturedAt, limits: { ...limits }, ...(codex ? { codex } : {}) };
}
function metric(used: number, normalCeiling: number, emergencyCeiling: number, elapsed: number, delta: number, shared: boolean): GoalBudgetMetric {
	return { used, normalCeiling, emergencyCeiling, normalHeadroom: Math.max(0, normalCeiling - used), emergencyHeadroom: Math.max(0, emergencyCeiling - used), ...(elapsed > 0 ? { pacePerHour: delta / (elapsed / 3_600_000) } : {}), shared };
}

/** This is a checkpoint, not an atomic spend reservation for concurrent calls.
 * Ordinary work never uses reserve. The caller may opt into reserve ONLY while
 * restoring buildability, and must still bound each next call/delegation.
 */
export function evaluateGoalBudget(limits: GoalBudgetLimits, baseline: GoalBudgetBaseline, usage: GoalUsage, options: { restoringBuildability?: boolean; now?: number; previousCodex?: GoalCodexCheckpoint } = {}): GoalBudgetEvaluation {
	const result: GoalBudgetEvaluation = { decision: "continue", reasons: [], suggestion: "ordinary" };
	const pause = (reason: string) => { result.decision = "pause"; result.reasons.push(reason); result.suggestion = "pause"; };
	try { validateGoalBudgetLimits(limits); } catch (error) { pause(error instanceof Error ? error.message : "Invalid budget limits."); return result; }
	const now = options.now ?? Date.now();
	if (!finite(now) || !finite(baseline.capturedAt) || now < baseline.capturedAt || baseline.limits.bedrockUsd !== limits.bedrockUsd || baseline.limits.codexPercent !== limits.codexPercent) {
		pause("Budget baseline or limits changed; pause for an explicit new baseline."); return result;
	}
	const check = (name: string, value: GoalBudgetMetric) => {
		if (value.used >= value.emergencyCeiling) pause(`${name} emergency ceiling reached.`);
		else if (value.used >= value.normalCeiling) {
			if (!options.restoringBuildability) pause(`${name} normal ceiling reached; reserve is only for restoring buildability.`);
			else if (result.decision !== "pause") result.suggestion = "restore-buildability-only";
		} else if (value.normalHeadroom <= (value.normalCeiling - (name === "Codex" ? baseline.codex?.usedPercent ?? 0 : 0)) / 10 && result.suggestion === "ordinary") result.suggestion = "small-bounded-step";
	};
	if (limits.bedrockUsd !== undefined) {
		const observed = usage.bedrock;
		if (observed.status !== "available") pause(observed.reason);
		else if (!finite(observed.usd) || observed.usd < 0 || !finite(observed.observedAt) || observed.observedAt < baseline.capturedAt || observed.observedAt > now) pause("Bedrock usage observation is invalid or predates this run.");
		else {
			result.bedrock = metric(observed.usd, limits.bedrockUsd, limits.bedrockUsd + limits.bedrockUsd / 10, observed.observedAt - baseline.capturedAt, observed.usd, false);
			check("Bedrock", result.bedrock);
		}
	}
	if (limits.codexPercent !== undefined) {
		const observed = usage.codex, start = baseline.codex;
		const expectedReserve = start ? Math.min(100, limits.codexPercent + Math.ceil(Math.max(0, limits.codexPercent - start.usedPercent) / 10)) : undefined;
		if (observed.status !== "available") pause(observed.reason);
		else if (!start || !finite(start.usedPercent) || start.usedPercent < 0 || start.usedPercent > 100 || start.emergencyCeilingPercent !== expectedReserve
			|| !finite(observed.usedPercent) || observed.usedPercent < 0 || observed.usedPercent > 100 || !finite(observed.resetAt) || now >= observed.resetAt
			|| !finite(observed.observedAt) || observed.observedAt < baseline.capturedAt || observed.observedAt > now || observed.windowSeconds !== 604800)
			pause("Codex launch baseline or current weekly quota/reset data is invalid or expired.");
		else {
			const previous = options.previousCodex;
			const reference = previous && finite(previous.usedPercent) && previous.usedPercent >= 0 && previous.usedPercent <= 100 && finite(previous.resetAt) && finite(previous.observedAt) && previous.observedAt >= baseline.capturedAt && previous.observedAt <= observed.observedAt
				? previous : { usedPercent: start.usedPercent, resetAt: start.resetAt, observedAt: baseline.capturedAt };
			const reset = observed.resetAt !== reference.resetAt;
			result.codexObservation = { usedPercent: observed.usedPercent, resetAt: observed.resetAt, observedAt: observed.observedAt };
			if (reset) result.codexReset = { ...result.codexObservation, previousResetAt: reference.resetAt };
			if (!reset && observed.usedPercent < reference.usedPercent) pause("Codex usage regressed without a valid reset observation; fetch fresh weekly quota.");
			result.codex = { ...metric(observed.usedPercent, limits.codexPercent, start.emergencyCeilingPercent, reset ? 0 : observed.observedAt - reference.observedAt, Math.max(0, observed.usedPercent - reference.usedPercent), true), resetAt: observed.resetAt,
				windowElapsedPercent: Math.max(0, Math.min(100, 100 * (1 - (observed.resetAt - now) / (604800 * 1000)))) };
			check("Codex", result.codex);
		}
	}
	if (options.restoringBuildability && result.decision === "continue") result.suggestion = "restore-buildability-only";
	return result;
}
