import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, transitionTask } from "../lib/task-registry.js";
import { formatTaskDetail, formatTaskList } from "../lib/task-renderer.js";
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

	it("labels pending tasks as ready or waiting", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const ready = createTask({ origin: "other", summary: "ready task" });
		const waiting = createTask({
			origin: "other",
			summary: "waiting task",
			blockedBy: [blocker.id],
		});
		const text = formatTaskList([ready, waiting, blocker], "compact");
		expect(text).toContain("ready task");
		expect(text).toContain("[ready]");
		expect(text).toContain("waiting task");
		expect(text).toContain(`[waiting: ${blocker.id.slice(0, 8)}]`);
	});

	it("shows subagent model and effort in compact and detail views", () => {
		const task = createTask({
			origin: "subagent",
			summary: "engineering-lead",
			agentName: "engineering-lead",
			state: "running",
			metadata: { model: "anthropic/claude-sonnet-4-6", effort: "high" },
		});

		const listText = formatTaskList([task], "compact");
		expect(listText).toContain(
			"engineering-lead anthropic/claude-sonnet-4-6[high]",
		);
		expect(formatTaskDetail(task)).toContain(
			"model: anthropic/claude-sonnet-4-6[high]",
		);
	});

	it("renders sorted dependency detail with redaction and skipped unblocking", () => {
		const first = createTask({ origin: "other", summary: "zzz token=abc" });
		const second = createTask({ origin: "other", summary: "aaa" });
		const skipped = transitionTask(second.id, "skipped");
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [first.id, skipped.id].sort().reverse(),
		});
		const text = formatTaskDetail(
			dependent,
			new Map([
				[first.id, first],
				[skipped.id, skipped],
				[dependent.id, dependent],
			]),
		);
		expect(text).toContain("unmet blockers:");
		expect(text).toContain("unblocked by:");
		expect(text).toContain("(skipped)");
		expect(text).not.toContain("token=abc");
	});
});
