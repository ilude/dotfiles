import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTaskDatabase, initializeTaskStore, openTaskDatabase, readStoredTask, writeStoredTask } from "../lib/task-store.js";
import {
	createTask,
	createTaskBatch,
	getTask,
	listTasks,
	normalizeTaskScope,
	normalizeTaskUsage,
	pruneTaskRegistry,
	TaskRegistryError,
	tombstoneTask,
	transitionTask,
	updateAndTransitionTask,
	updateTask,
} from "../lib/task-registry.js";

let tmpRoot: string;
let prevOverride: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-registry-"));
	prevOverride = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
	initializeTaskStore(tmpRoot);
});

afterEach(() => {
	closeTaskDatabase(tmpRoot);
	if (prevOverride === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOverride;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("createTask", () => {
	it("creates an unassigned task by default and persists it to disk", () => {
		const task = createTask({ origin: "subagent", summary: "explore repo" });
		expect(task.schemaVersion).toBe(1);
		expect(task.state).toBe("unassigned");
		expect(task.retryCount).toBe(0);
		expect(task.summary).toBe("explore repo");
		expect(task.createdAt).toBe(task.updatedAt);
		expect(task.startedAt).toBeUndefined();

		const reread = getTask(task.id);
		expect(reread).not.toBeNull();
		expect(reread?.id).toBe(task.id);
	});

	it("sets assignedAt when initial state is assigned", () => {
		const task = createTask({
			origin: "other",
			summary: "build feature",
			state: "assigned",
		});
		expect(task.state).toBe("assigned");
		expect(task.assignedAt).toBeDefined();
	});

	it("preserves optional fields including workspace and notes", () => {
		const task = createTask({
			origin: "other",
			summary: "lint",
			parentId: "parent-123",
			repoSlug: "gh/owner/repo",
			workspace: "/work/repo",
			notes: "run after deploy",
			metadata: { ticket: "OPS-42" },
		});
		expect(task.parentId).toBe("parent-123");
		expect(task.repoSlug).toBe("gh/owner/repo");
		expect(task.workspace).toBe("/work/repo");
		expect(task.instructions).toBe("run after deploy");
		expect(task.metadata).toEqual({ ticket: "OPS-42" });
	});

	it("normalizes and persists optional write scopes", () => {
		const task = createTask({
			origin: "subagent",
			summary: "scoped worker",
			scope: ["./src/**", "test\\focused.test.ts"],
		});
		expect(task.boundary).toEqual(["src/**", "test/focused.test.ts"]);
		expect(getTask(task.id)?.boundary).toEqual(task.boundary);

		const updated = updateTask(task.id, { scope: ["docs/**"] });
		expect(updated.boundary).toEqual(["docs/**"]);
	});

	it("rejects unsafe or duplicate write scopes", () => {
		expect(() => normalizeTaskScope(["../outside"])).toThrow(
			/worktree-relative/,
		);
		expect(() => normalizeTaskScope(["src/**", "src/**"])).toThrow(
			/duplicate scope/,
		);
	});

	it("generates distinct ids for concurrent creations", () => {
		const ids = new Set(
			Array.from({ length: 5 }).map(
				() => createTask({ origin: "shell", summary: "t" }).id,
			),
		);
		expect(ids.size).toBe(5);
	});

	it("validates dependency ids, uniqueness, existence, tombstones, and workspace", () => {
		const workspace = "/workspace";
		const blocker = createTask({
			origin: "other",
			summary: "blocker",
			workspace,
		});
		const tombstoned = createTask({
			origin: "other",
			summary: "old blocker",
			workspace,
		});
		tombstoneTask(tombstoned.id);
		const foreign = createTask({
			origin: "other",
			summary: "foreign blocker",
			workspace: "/foreign",
		});

		for (const blockedBy of [
			["../invalid"],
			[blocker.id, blocker.id],
			["missing-task"],
			[tombstoned.id],
			[foreign.id],
		]) {
			expect(() =>
				createTask({
					origin: "other",
					summary: "invalid dependent",
					workspace,
					blockedBy,
				}),
			).toThrow(TaskRegistryError);
		}
	});

	it("allows explicitly legacy unscoped blockers without weakening scoped checks", () => {
		const legacy = createTask({ origin: "other", summary: "legacy blocker" });
		const scoped = createTask({
			origin: "other",
			summary: "scoped dependent",
			workspace: "/workspace",
			blockedBy: [legacy.id],
		});
		expect(scoped.blockedBy).toEqual([legacy.id]);
	});
});

describe("createTaskBatch", () => {
	it("creates mixed graphs with request-local keys in declaration-independent order", () => {
		const existing = createTask({
			origin: "other",
			summary: "existing blocker",
			workspace: "/workspace",
		});
		const createGraph = (reverse: boolean) => {
			const inputs = [
				{
					origin: "other" as const,
					summary: "manual",
					key: "manual",
					blockedBy: [existing.id],
				},
				{
					origin: "other" as const,
					summary: "worker",
					key: "worker",
					blockedByKeys: ["manual"],
					scope: ["src/**"],
				},
			];
			const result = createTaskBatch(
				reverse ? [...inputs].reverse() : inputs,
				"/workspace",
			);
			expect(result.outcome).toBe("persisted");
			if (result.outcome !== "persisted")
				throw new Error("batch should persist");
			return result;
		};

		const topological = createGraph(false);
		const reverse = createGraph(true);
		for (const result of [topological, reverse]) {
			const manualId = result.aliases.manual;
			const workerId = result.aliases.worker;
			expect(manualId).toBeDefined();
			expect(workerId).toBeDefined();
			if (!manualId || !workerId) throw new Error("aliases should exist");
			const manual = getTask(manualId);
			const worker = getTask(workerId);
			expect(manual?.blockedBy).toEqual([existing.id]);
			expect(worker?.blockedBy).toEqual([manual?.id]);
			expect(getTask(existing.id)?.blocks).toContain(manual?.id);
			expect(manual?.blocks).toEqual([worker?.id]);
			expect(worker?.boundary).toEqual(["src/**"]);
		}
	});
});

describe("transitionTask", () => {
	it("rejects an invalid transition", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		expect(() => transitionTask(task.id, "completed")).toThrow(
			TaskRegistryError,
		);
	});

	it("rejects a no-op transition to the same state", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		expect(() => transitionTask(task.id, "unassigned")).toThrow(
			/already in state/,
		);
	});

	it("walks unassigned -> assigned -> completed and stamps timestamps", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const assigned = transitionTask(task.id, "assigned");
		expect(assigned.state).toBe("assigned");
		expect(assigned.assignedAt).toBeDefined();
		expect(assigned.endedAt).toBeUndefined();

		const done = transitionTask(task.id, "completed");
		expect(done.state).toBe("completed");
		expect(done.endedAt).toBeDefined();
	});

	it("rejects legacy transition targets instead of remapping them", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		for (const target of ["pending", "running", "blocked", "cancelled"] as const)
			expect(() => transitionTask(task.id, target)).toThrow(
				/unsupported current task state/,
			);
		expect(getTask(task.id)?.state).toBe("unassigned");
	});

	it("rejects legacy targets in update-and-transition without applying the patch", () => {
		const task = createTask({ origin: "other", summary: "before" });
		expect(() => updateAndTransitionTask(task.id, { summary: "after" }, "running")).toThrow(
			/unsupported current task state/,
		);
		expect(getTask(task.id)?.summary).toBe("before");
	});

	it("captures errorReason when transitioning to failed", () => {
		const task = createTask({
			origin: "subagent",
			summary: "x",
			state: "assigned",
		});
		const failed = transitionTask(task.id, "failed", {
			errorReason: "subprocess exit 1",
		});
		expect(failed.state).toBe("failed");
		expect(failed.errorReason).toBe("subprocess exit 1");
		expect(failed.endedAt).toBeDefined();
	});

	it("retry path: failed -> assigned increments retryCount and clears errorReason", () => {
		const task = createTask({
			origin: "subagent",
			summary: "x",
			state: "assigned",
		});
		transitionTask(task.id, "failed", { errorReason: "first attempt failed" });
		const retried = transitionTask(task.id, "assigned");
		expect(retried.state).toBe("assigned");
		expect(retried.retryCount).toBe(1);
		expect(retried.errorReason).toBeUndefined();
		expect(retried.endedAt).toBeUndefined();
	});

	it("rejects transition from completed (terminal)", () => {
		const task = createTask({
			origin: "subagent",
			summary: "x",
			state: "assigned",
		});
		transitionTask(task.id, "completed");
		expect(() => transitionTask(task.id, "assigned")).toThrow(TaskRegistryError);
	});

	it("rejects transition from skipped (terminal)", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		transitionTask(task.id, "skipped");
		expect(() => transitionTask(task.id, "assigned")).toThrow(TaskRegistryError);
	});

	it("preserves usage when supplied on transition", () => {
		const task = createTask({
			origin: "subagent",
			summary: "x",
			state: "assigned",
		});
		const done = transitionTask(task.id, "completed", {
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
		});
		expect(done.usage).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});
	});

	it("adds normalized usage only when a legacy record receives terminal usage", () => {
		const task = createTask({
			origin: "subagent",
			summary: "x",
			state: "assigned",
		});
		const legacyUsage = {
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		};
		updateTask(task.id, { usage: legacyUsage });
		expect(getTask(task.id)?.usage).toEqual(legacyUsage);

		const completed = transitionTask(task.id, "completed", {
			usage: normalizeTaskUsage({
				...legacyUsage,
				cacheCreationInputTokens: 10,
				cacheReadInputTokens: 20,
				contextPeakTokens: 300,
				turns: 2,
				costUsd: null,
			}),
		});
		expect(completed.usage).toEqual({
			...legacyUsage,
			cacheCreationInputTokens: 10,
			cacheReadInputTokens: 20,
			processedTokens: 180,
			contextPeakTokens: 300,
			turns: 2,
			costUsd: null,
			costSource: "unavailable",
		});
	});
});

describe("updateTask", () => {
	it("uses the same strict dependency validation as create and batch", () => {
		const workspace = "/workspace";
		const blocker = createTask({
			origin: "other",
			summary: "blocker",
			workspace,
		});
		const foreign = createTask({
			origin: "other",
			summary: "foreign",
			workspace: "/foreign",
		});
		const tombstoned = createTask({
			origin: "other",
			summary: "old blocker",
			workspace,
		});
		const target = createTask({
			origin: "other",
			summary: "target",
			workspace,
		});
		tombstoneTask(tombstoned.id);

		for (const blockedBy of [
			["../invalid"],
			[blocker.id, blocker.id],
			["missing-task"],
			[tombstoned.id],
			[foreign.id],
		]) {
			expect(() => updateTask(target.id, { blockedBy })).toThrow(
				TaskRegistryError,
			);
		}
		expect(updateTask(target.id, { blockedBy: [blocker.id] }).blockedBy).toEqual([
			blocker.id,
		]);
		expect(() => updateTask(target.id, { workspace: "/foreign" })).toThrow(
			/foreign workspace dependency/,
		);
	});

	it("patches summary/preview/usage without changing state", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const updated = updateTask(task.id, {
			summary: "x v2",
			preview: "first line",
		});
		expect(updated.summary).toBe("x v2");
		expect(updated.preview).toBe("first line");
		expect(updated.state).toBe("unassigned");
		expect(updated.updatedAt >= task.updatedAt).toBe(true);
	});

	it("throws when the task does not exist", () => {
		expect(() => updateTask("does-not-exist", { summary: "y" })).toThrow(
			TaskRegistryError,
		);
	});
});

describe("getTask", () => {
	it("returns null for unknown id", () => {
		expect(getTask("not-real")).toBeNull();
	});

	it("rejects invalid ids without throwing", () => {
		expect(getTask("../escape")).toBeNull();
		expect(getTask("")).toBeNull();
	});
});

describe("listTasks", () => {
	it("returns newest-first by createdAt", async () => {
		const t1 = createTask({ origin: "subagent", summary: "first" });
		await new Promise((r) => setTimeout(r, 5));
		const t2 = createTask({ origin: "subagent", summary: "second" });
		const list = listTasks();
		expect(list.length).toBe(2);
		expect(list[0].id).toBe(t2.id);
		expect(list[1].id).toBe(t1.id);
	});

	it("filters by state", () => {
		const a = createTask({ origin: "subagent", summary: "a" });
		const b = createTask({
			origin: "subagent",
			summary: "b",
			state: "assigned",
		});
		void a;
		const assigned = listTasks({ states: ["assigned"] });
		expect(assigned.map((t) => t.id)).toEqual([b.id]);
	});

	it("filters by origin", () => {
		createTask({ origin: "subagent", summary: "s" });
		const shell = createTask({ origin: "shell", summary: "t" });
		const got = listTasks({ origins: ["shell"] });
		expect(got.map((t) => t.id)).toEqual([shell.id]);
	});

	it("filters by repoSlug", () => {
		createTask({
			origin: "subagent",
			summary: "a",
			repoSlug: "gh/owner/repo-a",
		});
		const matching = createTask({
			origin: "subagent",
			summary: "b",
			repoSlug: "gh/owner/repo-b",
		});
		const got = listTasks({ repoSlug: "gh/owner/repo-b" });
		expect(got.map((t) => t.id)).toEqual([matching.id]);
	});

	it("respects limit", () => {
		for (let i = 0; i < 5; i++)
			createTask({ origin: "shell", summary: `t${i}` });
		expect(listTasks({ limit: 2 }).length).toBe(2);
	});

	it("returns [] when the tasks dir does not exist", () => {
		expect(listTasks()).toEqual([]);
	});

	it("prunes pre-session graphs while preserving session-owned tasks", () => {
		const unownedBlocker = createTask({
			origin: "other",
			summary: "legacy blocker",
		});
		const unownedDependent = createTask({
			origin: "other",
			summary: "legacy dependent",
			blockedBy: [unownedBlocker.id],
		});
		const owned = createTask({
			origin: "other",
			summary: "session task",
			sessionId: "session-1",
		});

		const result = pruneTaskRegistry({ removeUnowned: true });

		expect(result.removedIds).toEqual(
			expect.arrayContaining([unownedBlocker.id, unownedDependent.id]),
		);
		expect(result.unownedRemoved).toBe(2);
		expect(getTask(unownedBlocker.id)).toBeNull();
		expect(getTask(unownedDependent.id)).toBeNull();
		expect(getTask(owned.id)?.sessionId).toBe("session-1");
	});
});

describe("legacy normalization", () => {
	it("normalizes every legacy state and preserves notes, scope, and reasons", () => {
		const legacy = [
			["pending", "unassigned"],
			["running", "assigned"],
			["blocked", "unassigned"],
			["cancelled", "skipped"],
		] as const;
		for (const [index, [state, currentState]] of legacy.entries()) {
			const id = `legacy-${index}`;
			writeStoredTask({
				schemaVersion: 1,
				id,
				origin: "other",
				state,
				summary: `legacy ${state}`,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
				retryCount: 0,
				notes: "preserved note",
				scope: ["src/**"],
				...(state === "blocked" || state === "cancelled" ? { blockReason: "preserved reason" } : {}),
			}, openTaskDatabase(tmpRoot));
			const normalized = getTask(id);
			expect(normalized).toMatchObject({
				id,
				state: currentState,
				boundary: ["src/**"],
			});
			if (state === "blocked") expect(normalized?.instructions).toBe("preserved note\n\npreserved reason");
			else expect(normalized?.instructions).toBe("preserved note");
			if (state === "cancelled") expect(normalized?.skipReason).toBe("preserved reason");
			expect(normalized).not.toHaveProperty("notes");
			expect(normalized).not.toHaveProperty("scope");
		}
	});
});

describe("durable storage", () => {
	it("does not parse transcripts -- registry stores records in SQLite", () => {
		const task = createTask({ origin: "subagent", summary: "x" });
		const onDisk = readStoredTask(task.id, openTaskDatabase(tmpRoot));
		expect(onDisk?.id).toBe(task.id);
		expect(onDisk?.schemaVersion).toBe(1);
	});
});
