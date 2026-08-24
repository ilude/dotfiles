import { describe, expect, it } from "vitest";
import {
	canonicalPlanPathFromInput,
	createPlanLifecycleSnapshot,
	transitionPlanLifecycle,
	validatePlanContract,
} from "../lib/workflow-commands/plan-lifecycle.ts";

function readyPlan(path = ".specs/example/plan.md"): string {
	return `---
created: 2026-08-15
status: ready
completed:
---

# Plan: Example

## Objective

Deliver the example.

## Completion Evidence

- Evidence: The example works through its supported entrypoint.
- Fails when: The supported entrypoint does not produce the expected result.

## Boundaries

- In scope: Example.
- Out of scope: Other work.
- Preserve: Existing behavior.
- Assumptions: None.

## Tasks

- [ ] **T1: Deliver example**
  - Files: \`src/example.ts\`
  - Change: Implement the example.
  - Done when: The example works.
  - Verify: \`pnpm test example.test.ts\`

## Validation

- [ ] Focused check: \`pnpm test example.test.ts\`
  - Expected: The example passes.

## Retention

Keep incomplete work at this path. After completion, /do-it archives this directory to \`.specs/archive/example/\`.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: \`/do-it ${path}\`
`;
}

function reviewedDraft() {
	let state = createPlanLifecycleSnapshot("invocation", "example");
	state = transitionPlanLifecycle(state, {
		action: "draft",
		planPath: ".specs/example/plan.md",
	});
	for (const review of [
		{ role: "adversary" as const, concern: "runtime boundary", strategy: "trace the runtime path" },
		{ role: "specialist" as const, concern: "extension API", strategy: "inspect installed declarations" },
		{ role: "subtractive" as const, concern: "overengineering and churn", strategy: "review the repaired plan cold" },
	]) {
		state = transitionPlanLifecycle(state, {
			action: "review",
			...review,
			outcome: "covered",
		});
	}
	return state;
}

describe("plan lifecycle", () => {
	it("accepts only a canonical path with optional leading @ and bounded punctuation", () => {
		expect(canonicalPlanPathFromInput("@.specs/workflow-fixture/plan.md.")).toBe(".specs/workflow-fixture/plan.md");
		expect(canonicalPlanPathFromInput(".specs/workflow-fixture/plan.md!  ")).toBe(".specs/workflow-fixture/plan.md");
		expect(canonicalPlanPathFromInput("please execute .specs/workflow-fixture/plan.md!")).toBeUndefined();
		expect(canonicalPlanPathFromInput("@.specs/workflow-fixture/plan.md extra")).toBeUndefined();
		expect(canonicalPlanPathFromInput("@.specs/workflow-fixture/plan.md.....")).toBeUndefined();
	});

	it("requires multiple subject-matter reviews followed by one subtractive review", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		expect(() => transitionPlanLifecycle(state, { action: "ready" })).toThrow(
			"at least two completed subject-matter reviews",
		);
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "adversary",
			concern: "runtime boundary",
			outcome: "supported",
			strategy: "trace the runtime path",
		});
		expect(() => transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			concern: "overengineering",
			outcome: "covered",
			strategy: "review the plan cold",
		})).toThrow("at least two completed subject-matter reviews");

		state = reviewedDraft();
		expect(transitionPlanLifecycle(state, { action: "ready" }).stage).toBe("ready");
	});

	it("allows quick plans to become ready without review gates", () => {
		let state = createPlanLifecycleSnapshot("invocation", "small change", "quick");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		const ready = transitionPlanLifecycle(state, { action: "ready" });
		expect(ready).toMatchObject({ mode: "quick", stage: "ready", reviewers: [] });
	});

	it("allows distinct subject-matter experts and closes review after the subtractive pass", () => {
		const state = reviewedDraft();
		expect(state.reviewers).toHaveLength(3);
		expect(() => transitionPlanLifecycle(state, {
			action: "review",
			role: "specialist",
			concern: "test architecture",
			outcome: "covered",
			strategy: "inspect test seams",
		})).toThrow("cannot continue after the final subtractive review");
	});

	it("requires supported findings to be repaired and bounds subject-matter review at four perspectives", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, { action: "draft", planPath: ".specs/example/plan.md" });
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "adversary",
			concern: "runtime boundary",
			outcome: "supported",
			strategy: "trace runtime",
		});
		for (const [concern, role] of [
			["extension API", "specialist"],
			["validation", "adversary"],
			["operator behavior", "proponent"],
		] as const) {
			state = transitionPlanLifecycle(state, {
				action: "review",
				role,
				concern,
				outcome: "covered",
				strategy: `review ${concern}`,
			});
		}
		expect(() => transitionPlanLifecycle(state, {
			action: "review",
			role: "specialist",
			concern: "fifth domain",
			outcome: "covered",
			strategy: "review fifth domain",
		})).toThrow("cannot exceed four perspectives");
		expect(() => transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			concern: "overengineering",
			outcome: "covered",
			strategy: "review cold",
		})).toThrow("must be repaired");
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "adversary",
			concern: "runtime boundary",
			outcome: "covered",
			strategy: "verify runtime repair",
		});
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			concern: "overengineering",
			outcome: "supported",
			strategy: "review cold",
		});
		expect(() => transitionPlanLifecycle(state, { action: "ready" })).toThrow("must be repaired");
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			concern: "overengineering",
			outcome: "covered",
			strategy: "verify subtractive repair",
		});
		expect(transitionPlanLifecycle(state, { action: "ready" }).stage).toBe("ready");
	});

	it("blocks with a concise concern and resumes from a restored legacy stage", () => {
		let state = reviewedDraft();
		state = transitionPlanLifecycle(state, {
			action: "blocked",
			concern: "Need the operator's deployment choice.",
		});
		expect(state).toMatchObject({
			stage: "blocked",
			blockedConcern: "Need the operator's deployment choice.",
		});
		state = transitionPlanLifecycle(state, { action: "ready" });
		expect(state.stage).toBe("ready");

		const restored = {
			...state,
			stage: "operator_decision" as const,
		};
		expect(transitionPlanLifecycle(restored, { action: "ready" }).stage).toBe(
			"ready",
		);
	});

	it("bounds diagnostics and validates dependency syntax before execution", () => {
		const path = ".specs/example/plan.md";
		const invalid = readyPlan(path).replace(
			"  - Verify: `pnpm test example.test.ts`",
			"  - Depends on: T2",
		);
		const validation = validatePlanContract(invalid, path);
		expect(validation.valid).toBe(false);
		expect(validation.errors).toContain(
			"Plan dependency syntax: plan task T1 has missing dependency: T2",
		);

		const noisy = Array.from(
			{ length: 40 },
			(_, index) => `## Missing ${index}`,
		).join("\n");
		expect(
			validatePlanContract(noisy, "plan.md").errors.length,
		).toBeLessThanOrEqual(8);
	});

	it("keeps ready as the default status gate and widens only execution preflight", () => {
		const path = ".specs/example/plan.md";
		const statuses = ["ready", "in_progress", "in-progress", "complete", "completed"];
		for (const status of statuses) {
			const content = readyPlan(path).replace("status: ready", `status: ${status}`);
			expect(validatePlanContract(content, path, "execution-preflight").valid).toBe(true);
		}
		expect(validatePlanContract(readyPlan(path).replace("status: ready", "status: complete"), path).errors).toContain(
			"Plan frontmatter status must be ready.",
		);
		const invalid = readyPlan(path).replace("status: ready", "status: paused");
		expect(validatePlanContract(invalid, path, "execution-preflight").errors).toContain(
			"Plan frontmatter status must be ready, in_progress, in-progress, complete, or completed.",
		);
	});

	it("validates the executable plan contract", () => {
		const path = ".specs/example/plan.md";
		expect(validatePlanContract(readyPlan(path), path)).toEqual({
			valid: true,
			errors: [],
			taskKeys: ["T1"],
		});
		const invalid = readyPlan(path)
			.replace("status: ready", "status: draft")
			.replace(
				"- Fails when: The supported entrypoint does not produce the expected result.\n",
				"",
			)
			.replace("  - Verify: `pnpm test example.test.ts`", "");
		const validation = validatePlanContract(invalid, path);
		expect(validation.valid).toBe(false);
		expect(validation.errors).toEqual(
			expect.arrayContaining([
				"Completion Evidence is missing Fails when:.",
				"Plan frontmatter status must be ready.",
				"T1 is missing Verify:",
			]),
		);
	});
});
