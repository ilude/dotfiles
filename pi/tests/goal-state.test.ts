import { describe, expect, it } from "vitest";
import {
	beginGoalAttempt,
	createGoalWorkItem,
	recordGoalOutcome,
	recordGoalReEvaluation,
	recordGoalWait,
} from "../lib/goal-state.ts";

function begin(
	item: ReturnType<typeof createGoalWorkItem>,
	index: number,
	strategy = { agent: "builder" },
) {
	return beginGoalAttempt(item, {
		attemptId: `attempt-${index}`,
		ownerPid: 1,
		ownerInstanceId: "process-1",
		startedAt: `2026-08-15T00:00:${String(index).padStart(2, "0")}.000Z`,
		strategy,
	});
}

function reevaluate(item: ReturnType<typeof createGoalWorkItem>, index: number) {
	return recordGoalReEvaluation(item, {
		evidence: `Observed failure ${index}.`,
		assumptions: "The prior strategy may be invalid.",
		strategy: "Change a deterministic strategy component.",
		at: `2026-08-15T00:01:${String(index).padStart(2, "0")}.000Z`,
	});
}

describe("unattended goal recovery", () => {
	it("requires immediate re-evaluation for every actionable non-success outcome", () => {
		for (const outcome of [
			"error",
			"inconclusive",
			"schema_invalid",
			"verifier_contradiction",
			"infrastructure_failure",
			"not_found",
			"capability_rejected",
			"damage_control_denied",
		] as const) {
			const item = recordGoalOutcome(
				begin(createGoalWorkItem("T1", "task-1"), 1),
				outcome,
			);
			expect(item.phase, outcome).toBe("re_evaluation_required");
			expect(() => begin(item, 2)).toThrow("re-evaluation");
		}
	});

	it("records a typed terminal wait with evidence and operator action", () => {
		const item = recordGoalWait(createGoalWorkItem("T1", "task-1"), {
			reason: "access_or_credential",
			evidence: "The named service rejected the available credential.",
			operatorAction: "Provide access to the named service account.",
			at: "2026-08-15T00:00:00.000Z",
		});
		expect(item.phase).toBe("needs_operator");
		expect(item.wait).toMatchObject({
			reason: "access_or_credential",
			operatorAction: "Provide access to the named service account.",
		});
		expect(() => begin(item, 2)).toThrow("needs operator input");
	});

	it("allows at most two materially different recovery attempts before waiting", () => {
		let item = recordGoalOutcome(
			begin(createGoalWorkItem("T1", "task-1"), 1),
			"schema_invalid",
		);
		item = reevaluate(item, 1);
		expect(() => begin(item, 2)).toThrow("suspended ordinary strategy");
		item = recordGoalOutcome(
			begin(item, 2, { inputPartition: "smaller ranges" }),
			"verifier_contradiction",
		);
		expect(item.phase).toBe("re_evaluation_required");
		item = reevaluate(item, 2);
		expect(() =>
			begin(item, 3, { inputPartition: "smaller ranges" }),
		).toThrow("prior recovery");
		item = recordGoalOutcome(
			begin(item, 3, { validationMethod: "independent fixture" }),
			"error",
		);
		expect(item.phase).toBe("needs_operator");
		expect(item.needsOperatorReason).toContain("recovery_exhausted");
		expect(item.recoveryStrategies).toHaveLength(2);
	});
});
