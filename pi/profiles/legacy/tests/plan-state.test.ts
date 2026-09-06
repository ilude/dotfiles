import { describe, expect, it } from "vitest";
import { parseLinkedPlan, selectNextPlanTask } from "../lib/plan-state.ts";

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

	it("parses dependencies, completion checks, and rejects invalid task graphs", () => {
		const plan = parseLinkedPlan(
			"plan.md",
			[
				"- [ ] **T1: First**",
				"- [ ] **T2: Second**",
				"  - Depends on: T1",
				"  - Done when: The second result is observable.",
				"  - Verify: Run the focused second-result check.",
			].join("\n"),
		);
		expect(plan.tasks[1]).toMatchObject({
			dependsOn: ["T1"],
			doneWhen: "The second result is observable.",
			verify: "Run the focused second-result check.",
		});
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

	it("parses live metadata and stops task selection at the effective attempt cap", () => {
		const content = [
			"- [ ] **T1: Exercise one live behavior**",
			"  - Verify: live Observe one response, then cleanup the session.",
			"  - Max attempts: 2",
			"  - Session: isolated-herdr",
			"  - Terminal outcomes: supported | rejected | blocked",
			"",
			"## Live attempt ledger",
			"",
			"| Task | Attempt | Preconditions | Result | Cleanup | Disposition |",
			"| --- | --- | --- | --- | --- | --- |",
			"| T1 | 1 | ready | blocked | complete | retry allowed |",
		].join("\n");
		let plan = parseLinkedPlan("plan.md", content);
		expect(plan.tasks[0]).toMatchObject({
			verificationType: "live",
			maxAttempts: 2,
			session: "isolated-herdr",
			terminalOutcomes: ["supported", "rejected", "blocked"],
		});
		expect(selectNextPlanTask(plan)).toMatchObject({ task: { key: "T1" } });

		plan = parseLinkedPlan("plan.md", `${content}\n| T1 | 2 | ready | blocked | complete | cap reached |`);
		expect(selectNextPlanTask(plan).operatorDecision).toContain("T1 has 2 recorded live attempts");

		plan = parseLinkedPlan("plan.md", `${content}\n| T1 | 2 | ready | blocked | complete | Operator authorized by user |`);
		const authorizedSelection = selectNextPlanTask(plan);
		expect(authorizedSelection.task).toMatchObject({ key: "T1" });
		expect(authorizedSelection.operatorDecision).toBeUndefined();
	});

	it("treats a rejected live result as a completing terminal outcome", () => {
		const plan = parseLinkedPlan(
			"plan.md",
			[
				"- [ ] **T1: Evaluate live support**",
				"  - Verify: live Observe support, then cleanup the session.",
				"  - Max attempts: 1",
				"  - Session: isolated-herdr",
				"  - Terminal outcomes: supported | rejected | blocked",
				"## Live attempt ledger",
				"| Task | Attempt | Preconditions | Result | Cleanup | Disposition |",
				"| --- | --- | --- | --- | --- | --- |",
				"| T1 | 1 | ready | rejected | complete | final |",
			].join("\n"),
		);
		expect(plan.complete).toBe(true);
		expect(selectNextPlanTask(plan).task).toBeUndefined();
	});

	it("rejects a plan without an executable checklist", () => {
		const plan = parseLinkedPlan("plan.md", "# Notes only\n");
		expect(plan.complete).toBe(false);
		expect(plan.blockers).toEqual([
			"plan has no executable task checklist",
		]);
	});
});
