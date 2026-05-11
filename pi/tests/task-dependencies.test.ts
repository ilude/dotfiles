import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createTask,
	getTask,
	getUnmetBlockers,
	isTaskReady,
	listTasks,
	partitionReadyTasks,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
	updateTask,
} from "../lib/task-registry.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-deps-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("task dependencies and tombstones", () => {
	it("maintains bidirectional dependency edges", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [blocker.id],
		});
		expect(getTask(dependent.id)?.blockedBy).toEqual([blocker.id]);
		expect(getTask(blocker.id)?.blocks).toContain(dependent.id);
	});

	it("rejects direct cycles", () => {
		const first = createTask({ origin: "other", summary: "first" });
		const second = createTask({
			origin: "other",
			summary: "second",
			blockedBy: [first.id],
		});
		expect(() => updateTask(first.id, { blockedBy: [second.id] })).toThrow(
			/cycle/,
		);
	});

	it("keeps tombstones out of default lists but available for repair", () => {
		const task = createTask({ origin: "other", summary: "old" });
		tombstoneTask(task.id);
		expect(listTasks().map((item) => item.id)).not.toContain(task.id);
		expect(
			listTasks({ includeTombstones: true }).map((item) => item.id),
		).toContain(task.id);
	});

	it("classifies ready and waiting tasks from an in-memory snapshot", () => {
		const pending = createTask({ origin: "other", summary: "pending blocker" });
		const done = transitionTask(
			createTask({ origin: "other", summary: "done", state: "running" }).id,
			"completed",
		);
		const skipped = createTask({ origin: "other", summary: "skip", state: "skipped" });
		const ready = createTask({ origin: "other", summary: "ready" });
		const unblocked = createTask({
			origin: "other",
			summary: "unblocked",
			blockedBy: [done.id, skipped.id],
		});
		const waiting = createTask({
			origin: "other",
			summary: "waiting",
			blockedBy: [pending.id],
		});
		const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		expect(isTaskReady(ready, byId)).toBe(true);
		expect(isTaskReady(unblocked, byId)).toBe(true);
		expect(isTaskReady(waiting, byId)).toBe(false);
		expect(getUnmetBlockers(waiting, byId)).toEqual([
			expect.objectContaining({ id: pending.id, status: "pending" }),
		]);
		const partitioned = partitionReadyTasks(listTasks({ includeTombstones: true }));
		expect(partitioned.ready.map((task) => task.id)).toContain(ready.id);
		expect(partitioned.waiting.map((task) => task.id)).toContain(waiting.id);
	});

	it("treats missing and tombstoned blockers as unmet without mutating files", () => {
		const tombstoned = createTask({ origin: "other", summary: "old blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: ["missing-blocker", tombstoned.id],
		});
		tombstoneTask(tombstoned.id);
		const before = new Map(
			fs
				.readdirSync(path.join(tmpRoot, "tasks"))
				.map((file) => [
					file,
					fs.readFileSync(path.join(tmpRoot, "tasks", file), "utf-8"),
				]),
		);
		const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		expect(getUnmetBlockers(dependent, byId).map((item) => item.status)).toEqual([
			"tombstoned",
			"missing",
		]);
		const after = new Map(
			fs
				.readdirSync(path.join(tmpRoot, "tasks"))
				.map((file) => [
					file,
					fs.readFileSync(path.join(tmpRoot, "tasks", file), "utf-8"),
				]),
		);
		expect(after).toEqual(before);
	});
});
