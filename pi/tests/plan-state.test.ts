import { describe, expect, it } from "vitest";
import { parseLinkedPlan } from "../lib/plan-state.ts";

describe("linked plan state", () => {
	it("requires every required executable task and ignores explicit optional work", () => {
		const plan = parseLinkedPlan(
			"plan.md",
			[
				"# Plan",
				"",
				"- [x] **T1: Completed requirement**",
				"  - State: complete",
				"- [ ] **T2: Remaining requirement**",
				"  - State: blocked",
				"- [ ] **T3: Deferred optional work**",
				"  - Optional: true",
			].join("\n"),
		);

		expect(plan.complete).toBe(false);
		expect(plan.blockers).toEqual(["T2 (blocked) is not complete"]);
		expect(plan.tasks.find((task) => task.key === "T3")?.required).toBe(false);
	});

	it("rejects a checked task whose explicit state is still nonterminal", () => {
		const plan = parseLinkedPlan(
			"plan.md",
			"# Plan\n\n- [x] **T1: Still executing**\n  - State: running\n",
		);
		expect(plan.complete).toBe(false);
		expect(plan.blockers).toEqual(["T1 (running) is not terminal"]);
	});

	it("parses dependencies and rejects invalid task graphs", () => {
		const plan = parseLinkedPlan(
			"plan.md",
			[
				"- [ ] **T1: First**",
				"- [ ] **T2: Second**",
				"  - Depends on: T1",
			].join("\n"),
		);
		expect(plan.tasks[1]?.dependsOn).toEqual(["T1"]);
		expect(() =>
			parseLinkedPlan(
				"plan.md",
				"- [ ] **T1: First**\n- [ ] **T1: Duplicate**\n",
			),
		).toThrow("duplicate plan task key");
		expect(() =>
			parseLinkedPlan(
				"plan.md",
				"- [ ] **T1: First**\n  - Depends on: T2\n",
			),
		).toThrow("missing dependency");
		expect(() =>
			parseLinkedPlan(
				"plan.md",
				[
					"- [ ] **T1: First**",
					"  - Depends on: T2",
					"- [ ] **T2: Second**",
					"  - Depends on: T1",
				].join("\n"),
			),
		).toThrow("dependency cycle");
	});

	it("rejects a plan without an executable checklist", () => {
		const plan = parseLinkedPlan("plan.md", "# Notes only\n");
		expect(plan.complete).toBe(false);
		expect(plan.blockers).toEqual([
			"plan has no executable task checklist",
		]);
	});
});
