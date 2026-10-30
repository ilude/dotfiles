import { describe, expect, it } from "vitest";
import { captureGoalBudgetBaseline, evaluateGoalBudget, restoreGoalBudgetBaseline, validateGoalBudgetLimits } from "../lib/goal/budget.ts";
import type { GoalUsage } from "../lib/goal/usage.ts";

const start = 1_000_000, resetAt = start + 604800_000;
function usage(usd = 0, percent = 6, observedAt = start): GoalUsage {
	return { bedrock: { status: "available", usd, responses: 1, observedAt }, codex: { status: "available", usedPercent: percent, resetAt, windowSeconds: 604800, observedAt } };
}
describe("goal whole-run budgets", () => {
	it("allows either, both, or no configured budget and rejects invalid limits", () => {
		for (const limits of [{}, { bedrockUsd: 1 }, { codexPercent: 15 }, { bedrockUsd: 1, codexPercent: 15 }]) expect(() => validateGoalBudgetLimits(limits)).not.toThrow();
		for (const limits of [{ bedrockUsd: 0 }, { bedrockUsd: -1 }, { bedrockUsd: Infinity }, { bedrockUsd: Number.MAX_VALUE }, { codexPercent: NaN }, { codexPercent: 101 }, { codexPercent: 0 }]) expect(() => validateGoalBudgetLimits(limits)).toThrow();
	});
	it("uses an absolute Codex weekly ceiling with a fixed rounded point reserve", () => {
		const limits = { codexPercent: 15 }, baseline = captureGoalBudgetBaseline(limits, usage(), start);
		expect(baseline.codex?.emergencyCeilingPercent).toBe(16);
		const evaluate = (percent: number, restoringBuildability = false) => evaluateGoalBudget(limits, baseline, usage(0, percent), { now: start, restoringBuildability });
		expect(evaluate(14).decision).toBe("continue");
		expect(evaluate(15).decision).toBe("pause");
		expect(evaluate(15, true)).toMatchObject({ decision: "continue", suggestion: "restore-buildability-only", codex: { normalHeadroom: 0, emergencyHeadroom: 1, shared: true } });
		expect(evaluate(16, true).decision).toBe("pause");
		expect(evaluate(17, true).decision).toBe("pause");
		expect(captureGoalBudgetBaseline({ codexPercent: 20 }, usage(0, 6), start).codex?.emergencyCeilingPercent).toBe(22);
		expect(captureGoalBudgetBaseline({ codexPercent: 100 }, usage(), start).codex?.emergencyCeilingPercent).toBe(100);
	});
	it("reserves at most 110% dollars for buildability only, with exact boundaries", () => {
		const limits = { bedrockUsd: 10 }, baseline = captureGoalBudgetBaseline(limits, usage(), start);
		for (const [usd, restore, decision] of [[9.99, false, "continue"], [10, false, "pause"], [10, true, "continue"], [10.999, true, "continue"], [11, true, "pause"]] as const)
			expect(evaluateGoalBudget(limits, baseline, usage(usd), { restoringBuildability: restore, now: start }).decision).toBe(decision);
		expect(evaluateGoalBudget(limits, baseline, usage(9.1), { now: start }).suggestion).toBe("small-bounded-step");
	});
	it("does not reset total, reserve, or baseline on durable roundtrip", () => {
		const limits = { bedrockUsd: 10, codexPercent: 15 }, baseline = JSON.parse(JSON.stringify(captureGoalBudgetBaseline(limits, usage(), start)));
		expect(restoreGoalBudgetBaseline(baseline)).toEqual(baseline);
		expect(restoreGoalBudgetBaseline({ ...baseline, capturedAt: "yesterday" })).toBeUndefined();
		expect(evaluateGoalBudget(limits, baseline, usage(10, 15), { now: start }).decision).toBe("pause");
		expect(evaluateGoalBudget({ ...limits, bedrockUsd: 20 }, baseline, usage(), { now: start }).decision).toBe("pause");
		baseline.codex.emergencyCeilingPercent = 17;
		expect(restoreGoalBudgetBaseline(baseline)).toBeUndefined();
		expect(evaluateGoalBudget(limits, baseline, usage(), { now: start }).decision).toBe("pause");
	});
	it("pauses configured unavailable usage, not unrelated unavailable providers", () => {
		const observed = usage(); observed.codex = { status: "unavailable", reason: "quota unavailable", observedAt: start };
		expect(() => captureGoalBudgetBaseline({ codexPercent: 15 }, observed, start)).toThrow();
		const baseline = captureGoalBudgetBaseline({ bedrockUsd: 1 }, observed, start);
		expect(evaluateGoalBudget({ bedrockUsd: 1 }, baseline, observed, { now: start }).decision).toBe("continue");
		observed.bedrock = { status: "unavailable", reason: "accounting failed", observedAt: start };
		expect(evaluateGoalBudget({ bedrockUsd: 1 }, baseline, observed, { now: start })).toMatchObject({ decision: "pause", reasons: ["accounting failed"] });
	});
	it("pauses missing reset data, expiration, unexplained regression and observations before launch", () => {
		const limits = { codexPercent: 15 }, baseline = captureGoalBudgetBaseline(limits, usage(), start);
		const invalidReset = usage(); if (invalidReset.codex.status === "available") invalidReset.codex.resetAt = NaN;
		for (const observed of [invalidReset, usage(0, 5), usage(0, 6, start - 1)]) expect(evaluateGoalBudget(limits, baseline, observed, { now: start }).decision).toBe("pause");
		expect(evaluateGoalBudget(limits, baseline, usage(), { now: resetAt }).decision).toBe("pause");
	});
	it("observes valid weekly resets without changing absolute ceilings or launch reserve", () => {
		const limits = { codexPercent: 15 }, baseline = captureGoalBudgetBaseline(limits, usage(), start);
		const nextWindow = usage(0, 2, resetAt + 1000);
		if (nextWindow.codex.status === "available") nextWindow.codex.resetAt = resetAt + 604800_000;
		const result = evaluateGoalBudget(limits, baseline, nextWindow, { now: resetAt + 1000 });
		expect(result).toMatchObject({ decision: "continue", codex: { normalCeiling: 15, emergencyCeiling: 16, normalHeadroom: 13 }, codexReset: { previousResetAt: resetAt, resetAt: resetAt + 604800_000, usedPercent: 2 } });
		expect(result.codex?.pacePerHour).toBeUndefined();
		expect(baseline.codex?.emergencyCeilingPercent).toBe(16);
		const later = structuredClone(nextWindow); if (later.codex.status === "available") { later.codex.usedPercent = 4; later.codex.observedAt += 3600_000; }
		const continued = evaluateGoalBudget(limits, baseline, later, { now: resetAt + 3600_000 + 1000, previousCodex: result.codexObservation });
		expect(continued.codexReset).toBeUndefined(); expect(continued.codex?.pacePerHour).toBe(2);
		if (later.codex.status === "available") later.codex.usedPercent = 15;
		expect(evaluateGoalBudget(limits, baseline, later, { now: resetAt + 3600_000 + 1000 }).decision).toBe("pause");
		expect(evaluateGoalBudget(limits, baseline, later, { now: resetAt + 3600_000 + 1000, restoringBuildability: true }).decision).toBe("continue");
		if (later.codex.status === "available") later.codex.usedPercent = 16;
		expect(evaluateGoalBudget(limits, baseline, later, { now: resetAt + 3600_000 + 1000, restoringBuildability: true }).decision).toBe("pause");
	});
	it("reports observed pace and headroom, never a completion prediction", () => {
		const limits = { bedrockUsd: 10, codexPercent: 15 }, baseline = captureGoalBudgetBaseline(limits, usage(), start);
		const result = evaluateGoalBudget(limits, baseline, usage(2, 8, start + 3600_000), { now: start + 3600_000 });
		expect(result.bedrock).toMatchObject({ pacePerHour: 2, normalHeadroom: 8, shared: false });
		expect(result.codex).toMatchObject({ pacePerHour: 2, normalHeadroom: 7, shared: true });
		expect(result.codex?.windowElapsedPercent).toBeCloseTo(100 / 168);
	});
});
