import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLinkedPlan, selectNextPlanTask } from "../lib/plan-state.ts";
import {
	canonicalPlanPathFromInput,
	createPlanLifecycleSnapshot,
	transitionPlanLifecycle,
	validatePlanContract,
	getDoItArgumentCompletions,
	refreshDoItPlanCache,
	getCachedDoItPlans,
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

## Execution Strategy

- Parallel work: None
- Smaller-model work: None

## Validation

- [ ] Focused check: \`pnpm test example.test.ts\`
  - Expected: The example passes.

## Retention

Keep incomplete work at this path. After completion, /do-it archives this directory to \`.specs/archive/${path.split("/")[1]}/\`.

## Execution Status

- State: planned, not started
- Blocker: none
- Next: T1
- Resume: \`/do-it ${path}\`
`;
}

function liveReadyPlan(path = ".specs/example/plan.md"): string {
	return readyPlan(path)
		.replace(
			"  - Verify: `pnpm test example.test.ts`",
			[
				"  - Verify: live Observe one result, then cleanup the isolated session.",
				"  - Max attempts: 2",
				"  - Session: isolated-herdr",
				"  - Terminal outcomes: supported | rejected | blocked",
			].join("\n"),
		)
		.replace(
			"## Validation",
			[
				"## Live attempt ledger",
				"",
				"| Task | Attempt | Preconditions | Result | Cleanup | Disposition |",
				"| --- | --- | --- | --- | --- | --- |",
				"",
				"## Validation",
			].join("\n"),
		);
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

	it("allows a low-risk standard plan with only the final necessity review", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			outcome: "no_finding",
		});
		expect(transitionPlanLifecycle(state, { action: "ready" }).stage).toBe("ready");
	});

	it("allows optional review telemetry and does not require exact-text independence", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, { action: "draft", planPath: ".specs/example/plan.md" });
		for (const role of ["adversary", "specialist", "proponent", "adversary"] as const) {
			state = transitionPlanLifecycle(state, { action: "review", role, outcome: "no_finding" });
		}
		expect(() => transitionPlanLifecycle(state, {
			action: "review", role: "specialist", outcome: "no_finding",
		})).toThrow("four records");
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
		})).toThrow("cannot exceed four records");
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

	it("resumes a blocked draft and keeps ready transitions idempotent", () => {
		let state = createPlanLifecycleSnapshot("invocation", "example");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		state = transitionPlanLifecycle(state, {
			action: "blocked",
			concern: "Need an operator decision.",
		});
		expect(() => transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/other/plan.md",
		})).toThrow("cannot resume with a different plan path");
		state = transitionPlanLifecycle(state, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		});
		expect(state).toMatchObject({ stage: "draft", blockedConcern: undefined });
		state = transitionPlanLifecycle(state, {
			action: "review",
			role: "subtractive",
			outcome: "no_finding",
		});
		const ready = transitionPlanLifecycle(state, { action: "ready" });
		expect(transitionPlanLifecycle(ready, { action: "ready" })).toEqual(ready);
		expect(transitionPlanLifecycle(ready, {
			action: "draft",
			planPath: ".specs/example/plan.md",
		})).toEqual(ready);
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

	it("validates live verification metadata without changing untagged plans", () => {
		const planPath = ".specs/example/plan.md";
		expect(validatePlanContract(readyPlan(planPath), planPath).valid).toBe(true);
		expect(validatePlanContract(liveReadyPlan(planPath), planPath).valid).toBe(true);
		for (const field of [
			"  - Max attempts: 2\n",
			"  - Session: isolated-herdr\n",
			"  - Terminal outcomes: supported | rejected | blocked\n",
		]) {
			const validation = validatePlanContract(liveReadyPlan(planPath).replace(field, ""), planPath);
			expect(validation.valid).toBe(false);
			const label = field.trim().replace(/^-\s+/, "").split(":")[0];
			expect(validation.errors.some((error) => error.includes(label))).toBe(true);
		}
		const withoutLedger = liveReadyPlan(planPath).replace(/\n## Live attempt ledger[\s\S]*?\n## Validation/, "\n## Validation");
		expect(validatePlanContract(withoutLedger, planPath).errors).toContain(
			"A plan with live verification must contain ## Live attempt ledger.",
		);
		const multiBehavior = liveReadyPlan(planPath).replace(
			"Observe one result, then cleanup",
			"Observe one result, then inspect another, and then cleanup",
		);
		expect(validatePlanContract(multiBehavior, planPath).valid).toBe(true);
		const modelChoice = liveReadyPlan(planPath).replace("Observe one result", "Observe whether the child voluntarily chooses one result");
		expect(validatePlanContract(modelChoice, planPath).valid).toBe(true);
		const cleaning = liveReadyPlan(planPath).replace("cleanup", "clean owned fixtures");
		expect(validatePlanContract(cleaning, planPath).valid).toBe(true);
	});

	it("leaves repository-boundary prose to plan review rather than keyword matching", () => {
		const planPath = ".specs/example/plan.md";
		const multiRepo = readyPlan(planPath).replace(
			"  - Files: `src/example.ts`",
			"  - Files: `src/example.ts`, `modules/onclave/src/example.ts`",
		);
		expect(validatePlanContract(multiRepo, planPath).valid).toBe(true);
		const declared = multiRepo.replace(
			"- In scope: Example.",
			"- In scope: Example.\n- Repositories: workspace - owner branch main, closeout merge; modules/onclave - owner branch feature/v2-broker-core, closeout commit before parent.",
		);
		expect(validatePlanContract(declared, planPath).valid).toBe(true);
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

	it("treats execution strategy as advisory prose", () => {
		const planPath = ".specs/example/plan.md";
		const withoutStrategy = readyPlan(planPath).replace(/\n## Execution Strategy[\s\S]*?\n## Validation/, "\n## Validation");
		const equivalentProse = readyPlan(planPath).replace(
			"- Smaller-model work: None",
			"- Smaller-model work: T1 can use a bounded helper while final acceptance remains with the root.",
		);
		expect(validatePlanContract(withoutStrategy, planPath).valid).toBe(true);
		expect(validatePlanContract(equivalentProse, planPath).valid).toBe(true);
	});

	it("limits execution preflight to machine-consumed plan state", () => {
		const planPath = ".specs/example/plan.md";
		const concise = readyPlan(planPath)
			.replace(/\n## Objective[\s\S]*?\n## Tasks/, "\n## Tasks")
			.replace(/  - (?:Files|Change|Done when|Verify):.*\n/g, "")
			.replace(/\n## Execution Strategy[\s\S]*$/, "\n");
		expect(validatePlanContract(concise, planPath, "execution-preflight").valid).toBe(true);
		expect(validatePlanContract(concise, planPath, "ready").valid).toBe(true);
		expect(validatePlanContract(concise.replace("status: ready", "status: paused"), planPath, "execution-preflight").valid).toBe(false);
		expect(validatePlanContract(concise.replace("- [ ] **T1:", "- Deliver"), planPath, "execution-preflight").valid).toBe(false);
		const missingDependency = concise.replace(
			"- [ ] **T1: Deliver example**",
			"- [ ] **T1: Deliver example**\n  - Depends on: T2",
		);
		expect(validatePlanContract(missingDependency, planPath, "execution-preflight").errors).toContain(
			"Plan dependency syntax: plan task T1 has missing dependency: T2",
		);
	});

	it("accepts more than sixteen tasks while rejecting cyclic execution graphs", () => {
		const planPath = ".specs/example/plan.md";
		const tasks = Array.from({ length: 20 }, (_, i) => `- [ ] **T${i + 1}: Task ${i + 1}**`).join("\n");
		const content = `---\nstatus: ready\n---\n## Tasks\n${tasks}\n`;
		expect(validatePlanContract(content, planPath).taskKeys).toHaveLength(20);
		expect(validatePlanContract(content, planPath).valid).toBe(true);
		const cyclic = content.replace("**T1: Task 1**", "**T1: Task 1**\n  - Depends on: T2")
			.replace("**T2: Task 2**", "**T2: Task 2**\n  - Depends on: T1");
		expect(validatePlanContract(cyclic, planPath).valid).toBe(false);
	});

	it("keeps final acceptance pending after implementation dependencies finish", () => {
		const planPath = ".specs/final-batch/plan.md";
		const content = `---
status: in_progress
---
## Tasks
- [x] **T1: Author the interface and regression tests**
  - Done when: The interface and tests are authored; execution is deferred to T3.
  - Verify: deterministic Inspect the interface and test cases without executing checks.
- [ ] **T2: Integrate the caller**
  - Depends on: T1
  - Done when: The caller uses the interface; execution is deferred to T3.
  - Verify: deterministic Inspect the integrated caller without executing checks.
- [ ] **T3: Validate the integrated outcome**
  - Depends on: T1, T2
  - Done when: The interface and caller pass the final behavioral checks.
  - Verify: deterministic Run the focused interface and caller tests.
`;
		expect(validatePlanContract(content, planPath, "execution-preflight").valid).toBe(true);
		expect(selectNextPlanTask(parseLinkedPlan(planPath, content)).task?.key).toBe("T2");

		const integrated = content.replace("[ ] **T2:", "[x] **T2:");
		const awaitingValidation = parseLinkedPlan(planPath, integrated);
		expect(awaitingValidation.complete).toBe(false);
		expect(awaitingValidation.blockers).toEqual(["T3 is not complete"]);
		expect(selectNextPlanTask(awaitingValidation).task?.key).toBe("T3");
		expect(validatePlanContract(integrated, planPath, "execution-preflight").valid).toBe(true);

		const validated = parseLinkedPlan(planPath, integrated.replace("[ ] **T3:", "[x] **T3:"));
		expect(validated.complete).toBe(true);
		expect(selectNextPlanTask(validated).task).toBeUndefined();
	});

	it("checks live prerequisites when that task is next, not before earlier implementation", () => {
		const planPath = ".specs/example/plan.md";
		const content = `---\nstatus: ready\n---\n## Tasks\n- [ ] **T1: Implement**\n- [ ] **T2: Evaluate**\n  - Depends on: T1\n  - Verify: live Observe the fixture and clean it.\n`;
		expect(validatePlanContract(content, planPath, "execution-preflight").valid).toBe(true);
		const next = content.replace("[ ] **T1:", "[x] **T1:");
		const validation = validatePlanContract(next, planPath, "execution-preflight");
		expect(validation.valid).toBe(false);
		expect(validation.errors).toContain("T2 live verification requires Max attempts: <positive integer>.");
		expect(validation.errors).toContain("A plan with live verification must contain ## Live attempt ledger.");
	});

	it("matches exact section headings when a prefixed heading appears first", () => {
		const planPath = ".specs/example/plan.md";
		const content = readyPlan(planPath).replace(
			"## Validation\n",
			"## Validation fixtures and timeout ownership\n\nFixture details without a checklist.\n\n## Validation\n",
		);
		expect(validatePlanContract(content, planPath, "execution-preflight").valid).toBe(true);
	});

	it("filters cached native do-it completions and refreshes active plans", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-plan-cache-"));
		const planPath = path.join(root, ".specs", "active-plan", "plan.md");
		fs.mkdirSync(path.dirname(planPath), { recursive: true });
		fs.writeFileSync(planPath, readyPlan(".specs/active-plan/plan.md"));
		const active = refreshDoItPlanCache(root);
		expect(active).toEqual([".specs/active-plan/plan.md"]);
		expect(getCachedDoItPlans(root)).toEqual(active);
		expect(getDoItArgumentCompletions("", active)).toEqual([
			{ value: "--no-clear", label: "--no-clear" },
			{ value: "--in-place", label: "--in-place" },
			{ value: "--no-merge", label: "--no-merge" },
			{ value: ".specs/active-plan/plan.md", label: ".specs/active-plan/plan.md" },
		]);
		expect(getDoItArgumentCompletions("--no-clear ", active)?.map((item) => item.value)).toEqual(["--in-place", "--no-merge", ".specs/active-plan/plan.md"]);
		expect(getDoItArgumentCompletions("--no-clear --in-place ", active)?.map((item) => item.value)).toEqual(["--no-merge", ".specs/active-plan/plan.md"]);
		expect(getDoItArgumentCompletions("--", active)).toBeNull();
		expect(getDoItArgumentCompletions("-- ", active)).toBeNull();
		expect(getDoItArgumentCompletions(".specs/active-plan/plan.md ", active)).toBeNull();
		fs.rmSync(path.join(root, ".specs", "active-plan"), { recursive: true });
		expect(refreshDoItPlanCache(root)).toEqual([]);
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
				"Plan frontmatter status must be ready.",
			]),
		);
	});
});
