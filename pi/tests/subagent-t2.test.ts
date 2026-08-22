import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
	coordinatorBudgetFor,
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
		});
		expect(
			coordinatorBudgetFor({
				...request,
				maxWorkers: 2,
				maxTurns: 12,
				softDeadlineMs: 30_000,
			}),
		).toEqual({ maxWorkers: 2, maxTurns: 12, softDeadlineMs: 30_000 });
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
	});
});
