import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, type vi } from "vitest";
import type { TaskState } from "../lib/task-registry.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tasks-cmd-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadTasks() {
	const pi = createMockPi();
	const mod = await import("../extensions/tasks.ts");
	mod.default(pi as Parameters<typeof mod.default>[0]);
	const cmd = pi._commands.find((c) => c.name === "tasks");
	if (!cmd) throw new Error("tasks command not registered");
	return { pi, cmd };
}

describe("parseTasksArgs", () => {
	it("treats empty as list", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("")).toEqual({ verb: "list" });
	});

	it("recognizes cancel and retry verbs", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("cancel abc12345")).toEqual({
			verb: "cancel",
			idArg: "abc12345",
		});
		expect(mod.parseTasksArgs("retry abc12345")).toEqual({
			verb: "retry",
			idArg: "abc12345",
		});
	});

	it("treats a single token as show", async () => {
		const mod = await import("../extensions/tasks.ts");
		expect(mod.parseTasksArgs("abc12345")).toEqual({
			verb: "show",
			idArg: "abc12345",
		});
	});
});

describe("groupTasksByUrgency", () => {
	it("orders blocked > failed > running > pending > completed > cancelled", async () => {
		const mod = await import("../extensions/tasks.ts");
		const fake = (state: string, id: string) => ({
			schemaVersion: 1 as const,
			id,
			origin: "subagent" as const,
			state: state as TaskState,
			summary: state,
			createdAt: "2026-04-27T00:00:00.000Z",
			updatedAt: "2026-04-27T00:00:00.000Z",
			retryCount: 0,
		});
		const tasks = [
			fake("completed", "c1"),
			fake("blocked", "b1"),
			fake("running", "r1"),
			fake("pending", "p1"),
			fake("failed", "f1"),
			fake("cancelled", "x1"),
		];
		const groups = mod.groupTasksByUrgency(tasks);
		expect(groups.map((g) => g.state)).toEqual([
			"blocked",
			"failed",
			"running",
			"pending",
			"completed",
			"cancelled",
		]);
	});
});

describe("/tasks command", () => {
	it("notifies 'No tasks recorded' when registry is empty", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify).toHaveBeenCalled();
		expect(notify.mock.calls[0][0]).toContain("No tasks recorded");
	});

	it("groups by urgency in the default list view", async () => {
		const { createTask, transitionTask } = await import(
			"../lib/task-registry.ts"
		);
		const blocked = createTask({
			origin: "subagent",
			summary: "needs creds",
			state: "running",
		});
		transitionTask(blocked.id, "blocked", { blockReason: "no creds" });
		createTask({ origin: "subagent", summary: "running 1", state: "running" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		// blocked must come before running in the output
		expect(text.indexOf("blocked")).toBeLessThan(text.indexOf("running"));
	});

	it("show by id-prefix returns the detail view", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const t = createTask({
			origin: "subagent",
			summary: "hello",
			agentName: "validator",
		});

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(t.id.slice(0, 8), ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain(t.id);
		expect(text).toContain("agent: validator");
		expect(text).toContain("summary: hello");
	});

	it("cancel transitions a running task to cancelled", async () => {
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const t = createTask({
			origin: "subagent",
			summary: "long-runner",
			state: "running",
		});

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`cancel ${t.id}`, ctx);

		const after = getTask(t.id);
		expect(after?.state).toBe("cancelled");
		expect(after?.summary).toBe("long-runner"); // summary preserved
	});

	it("skip persists its reason", async () => {
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const task = createTask({ origin: "other", summary: "optional work" });
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();

		await cmd.handler(`skip ${task.id} superseded`, ctx);

		expect(getTask(task.id)?.state).toBe("skipped");
		expect(getTask(task.id)?.skipReason).toBe("superseded");
	});

	it("retry on a failed task transitions it to running and bumps retryCount", async () => {
		const { createTask, transitionTask, getTask } = await import(
			"../lib/task-registry.ts"
		);
		const t = createTask({
			origin: "subagent",
			summary: "x",
			state: "running",
		});
		transitionTask(t.id, "failed", { errorReason: "boom" });

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${t.id}`, ctx);

		const after = getTask(t.id);
		expect(after?.state).toBe("running");
		expect(after?.retryCount).toBe(1);
		expect(after?.errorReason).toBeUndefined();
	});

	it("retry rejects when task is not in failed state", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const t = createTask({
			origin: "subagent",
			summary: "x",
			state: "running",
		});

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`retry ${t.id}`, ctx);

		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain(
			"Retry only valid for failed tasks",
		);
	});

	it("rejects cancel on already-terminal task", async () => {
		const { createTask, transitionTask } = await import(
			"../lib/task-registry.ts"
		);
		const t = createTask({
			origin: "subagent",
			summary: "x",
			state: "running",
		});
		transitionTask(t.id, "completed");

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`cancel ${t.id}`, ctx);

		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain("already completed");
	});

	it("warns when id prefix is ambiguous or missing", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("cancel zz", ctx);
		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify.mock.calls[0][1]).toBe("warning");
		expect(notify.mock.calls[0][0]).toContain("No unique task");
	});

	it("lists ready tasks through the registered command", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const blocker = createTask({ origin: "subagent", summary: "blocker" });
		const ready = createTask({ origin: "subagent", summary: "ready work" });
		createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
		});
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("ready", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain(ready.summary);
		expect(text).not.toContain("waiting work");
	});

	it("lists blocked tasks with actionable blocker context", async () => {
		const { createTask } = await import("../lib/task-registry.ts");
		const blocker = createTask({
			origin: "subagent",
			summary: "blocker token=abc",
		});
		const waiting = createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
		});
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("blocked", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain(waiting.id.slice(0, 8));
		expect(text).toContain(blocker.id.slice(0, 8));
		expect(text).toContain("pending");
		expect(text).toContain("Next: /tasks show");
		expect(text).not.toContain("token=abc");
	});

	it("documents ready and blocked in help", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler("help", ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain("ready");
		expect(text).toContain("blocked");
		expect(text).toContain("what can I work on now");
		expect(text).toContain("why can't this start");
		expect(text).toContain("Retry/reopen does not execute work");
	});

	it("rejects starting a waiting task without mutating persisted records", async () => {
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const blocker = createTask({ origin: "subagent", summary: "blocker" });
		const waiting = createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
		});
		const taskDir = path.join(tmpRoot, "tasks");
		const before = new Map(
			fs
				.readdirSync(taskDir)
				.map((file) => [
					file,
					fs.readFileSync(path.join(taskDir, file), "utf-8"),
				]),
		);
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`start ${waiting.id}`, ctx);
		const after = new Map(
			fs
				.readdirSync(taskDir)
				.map((file) => [
					file,
					fs.readFileSync(path.join(taskDir, file), "utf-8"),
				]),
		);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain("Cannot start");
		expect(text).toContain(blocker.id.slice(0, 8));
		expect(text).toContain("Next: /tasks show");
		expect(getTask(waiting.id)?.state).toBe("pending");
		expect(after).toEqual(before);
	});

	it("lists only current-workspace tasks unless --all is provided", async () => {
		const { createTask, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const currentDir = path.join(tmpRoot, "current");
		const foreignDir = path.join(tmpRoot, "foreign");
		fs.mkdirSync(currentDir);
		fs.mkdirSync(foreignDir);
		const current = createTask({
			origin: "other",
			summary: "current workspace task",
			workspace: resolveTaskWorkspace(currentDir),
		});
		const global = createTask({ origin: "other", summary: "global task" });
		const foreign = createTask({
			origin: "other",
			summary: "foreign workspace task",
			workspace: resolveTaskWorkspace(foreignDir),
		});
		const { cmd } = await loadTasks();
		const ctx = createMockCtx({ cwd: currentDir });

		await cmd.handler("list", ctx);
		const scoped = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(scoped).toContain(current.summary);
		expect(scoped).toContain(global.summary);
		expect(scoped).not.toContain(foreign.summary);

		await cmd.handler("list --all", ctx);
		const globalList = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[1][0] as string;
		expect(globalList).toContain(foreign.summary);
	});

	it("clears completed tasks only in the current workspace", async () => {
		const { createTask, getTask, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const currentDir = path.join(tmpRoot, "current");
		const foreignDir = path.join(tmpRoot, "foreign");
		fs.mkdirSync(currentDir);
		fs.mkdirSync(foreignDir);
		const current = createTask({
			origin: "other",
			summary: "current completed task",
			state: "completed",
			workspace: resolveTaskWorkspace(currentDir),
		});
		const global = createTask({
			origin: "other",
			summary: "global completed task",
			state: "completed",
		});
		const foreign = createTask({
			origin: "other",
			summary: "foreign completed task",
			state: "completed",
			workspace: resolveTaskWorkspace(foreignDir),
		});
		const { cmd } = await loadTasks();
		const ctx = createMockCtx({ cwd: currentDir });

		await cmd.handler("clear completed", ctx);

		expect(getTask(current.id)?.deletedAt).toBeDefined();
		expect(getTask(global.id)?.deletedAt).toBeDefined();
		expect(getTask(foreign.id)?.deletedAt).toBeUndefined();
	});

	it("starts a ready task through the registered command", async () => {
		const { createTask, getTask } = await import("../lib/task-registry.ts");
		const ready = createTask({ origin: "subagent", summary: "ready" });
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(`start ${ready.id}`, ctx);
		expect(getTask(ready.id)?.state).toBe("running");
		expect(
			(ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls[0][0],
		).toContain("Started");
	});
});
