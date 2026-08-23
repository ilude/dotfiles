import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
	admitCoordinatorDescendants,
	coordinatorBudgetFor,
	formatCoordinatorGaps,
	formatCoordinatorTask,
	DEFAULT_COORDINATOR_MAX_TURNS,
	DEFAULT_COORDINATOR_MAX_WORKERS,
	DEFAULT_COORDINATOR_SOFT_DEADLINE_MS,
	SubagentCoordinateSchema,
} from "../extensions/subagent/contracts.ts";

describe("subagent T2 coordinator budgets", () => {
	it("uses bounded defaults and accepts explicit bounded overrides", () => {
		const request = {
			kind: "coordinator" as const,
			items: [{ agent: "teamlead", task: "coordinate" }],
		};
		expect(coordinatorBudgetFor(request)).toEqual({
			maxWorkers: DEFAULT_COORDINATOR_MAX_WORKERS,
			maxTurns: DEFAULT_COORDINATOR_MAX_TURNS,
			softDeadlineMs: DEFAULT_COORDINATOR_SOFT_DEADLINE_MS,
			hardDeadlineMs: DEFAULT_COORDINATOR_SOFT_DEADLINE_MS * 2,
		});
		expect(
			coordinatorBudgetFor({
				...request,
				maxWorkers: 2,
				maxTurns: 12,
				softDeadlineMs: 30_000,
				hardDeadlineMs: 90_000,
			}),
		).toEqual({
			maxWorkers: 2,
			maxTurns: 12,
			softDeadlineMs: 30_000,
			hardDeadlineMs: 90_000,
		});
		expect(() =>
			coordinatorBudgetFor({ ...request, softDeadlineMs: 30_000, hardDeadlineMs: 30_000 }),
		).toThrow("hardDeadlineMs must be greater than softDeadlineMs");
		expect(() =>
			coordinatorBudgetFor({ ...request, softDeadlineMs: 30_000, hardDeadlineMs: 20_000 }),
		).toThrow("hardDeadlineMs must be greater than softDeadlineMs");
		expect(
			Value.Check(SubagentCoordinateSchema, {
				items: request.items,
				maxWorkers: 9,
			}),
		).toBe(false);
		expect(
			Value.Check(SubagentCoordinateSchema, {
				items: request.items,
				maxTurns: 65,
			}),
		).toBe(false);
		expect(
			Value.Check(SubagentCoordinateSchema, {
				items: [{ agent: "teamlead" }],
			}),
		).toBe(false);
		expect(
			Value.Check(SubagentCoordinateSchema, {
				items: [{ agent: "teamlead", instructions: "" }],
			}),
		).toBe(false);
		// maxWorkers limits descendants, so a coordinator request itself may
		// contain more root items than the descendant budget.
		expect(
			Value.Check(SubagentCoordinateSchema, {
				items: [
					{ agent: "teamlead", task: "one" },
					{ agent: "teamlead", task: "two" },
				],
				maxWorkers: 1,
			}),
		).toBe(true);
	});

	it("includes cooperative deadline and completion instructions", () => {
		const instructions = formatCoordinatorTask("coordinate", {
			maxWorkers: 2,
			maxTurns: 12,
			softDeadlineMs: 30_000,
			hardDeadlineMs: 90_000,
		});
		expect(instructions).toContain("Soft deadline: 30000 ms (advisory");
		expect(instructions).toContain("Hard deadline: 90000 ms (enforced containment");
		expect(instructions).toContain("Every status requires completed (string array), remaining (string array), and validation");
	});

	it("admits only bounded descendants and returns parent-visible gaps", () => {
		const admission = admitCoordinatorDescendants(["one", "two", "three"], 1);
		expect(admission.admitted).toEqual(["one"]);
		expect(admission.gaps).toEqual([
			"subagent budget exhausted: 2 subagent(s) not admitted",
		]);
		expect(formatCoordinatorGaps(admission.gaps)).toBe(
			"\n\nGaps:\n- subagent budget exhausted: 2 subagent(s) not admitted",
		);
	});
});
