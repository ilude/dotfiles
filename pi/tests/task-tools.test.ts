import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskExecutionCoordinator } from "../extensions/tasks/execution.ts";
import { registerTaskTools } from "../extensions/tasks.ts";
import { createTask, getTask } from "../lib/task-registry.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-task-tools-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = tmpRoot;
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("task tools", () => {
	it("registers MVP lower_snake_case task tools", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as Parameters<typeof mod.default>[0]);
		for (const name of [
			"task_create",
			"task_batch_create",
			"task_list",
			"task_get",
			"task_update",
		]) {
			expect(pi._getTool(name)).toBeDefined();
		}
	});

	it("executes an explicit subagent task and retains bounded output", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, _signal, onUpdate) => {
				onUpdate("running output");
				return { output: "completed output\n".repeat(1_000), exitCode: 0 };
			},
		);
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const created = await pi._getTool("task_create")?.execute(
			"create",
			{
				summary: "worker task",
				agent: "coding-light",
				task: "Read one file",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;

		const started = await pi
			._getTool("task_execute")
			?.execute("execute", { id }, undefined, undefined, ctx);
		expect(started.details.outcome).toBe("accepted");
		await vi.waitFor(() => expect(getTask(id)?.state).toBe("completed"));

		const output = await pi
			._getTool("task_output")
			?.execute("output", { id }, undefined, undefined, ctx);
		expect(output.content[0].text).toContain("completed output");
		expect(output.details.truncated).toBe(true);
		const outputPath = getTask(id)?.execution?.outputPath;
		expect(outputPath).toBeTruthy();
		if (!outputPath) throw new Error("task output path was not persisted");
		expect(fs.readFileSync(outputPath, "utf-8").length).toBeGreaterThan(
			output.content[0].text.length,
		);
	});

	it("stops a running subagent task", async () => {
		const pi = createMockPi();
		const coordinator = new TaskExecutionCoordinator(
			async (_execution, _cwd, signal, onUpdate) => {
				onUpdate("still running");
				await new Promise<void>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")), {
						once: true,
					});
				});
				return { output: "", exitCode: 1 };
			},
		);
		registerTaskTools(
			pi as Parameters<typeof registerTaskTools>[0],
			coordinator,
		);
		const ctx = createMockCtx({ cwd: tmpRoot });
		const created = await pi
			._getTool("task_create")
			?.execute(
				"create",
				{ agent: "coding-light", task: "Wait" },
				undefined,
				undefined,
				ctx,
			);
		const id = created.details.record.id as string;
		await pi
			._getTool("task_execute")
			?.execute("execute", { id }, undefined, undefined, ctx);

		const stopped = await pi
			._getTool("task_stop")
			?.execute("stop", { id }, undefined, undefined, ctx);
		expect(stopped.details.outcome).toBe("persisted");
		expect(getTask(id)?.state).toBe("cancelled");
		expect(getTask(id)?.execution?.status).toBe("stopped");
	});

	it("rejects execution while dependencies are unresolved", () => {
		const blocker = createTask({ origin: "other", summary: "blocker" });
		const task = createTask({
			origin: "subagent",
			summary: "blocked worker",
			blockedBy: [blocker.id],
			execution: {
				kind: "subagent",
				agent: "coding-light",
				task: "Wait for blocker",
				status: "pending",
			},
		});
		const runner = vi.fn(async () => ({ output: "", exitCode: 0 }));
		const coordinator = new TaskExecutionCoordinator(runner);

		const result = coordinator.start(task.id, tmpRoot);

		expect(result.outcome).toBe("rejected");
		expect(result.error).toContain(blocker.id);
		expect(runner).not.toHaveBeenCalled();
	});

	it("marks abandoned background executions as orphaned", () => {
		const record = createTask({
			origin: "subagent",
			summary: "abandoned task",
			state: "running",
			execution: {
				kind: "subagent",
				agent: "coding-light",
				task: "Wait",
				status: "running",
				ownerPid: 2_147_483_647,
			},
		});
		const coordinator = new TaskExecutionCoordinator();

		coordinator.reconcileOrphans();

		expect(getTask(record.id)?.state).toBe("blocked");
		expect(getTask(record.id)?.execution?.status).toBe("orphaned");
	});

	it("registers provider-safe object schemas for Codex/OpenAI", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/tasks.ts");
		mod.default(pi as Parameters<typeof mod.default>[0]);
		for (const tool of pi._tools) {
			expect(tool.parameters.type).toBe("object");
			expect(tool.parameters).toHaveProperty("properties");
			expect(tool.parameters.properties).toBeTypeOf("object");
		}
	});
});
