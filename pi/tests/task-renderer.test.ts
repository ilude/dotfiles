import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, transitionTask } from "../lib/task-registry.js";
import {
	formatTaskDetail,
	formatTaskList,
	formatTaskToolResult,
} from "../lib/task-renderer.js";
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

describe("formatTaskToolResult", () => {
	it("renders a persisted record compactly", () => {
		const record = createTask({ origin: "other", summary: "compact task" });
		const result = formatTaskToolResult({ outcome: "persisted", record });

		expect(result.failed).toBe(false);
		expect(result.text).toContain("ok pending");
		expect(result.text).toContain("compact task");
	});

	it("renders a single record in expanded detail mode", () => {
		const record = createTask({ origin: "other", summary: "detail task" });
		const result = formatTaskToolResult({ outcome: "persisted", record }, true);

		expect(result.text).toContain("state:");
		expect(result.text).toContain("summary: detail task");
	});

	it("renders record lists grouped by state", () => {
		const pending = createTask({ origin: "other", summary: "pending task" });
		const running = transitionTask(pending.id, "running");
		const result = formatTaskToolResult({
			outcome: "persisted",
			records: [running],
		});

		expect(result.text).toContain("running (1)");
		expect(result.text).toContain("pending task");
	});

	it("renders failed outcomes with their error", () => {
		const result = formatTaskToolResult({
			outcome: "not_found",
			error: "task is missing",
		});

		expect(result.failed).toBe(true);
		expect(result.text).toContain("x not_found");
		expect(result.text).toContain("task is missing");
	});

	it("renders truncated output when expanded", () => {
		const record = createTask({ origin: "other", summary: "output task" });
		const result = formatTaskToolResult(
			{
				outcome: "persisted",
				record,
				output: "output body",
				truncated: true,
			},
			true,
		);

		expect(result.text).toContain("11 chars, truncated");
		expect(result.text).toContain("output body");
	});
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

	it("shows background execution status and output artifact", () => {
		const task = createTask({
			origin: "subagent",
			summary: "background task",
			execution: {
				kind: "subagent",
				agent: "coding-light",
				task: "Read one file",
				status: "completed",
				outputPath: "C:/tmp/task-output.md",
			},
		});

		const text = formatTaskDetail(task);
		expect(text).toContain("execution: completed");
		expect(text).toContain("output: C:/tmp/task-output.md");
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
