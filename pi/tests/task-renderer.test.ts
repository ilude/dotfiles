import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, transitionTask } from "../lib/task-registry.js";
import { formatTaskList } from "../lib/task-renderer.js";
import { getTaskRenderMode, setTaskRenderMode } from "../lib/task-settings.js";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-renderer-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("task renderer/settings", () => {
	it("supports hidden mode recovery text", () => {
		expect(formatTaskList([], "hidden")).toContain(
			"/tasks settings mode compact",
		);
	});

	it("stores settings mode", () => {
		setTaskRenderMode("full");
		expect(getTaskRenderMode()).toBe("full");
	});

	it("summarizes terminal tasks in compact mode", () => {
		const task = createTask({
			origin: "other",
			summary: "done",
			state: "running",
		});
		const done = transitionTask(task.id, "completed");
		expect(formatTaskList([done], "compact")).toContain("terminal (1)");
	});
});
