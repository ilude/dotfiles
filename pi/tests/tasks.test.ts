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

describe("task tool schema", () => {
	it("publishes strict action-specific current schemas", async () => {
		const { pi } = await loadTasks();
		const tool = pi._getTool("task");
		expect(tool).toBeDefined();
		type Schema = {
			additionalProperties?: boolean;
			required?: string[];
			properties: Record<string, Record<string, unknown>>;
		};
		const variants = (tool!.parameters as { anyOf: Schema[] }).anyOf;
		expect(variants).toHaveLength(7);
		for (const variant of variants)
			expect(variant.additionalProperties).toBe(false);
		const byAction = new Map(
			variants.map((variant) => [
				(variant.properties.action.enum as string[])[0],
				variant,
			]),
		);
		const create = byAction.get("create");
		const batch = byAction.get("batch");
		const update = byAction.get("update");
		if (!batch) throw new Error("batch task schema not registered");
		expect(create?.required).toEqual(expect.arrayContaining(["action", "summary"]));
		expect(batch.required).toEqual(expect.arrayContaining(["action", "tasks"]));
		expect(batch.properties.tasks).toMatchObject({ minItems: 1, maxItems: 16 });
		const batchItem = (
			batch.properties.tasks as {
				items?: Schema;
			}
		).items;
		expect(batchItem?.additionalProperties).toBe(false);
		expect(batchItem?.required).toEqual(
			expect.arrayContaining(["summary"]),
		);
		expect(update?.properties.state).toMatchObject({
			type: "string",
			enum: [
				"pending",
				"running",
				"blocked",
				"completed",
				"failed",
				"cancelled",
				"skipped",
			],
		});
		for (const name of [
			"ids",
			"maxConcurrent",
			"origin",
			"agent",
			"task",
			"cwd",
			"agentScope",
			"model",
			"modelSize",
		])
			expect(JSON.stringify(tool!.parameters)).not.toContain(`"${name}"`);
	});
});

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

	it("rejects create without a summary", async () => {
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();

		await cmd.handler("create", ctx);

		const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("summary is required"),
			"warning",
		);
	});

	it("groups by urgency in the default list view", async () => {
		const { createTask, resolveTaskWorkspace, transitionTask } = await import(
			"../lib/task-registry.ts"
		);
		const workspace = resolveTaskWorkspace("/test/dir");
		const blocked = createTask({
			origin: "subagent",
			summary: "needs creds",
			state: "running",
			workspace,
		});
		transitionTask(blocked.id, "blocked", { blockReason: "no creds" });
		createTask({
			origin: "subagent",
			summary: "running 1",
			state: "running",
			workspace,
		});

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
			origin: "other",
			summary: "hello",
			scope: ["src/**"],
		});

		const { cmd } = await loadTasks();
		const ctx = createMockCtx();
		await cmd.handler(t.id.slice(0, 8), ctx);
		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain(t.id);
		expect(text).toContain("summary: hello");
		expect(text).toContain("scope: src/**");
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
		expect(after?.endedAt).toBeUndefined();
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
		const { createTask, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const workspace = resolveTaskWorkspace("/test/dir");
		const blocker = createTask({
			origin: "subagent",
			summary: "blocker",
			workspace,
		});
		const ready = createTask({
			origin: "subagent",
			summary: "ready work",
			workspace,
		});
		createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
			workspace,
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
		const { createTask, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const workspace = resolveTaskWorkspace("/test/dir");
		const blocker = createTask({
			origin: "subagent",
			summary: "blocker token=abc",
			workspace,
		});
		const waiting = createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
			workspace,
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

	it("reports the available stale-dependency recovery action", async () => {
		const { createTask, tombstoneTask } = await import(
			"../lib/task-registry.ts"
		);
		const blocker = createTask({ origin: "subagent", summary: "old blocker" });
		const waiting = createTask({
			origin: "subagent",
			summary: "waiting work",
			blockedBy: [blocker.id],
		});
		tombstoneTask(blocker.id);
		const { cmd } = await loadTasks();
		const ctx = createMockCtx();

		await cmd.handler(`start ${waiting.id}`, ctx);

		const text = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(text).toContain("use task update to replace blockedBy");
		expect(text).not.toContain("when a dependency-edit command is available");
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

	it("lists only active current-session workspace tasks unless --all is provided", async () => {
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
			sessionId: "current-session",
		});
		const completed = createTask({
			origin: "other",
			summary: "current completed task",
			state: "completed",
			workspace: resolveTaskWorkspace(currentDir),
			sessionId: "current-session",
		});
		const otherSession = createTask({
			origin: "other",
			summary: "other session task",
			workspace: resolveTaskWorkspace(currentDir),
			sessionId: "other-session",
		});
		const unscoped = createTask({ origin: "other", summary: "unscoped task" });
		const foreign = createTask({
			origin: "other",
			summary: "foreign workspace task",
			workspace: resolveTaskWorkspace(foreignDir),
		});
		const { cmd } = await loadTasks();
		const ctx = createMockCtx({
			cwd: currentDir,
			sessionManager: { getSessionId: () => "current-session" },
		});

		await cmd.handler("list", ctx);
		const scoped = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string;
		expect(scoped).toContain(current.summary);
		expect(scoped).not.toContain(completed.summary);
		expect(scoped).not.toContain(otherSession.summary);
		expect(scoped).not.toContain(unscoped.summary);
		expect(scoped).not.toContain(foreign.summary);

		await cmd.handler("settings mode hidden", ctx);
		await cmd.handler("list --all", ctx);
		const globalList = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock
			.calls[2][0] as string;
		expect(globalList).not.toContain("Task display is hidden");
		expect(globalList).toContain(completed.summary);
		expect(globalList).toContain(otherSession.summary);
		expect(globalList).toContain(unscoped.summary);
		expect(globalList).toContain(foreign.summary);
	});

	it("clears completed tasks only in the current session and workspace", async () => {
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
			sessionId: "current-session",
		});
		const otherSession = createTask({
			origin: "other",
			summary: "other session completed task",
			state: "completed",
			workspace: resolveTaskWorkspace(currentDir),
			sessionId: "other-session",
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
		const ctx = createMockCtx({
			cwd: currentDir,
			sessionManager: { getSessionId: () => "current-session" },
		});

		await cmd.handler("clear completed", ctx);

		expect(getTask(current.id)?.deletedAt).toBeDefined();
		expect(getTask(otherSession.id)?.deletedAt).toBeUndefined();
		expect(getTask(global.id)?.deletedAt).toBeUndefined();
		expect(getTask(foreign.id)?.deletedAt).toBeUndefined();
	});

	it("removes pre-session task records when a session starts", async () => {
		const { createTask, getTask, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const unowned = createTask({
			origin: "other",
			summary: "pre-session task",
			workspace: resolveTaskWorkspace(tmpRoot),
		});
		const owned = createTask({
			origin: "other",
			summary: "session task",
			workspace: resolveTaskWorkspace(tmpRoot),
			sessionId: "current-session",
		});
		const { pi } = await loadTasks();
		const sessionStart = pi._getHook("session_start")[0];
		const ctx = createMockCtx({
			cwd: tmpRoot,
			sessionManager: { getSessionId: () => "current-session" },
		});

		await sessionStart.handler({ reason: "startup" }, ctx);

		expect(getTask(unowned.id)).toBeNull();
		expect(getTask(owned.id)?.sessionId).toBe("current-session");
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
