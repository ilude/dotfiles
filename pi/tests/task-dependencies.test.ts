import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createTask,
	getTask,
	listTasks,
	tombstoneTask,
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
});
