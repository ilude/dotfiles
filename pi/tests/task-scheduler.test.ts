import { describe, expect, it } from "vitest";
import type { TaskRecordV1 } from "../lib/task-registry.ts";
import {
	criticalPathDepths,
	executionIsReadOnly,
	scheduledTasksConflict,
	scopesOverlap,
	sortCriticalPathFirst,
} from "../lib/task-scheduler.ts";

function task(id: string, options: Partial<TaskRecordV1> = {}): TaskRecordV1 {
	return {
		schemaVersion: 1,
		id,
		origin: "subagent",
		state: "pending",
		summary: id,
		createdAt: `2026-07-17T00:00:0${id.length}.000Z`,
		updatedAt: "2026-07-17T00:00:00.000Z",
		retryCount: 0,
		...options,
	};
}

describe("task scheduler primitives", () => {
	it("serializes overlapping writers while readers always parallelize", () => {
		const source = task("source", { scope: ["src/**"] });
		const nested = task("nested", { scope: ["src/api/**"] });
		const docs = task("docs", { scope: ["docs/**"] });
		const unscoped = task("unscoped");

		expect(scopesOverlap("src/**", "src/api/**")).toBe(true);
		expect(scopesOverlap("src/**", "docs/**")).toBe(false);
		expect(
			scheduledTasksConflict(
				{ record: source, readOnly: false },
				{ record: nested, readOnly: false },
			),
		).toBe(true);
		expect(
			scheduledTasksConflict(
				{ record: source, readOnly: false },
				{ record: docs, readOnly: false },
			),
		).toBe(false);
		expect(
			scheduledTasksConflict(
				{ record: source, readOnly: false },
				{ record: unscoped, readOnly: false },
			),
		).toBe(true);
		expect(
			scheduledTasksConflict(
				{ record: source, readOnly: false },
				{ record: nested, readOnly: true },
			),
		).toBe(false);
	});

	it("derives read-only status from enforced agent tools", () => {
		const record = task("reader", {
			execution: {
				kind: "subagent",
				agent: "validator",
				task: "validate",
				status: "pending",
			},
		});
		expect(executionIsReadOnly(record, () => ["read", "grep"])).toBe(true);
		expect(executionIsReadOnly(record, () => ["read", "bash"])).toBe(false);
		expect(executionIsReadOnly(record, () => undefined)).toBe(false);
	});

	it("orders a diamond by longest downstream path with stable ties", () => {
		const root = task("root");
		const left = task("left", { blockedBy: [root.id] });
		const right = task("right", { blockedBy: [root.id] });
		const join = task("join", { blockedBy: [left.id, right.id] });
		const independent = task("independent");
		const records = [root, left, right, join, independent];
		const depths = criticalPathDepths(records);

		expect(depths.get(root.id)).toBe(2);
		expect(depths.get(left.id)).toBe(1);
		expect(depths.get(join.id)).toBe(0);
		expect(sortCriticalPathFirst([independent, root], records)).toEqual([
			root,
			independent,
		]);
	});
});
