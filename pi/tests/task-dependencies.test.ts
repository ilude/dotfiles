import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createTask,
	createTaskBatch,
	getTask,
	getUnmetBlockers,
	isTaskReady,
	listTasks,
	partitionReadyTasks,
	pruneTaskRegistry,
	startTask,
	TaskRegistryError,
	tasksByIdSnapshot,
	tombstoneTask,
	transitionTask,
	updateTask,
} from "../lib/task-registry.js";
import { formatTaskDetail } from "../lib/task-renderer.js";

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

describe("createTaskBatch validation and recovery", () => {
	const workspace = "/workspace";

	it("rejects invalid prospective graphs before any write", () => {
		const existing = createTask({
			origin: "other",
			summary: "existing",
			workspace,
		});
		const tombstoned = createTask({
			origin: "other",
			summary: "tombstoned",
			workspace,
		});
		tombstoneTask(tombstoned.id);
		const foreign = createTask({
			origin: "other",
			summary: "foreign",
			workspace: "/foreign",
		});
		const before = fs.readdirSync(path.join(tmpRoot, "tasks")).sort();
		const invalidBatches = [
			[
				{ origin: "other" as const, summary: "duplicate keys", key: "same" },
				{ origin: "other" as const, summary: "duplicate keys", key: "same" },
			],
			[
				{
					origin: "other" as const,
					summary: "duplicate dependencies",
					blockedBy: [existing.id, existing.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "invalid dependency",
					blockedBy: ["../invalid"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "missing dependency",
					blockedBy: ["missing-task"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "unknown key",
					blockedByKeys: ["missing"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "tombstone",
					blockedBy: [tombstoned.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "foreign",
					blockedBy: [foreign.id],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "self",
					key: "self",
					blockedByKeys: ["self"],
				},
			],
			[
				{
					origin: "other" as const,
					summary: "a",
					key: "a",
					blockedByKeys: ["b"],
				},
				{
					origin: "other" as const,
					summary: "b",
					key: "b",
					blockedByKeys: ["a"],
				},
			],
		];
		for (const batch of invalidBatches) {
			expect(() => createTaskBatch(batch, workspace)).toThrow(
				TaskRegistryError,
			);
			expect(fs.readdirSync(path.join(tmpRoot, "tasks")).sort()).toEqual(
				before,
			);
			expect(getTask(existing.id)?.blocks).toEqual([]);
		}
	});

	it("reports partial writes and supports ordered public recovery", () => {
		const blocker = createTask({
			origin: "other",
			summary: "blocker",
			workspace,
		});
		let writes = 0;
		const beforeWrite = () => {
			writes += 1;
			if (writes === 2) throw new Error("injected write failure");
		};
		const result = createTaskBatch(
			[
				{
					origin: "other",
					summary: "first",
					key: "first",
					blockedBy: [blocker.id],
				},
				{
					origin: "other",
					summary: "second",
					key: "second",
					blockedByKeys: ["first"],
				},
			],
			workspace,
			{ beforeWrite },
		);
		expect(result).toMatchObject({
			outcome: "write_failed",
			failedPhase: "write_records",
			persistedIds: [result.generated?.[0]?.id],
		});
		if (result.outcome !== "write_failed") throw new Error("write should fail");
		expect(result.operationId).toMatch(/^[A-Za-z0-9-]+$/);
		const persistedId = result.persistedIds[0];
		expect(persistedId).toBeDefined();
		if (!persistedId) throw new Error("persisted id should exist");
		expect(getTask(persistedId)?.blockedBy).toEqual([blocker.id]);

		for (const id of [...result.persistedIds].reverse()) {
			updateTask(id, { blockedBy: [] });
			tombstoneTask(id);
		}
		expect(getTask(blocker.id)?.blocks).toEqual([]);
		expect(listTasks()).toHaveLength(1);
	});

	it("writes each batch record once and derives reverse edges from blockedBy", () => {
		let writes = 0;
		const result = createTaskBatch(
			[
				{ origin: "other", summary: "first", key: "first" },
				{ origin: "other", summary: "second", blockedByKeys: ["first"] },
			],
			workspace,
			{ beforeWrite: () => (writes += 1) },
		);
		expect(result.outcome).toBe("persisted");
		expect(writes).toBe(2);
		if (result.outcome !== "persisted") throw new Error("batch should persist");
		const blockerId = result.records[0]?.id;
		const dependentId = result.records[1]?.id;
		if (!blockerId || !dependentId) throw new Error("records should exist");
		expect(getTask(blockerId)?.blocks).toEqual([dependentId]);
		for (const id of [blockerId, dependentId]) {
			const stored = JSON.parse(
				fs.readFileSync(path.join(tmpRoot, "tasks", `${id}.json`), "utf-8"),
			) as Record<string, unknown>;
			expect(stored).not.toHaveProperty("blocks");
		}
	});
});

describe("task registry pruning", () => {
	it("removes retired records and completed graphs without breaking active dependencies", () => {
		const activeRoot = createTask({ origin: "other", summary: "active root" });
		const retired = createTask({
			origin: "other",
			summary: "retired child",
			blockedBy: [activeRoot.id],
		});
		const retiredPath = path.join(tmpRoot, "tasks", `${retired.id}.json`);
		const retiredRecord = JSON.parse(
			fs.readFileSync(retiredPath, "utf-8"),
		) as Record<string, unknown>;
		fs.writeFileSync(
			retiredPath,
			`${JSON.stringify({ ...retiredRecord, agentName: "builder", prompt: "old execution" }, null, 2)}\n`,
			"utf-8",
		);
		const completedBlocker = transitionTask(
			createTask({ origin: "other", summary: "completed blocker", state: "running" })
				.id,
			"completed",
		);
		const pending = createTask({
			origin: "other",
			summary: "pending dependent",
			blockedBy: [completedBlocker.id],
		});
		const standalone = createTask({
			origin: "other",
			summary: "standalone completed",
			state: "completed",
		});

		const first = pruneTaskRegistry();

		expect(first.removedIds).toEqual(
			expect.arrayContaining([retired.id, standalone.id]),
		);
		expect(first.retiredRemoved).toBe(1);
		expect(getTask(retired.id)).toBeNull();
		expect(getTask(standalone.id)).toBeNull();
		expect(getTask(completedBlocker.id)).not.toBeNull();
		expect(getTask(activeRoot.id)?.blocks).toEqual([]);

		transitionTask(pending.id, "running");
		transitionTask(pending.id, "completed");
		const second = pruneTaskRegistry();
		expect(second.removedIds).toEqual(
			expect.arrayContaining([completedBlocker.id, pending.id]),
		);
	});
});

describe("task dependencies and tombstones", () => {
	it("derives bidirectional dependency edges without persisting reverse edges", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [blocker.id],
		});
		expect(getTask(dependent.id)?.blockedBy).toEqual([blocker.id]);
		expect(getTask(blocker.id)?.blocks).toContain(dependent.id);
		const storedBlocker = JSON.parse(
			fs.readFileSync(
				path.join(tmpRoot, "tasks", `${blocker.id}.json`),
				"utf-8",
			),
		) as Record<string, unknown>;
		expect(storedBlocker).not.toHaveProperty("blocks");
	});

	it("migrates legacy stored blocks on write while preserving reader and renderer output", () => {
		const blocker = createTask({ origin: "other", summary: "legacy blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [blocker.id],
		});
		const blockerPath = path.join(tmpRoot, "tasks", `${blocker.id}.json`);
		const legacyBlocker = JSON.parse(
			fs.readFileSync(blockerPath, "utf-8"),
		) as Record<string, unknown>;
		fs.writeFileSync(
			blockerPath,
			`${JSON.stringify({ ...legacyBlocker, blocks: ["stale-dependent"] }, null, 2)}\n`,
			"utf-8",
		);

		const read = getTask(blocker.id);
		expect(read?.blocks).toEqual([dependent.id]);
		if (!read) throw new Error("legacy blocker should be readable");
		expect(formatTaskDetail(read)).toContain(`blocks: ${dependent.id}`);

		updateTask(blocker.id, { notes: "migrated" });
		const migrated = JSON.parse(
			fs.readFileSync(blockerPath, "utf-8"),
		) as Record<string, unknown>;
		expect(migrated).not.toHaveProperty("blocks");
		expect(getTask(blocker.id)?.blocks).toEqual([dependent.id]);
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
		const skipped = createTask({
			origin: "other",
			summary: "skip",
			state: "skipped",
		});
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
		const partitioned = partitionReadyTasks(
			listTasks({ includeTombstones: true }),
		);
		expect(partitioned.ready.map((task) => task.id)).toContain(ready.id);
		expect(partitioned.waiting.map((task) => task.id)).toContain(waiting.id);
	});

	it("treats legacy missing and tombstoned blockers as unmet without mutating files", () => {
		const tombstoned = createTask({ origin: "other", summary: "old blocker" });
		const dependent = createTask({
			origin: "other",
			summary: "dependent",
			blockedBy: [tombstoned.id],
		});
		tombstoneTask(tombstoned.id);
		const dependentPath = path.join(tmpRoot, "tasks", `${dependent.id}.json`);
		const legacyDependent = JSON.parse(
			fs.readFileSync(dependentPath, "utf-8"),
		) as Record<string, unknown>;
		fs.writeFileSync(
			dependentPath,
			`${JSON.stringify({ ...legacyDependent, blockedBy: ["missing-blocker", tombstoned.id] }, null, 2)}\n`,
			"utf-8",
		);
		const before = new Map(
			fs
				.readdirSync(path.join(tmpRoot, "tasks"))
				.map((file) => [
					file,
					fs.readFileSync(path.join(tmpRoot, "tasks", file), "utf-8"),
				]),
		);
		const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		const migratedDependent = getTask(dependent.id);
		if (!migratedDependent) throw new Error("dependent should exist");
		expect(
			getUnmetBlockers(migratedDependent, byId).map((item) => item.status),
		).toEqual(["tombstoned", "missing"]);
		const start = startTask(dependent.id);
		expect(start.readiness).toMatchObject({
			ready: false,
			unmetBlockers: [
				{ id: tombstoned.id, status: "tombstoned" },
				{ id: "missing-blocker", status: "missing" },
			],
		});
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
