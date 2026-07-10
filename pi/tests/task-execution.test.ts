import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

type MockProcess = EventEmitter & {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
};

function createMockProcess(): MockProcess {
	const proc = new EventEmitter() as MockProcess;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	proc.killed = false;
	return proc;
}

describe("durable task execution", () => {
	let tmpDir: string;
	let previousOperatorDir: string | undefined;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "pi-task-execution-"),
		);
		const agentsDir = path.join(tmpDir, ".pi", "agents");
		await fs.promises.mkdir(agentsDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(agentsDir, "tester.md"),
			`---
name: tester
description: Test agent
model: anthropic/claude-sonnet-4-6
effort: high
---

Test agent.
`,
			"utf8",
		);
		previousOperatorDir = process.env.PI_OPERATOR_DIR;
		process.env.PI_OPERATOR_DIR = path.join(tmpDir, "operator");
		spawnMock.mockReset();
	});

	afterEach(async () => {
		if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
		else process.env.PI_OPERATOR_DIR = previousOperatorDir;
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("runs through the subagent process and Codex child routing", async () => {
		spawnMock.mockImplementation(() => {
			const proc = createMockProcess();
			queueMicrotask(() => {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							usage: {
								input: 10,
								output: 5,
								cacheRead: 0,
								cacheWrite: 0,
								cost: { total: 0.01 },
								totalTokens: 15,
							},
							stopReason: "end_turn",
						},
					})}\n`,
				);
				proc.emit("close", 0);
			});
			return proc;
		});
		const pi = createMockPi();
		const tasks = await import("../extensions/tasks.ts");
		const registry = await import("../lib/task-registry.ts");
		tasks.default(pi as Parameters<typeof tasks.default>[0]);
		const task = pi._getTool("task");
		if (!task) throw new Error("task tool not registered");
		const ctx = createMockCtx({ cwd: tmpDir });
		const created = await task.execute(
			"create-task",
			{
				action: "create",
				summary: "durable worker",
				agent: "tester",
				task: "Check the thing",
				agentScope: "project",
			},
			undefined,
			undefined,
			ctx,
		);
		const id = created.details.record.id as string;

		const accepted = await task.execute(
			"execute-task",
			{ action: "execute", id },
			undefined,
			undefined,
			ctx,
		);
		expect(accepted.details.outcome).toBe("accepted");
		await vi.waitFor(() =>
			expect(registry.getTask(id)?.state).toBe("completed"),
		);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock.mock.calls[0][1]).toContain("openai-codex/gpt-5.6-terra");

		const result = await task.execute(
			"task-output",
			{ action: "output", id },
			undefined,
			undefined,
			ctx,
		);
		expect(result.content[0].text).toContain("done");
		expect(registry.getTask(id)?.execution?.outputPath).toBeTruthy();
	});
});
