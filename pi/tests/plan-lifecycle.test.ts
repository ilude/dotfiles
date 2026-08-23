import { describe, expect, it } from "vitest";
import {
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

describe("plan lifecycle", () => {
	it("keeps risk telemetry out of gating stages and reaches ready", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		state = transitionPlanLifecycle(state, {
			action: "risk",
			risk: "low",
			inspectedBy: "primary",
		});

		expect(state.stage).toBe("draft");
		state = transitionPlanLifecycle(state, { action: "ready" });
		expect(state).toMatchObject({ stage: "ready", risk: "low" });
	});

	it("preserves bounded material review telemetry and supports one retry", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		state = transitionPlanLifecycle(state, {
			action: "risk",
			risk: "material",
			inspectedBy: "primary",
		});
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "adversary",
			concern: "runtime boundary",
			outcome: "supported",
			strategy: "trace the runtime path",
		});
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "specialist",
			concern: "extension API",
			outcome: "failed",
			strategy: "inspect declarations",
		});
		expect(state.stage).toBe("draft");
		expect(() =>
			transitionPlanLifecycle(state, {
				action: "review",
				role: "adversary",
				concern: "runtime boundary",
				outcome: "supported",
				strategy: "repeat the runtime path",
			}),
		).toThrow("cannot be run again");
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "specialist",
			concern: "extension API",
			outcome: "covered",
			strategy: "inspect installed source",
		});
		expect(state.reviewers).toHaveLength(3);
		expect(state.stage).toBe("draft");
	});

	it("blocks with a concise concern and resumes from a restored legacy stage", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
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
