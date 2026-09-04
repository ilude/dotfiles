import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTask, transitionTask } from "../lib/task-registry.js";
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.js";
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
	initializeTaskStore(tmpRoot);
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("formatTaskToolResult", () => {
	it("renders a persisted record compactly", () => {
		const record = createTask({ origin: "other", summary: "compact task" });
		const result = formatTaskToolResult({ outcome: "persisted", record });

		expect(result.failed).toBe(false);
		expect(result.text).toMatch(/^ok unassigned\n {2}[A-Za-z0-9]/);
		expect(result.text).toContain("compact task");
	});

	it("renders record lists grouped by state", () => {
		const unassigned = createTask({ origin: "other", summary: "unassigned task" });
		const assigned = transitionTask(unassigned.id, "assigned");
		const result = formatTaskToolResult({
			outcome: "persisted",
			records: [assigned],
		});

		expect(result.text).toContain("assigned (1)");
		expect(result.text).toContain("unassigned task");
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

	it("renders every multi-task classification and authorized artifact", () => {
		const classifications = [
			"started",
			"manual_ready",
			"manual_running",
			"pending",
			"blocked",
			"active",
			"terminal",
			"external_running",
			"failed_to_stop",
			"start_failed",
			"orphaned",
			"ownership_unknown",
			"missing",
			"foreign_workspace",
			"aborted",
		];
		for (const group of [
			classifications.slice(0, 8),
			classifications.slice(8),
		]) {
			const result = formatTaskToolResult({
				outcome: "partial",
				results: group.map((classification, index) => ({
					id: `${classification}-${index}`,
					classification,
					state: "assigned",
				})),
			});
			for (const classification of group)
				expect(result.text).toContain(classification);
			expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(4_096);
		}

		const records = Array.from({ length: 8 }, (_, index) => ({
			...createTask({
				origin: "other",
				summary: `artifact ${index}`,
				state: "completed",
			}),
			execution: {
				kind: "subagent" as const,
				agent: "builder",
				task: "Run",
				status: "completed" as const,
				outputPath: `C:/tmp/${"😀".repeat(1_000)}/${index}.md`,
			},
		}));
		const details = {
			outcome: "persisted",
			results: records.map((record) => ({
				id: record.id,
				classification: "terminal",
				state: record.state,
				record,
			})),
		};
		for (const expanded of [false, true]) {
			const result = formatTaskToolResult(details, expanded);
			expect(result.text).not.toContain("output:");
			expect(Buffer.byteLength(result.text, "utf8")).toBeLessThanOrEqual(
				expanded ? 16_384 : 4_096,
			);
		}
	});
});

describe("task renderer/settings", () => {
	it("stores settings mode", () => {
		setTaskRenderMode("full");
		expect(getTaskRenderMode()).toBe("full");
	});

	it("summarizes terminal tasks in compact mode", () => {
		const task = createTask({
			origin: "other",
			summary: "done",
			state: "assigned",
		});
		const done = transitionTask(task.id, "completed", {
			outcome: { evidence: "renderer fixture" },
		});
		expect(formatTaskList([done], "compact")).toContain("terminal (1)");
	});

	it("labels unassigned tasks as ready or waiting", () => {
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
			summary: "orchestrator",
			state: "assigned",
			metadata: { model: "anthropic/claude-sonnet-4-6", effort: "high" },
		});

		const listText = formatTaskList([task], "compact");
		expect(listText).toContain(
			"orchestrator anthropic/claude-sonnet-4-6[high]",
		);
		expect(formatTaskDetail(task)).toContain(
			"model: anthropic/claude-sonnet-4-6[high]",
		);
	});

	it("renders current instructions and boundary names", () => {
		const task = createTask({
			origin: "other",
			summary: "current task",
			instructions: "Read one file",
			boundary: ["src/**"],
		});
		const text = formatTaskDetail(task);
		expect(text).toContain("instructions: Read one file");
		expect(text).toContain("boundary: src/**");
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
