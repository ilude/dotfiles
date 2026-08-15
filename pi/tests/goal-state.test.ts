import { describe, expect, it } from "vitest";
import {
	beginGoalAttempt,
	createGoalWorkItem,
	type GoalFailureOutcome,
	recordGoalOutcome,
	recordGoalReEvaluation,
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

describe("unattended goal recovery", () => {
	it("does not charge pre-execution, denied, cancelled, or valid not-found outcomes", () => {
		let item = createGoalWorkItem("T1", "task-1");
		const excluded: GoalFailureOutcome[] = [
			"capability_rejected",
			"cancelled",
			"damage_control_denied",
			"infrastructure_failure",
			"not_found",
		];
		for (let index = 0; index < excluded.length; index += 1) {
			item = recordGoalOutcome(begin(item, index), excluded[index]);
		}
		expect(item.qualifyingFailures).toBe(0);
		expect(item.phase).toBe("ordinary");
	});

	it("requires strategy-changing recovery and reaches needs_operator after two failures", () => {
		let item = createGoalWorkItem("T1", "task-1");
		for (let index = 0; index < 20; index += 1)
			item = recordGoalOutcome(begin(item, index), "schema_invalid");
		expect(item.phase).toBe("re_evaluation_required");
		expect(() => begin(item, 21)).toThrow("re-evaluation");

		item = recordGoalReEvaluation(item, {
			evidence: "The schema evidence is incomplete.",
			assumptions: "The original partition may be invalid.",
			strategy: "Change the partition and validator.",
			at: "2026-08-15T00:01:00.000Z",
		});
		expect(() => begin(item, 21)).toThrow("suspended ordinary strategy");
		item = recordGoalOutcome(
			begin(item, 21, { inputPartition: "smaller ranges" }),
			"verifier_contradiction",
		);
		expect(() =>
			begin(item, 22, { inputPartition: "smaller ranges" }),
		).toThrow("prior recovery");
		item = recordGoalOutcome(
			begin(item, 22, { validationMethod: "independent fixture" }),
			"error",
		);
		expect(item.phase).toBe("needs_operator");
		expect(item.recoveryStrategies).toHaveLength(2);
	});
});
