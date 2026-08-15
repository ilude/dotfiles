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
	it("moves a low-risk plan through inspection and readiness without reviewers", () => {
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
		state = transitionPlanLifecycle(state, { action: "settle_review" });
		state = transitionPlanLifecycle(state, {
			action: "adjudicate",
			dispositions: [],
		});
		state = transitionPlanLifecycle(state, { action: "accept" });
		state = transitionPlanLifecycle(state, {
			action: "inspect",
			inspectedBy: "primary",
		});
		state = transitionPlanLifecycle(state, { action: "ready" });

		expect(state).toMatchObject({
			stage: "ready",
			risk: "low",
			reviewers: [],
			repair: "none",
		});
	});

	it("bounds material review, retries only a failed perspective, and allows one repair", () => {
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
			outcome: "failed",
			strategy: "inspect declarations",
		});
		expect(() => transitionPlanLifecycle(state, { action: "settle_review" })).toThrow(
			"failed perspective",
		);
		expect(() =>
			transitionPlanLifecycle(state, {
				action: "review",
				role: "specialist",
				concern: "extension API",
				outcome: "covered",
				strategy: "inspect installed source",
			}),
		).not.toThrow();
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "specialist",
			concern: "extension API",
			outcome: "covered",
			strategy: "inspect installed source",
		});
		state = transitionPlanLifecycle(state, { action: "settle_review" });
		state = transitionPlanLifecycle(state, {
			action: "adjudicate",
			dispositions: [
				{ role: "adversary", disposition: "required_repair" },
				{ role: "specialist", disposition: "no_change" },
			],
		});
		state = transitionPlanLifecycle(state, { action: "repair" });
		expect(() => transitionPlanLifecycle(state, { action: "repair" })).toThrow(
			"invalid while",
		);
		expect(state).toMatchObject({ stage: "repaired", repair: "applied" });
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
			.replace("  - Verify: `pnpm test example.test.ts`", "");
		const validation = validatePlanContract(invalid, path);
		expect(validation.valid).toBe(false);
		expect(validation.errors).toEqual(
			expect.arrayContaining([
				"Plan frontmatter status must be ready.",
				"T1 is missing Verify:",
			]),
		);
	});
});
