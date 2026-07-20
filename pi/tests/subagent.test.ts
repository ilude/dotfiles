import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowFrictionExtension from "../extensions/workflow-friction-review.js";
import {
	createMockCtx,
	createMockPi,
	createMockTheme,
} from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();
const SUBAGENT_TEST_TIMEOUT_MS = 30000;
const SPAWN_WAIT_TIMEOUT_MS = 20000;

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

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

describe("subagent model override routing", () => {
	let tmpDir: string;
	let skillDir: string;
	let prevOperatorDir: string | undefined;
	let prevMetricsDir: string | undefined;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "pi-subagent-test-"),
		);
		const agentsDir = path.join(tmpDir, ".pi", "agents");
		skillDir = path.join(tmpDir, ".pi", "skills", "test-skill");
		await fs.promises.mkdir(agentsDir, { recursive: true });
		await fs.promises.mkdir(skillDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(skillDir, "SKILL.md"),
			`---
name: test-skill
description: Test-only skill
---

# Test Skill
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "tester.md"),
			`---
name: tester
description: Test agent
model: anthropic/claude-sonnet-4-6
effort: high
memory: none
tools: read, grep
skills:
  - ../skills/test-skill/SKILL.md
---

You are a test agent.
`,
			"utf8",
		);
		prevOperatorDir = process.env.PI_OPERATOR_DIR;
		prevMetricsDir = process.env.PI_METRICS_DIR;
		process.env.PI_OPERATOR_DIR = path.join(tmpDir, "operator");
		process.env.PI_METRICS_DIR = path.join(tmpDir, "metrics");
		const { getMetricsLogPath } = await import("../lib/metrics.ts");
		expect(path.relative(tmpDir, getMetricsLogPath())).not.toMatch(/^\.\./);
		spawnMock.mockReset();
	});

	afterEach(async () => {
		if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
		else process.env.PI_OPERATOR_DIR = prevOperatorDir;
		if (prevMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
		else process.env.PI_METRICS_DIR = prevMetricsDir;
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	function mockSuccessfulSpawn() {
		spawnMock.mockImplementation((_command: string, _args: string[]) => {
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
	}

	async function loadTool() {
		const pi = createMockPi();
		const mod = await import("../extensions/subagent/index.ts");
		mod.default(pi as Parameters<typeof mod.default>[0]);
		const tool = pi._getTool("subagent");
		if (!tool) throw new Error("subagent tool not registered");
		return { pi, tool };
	}

	async function orchestrationRuns() {
		const { readRecentEvents } = await import("../lib/metrics.ts");
		return readRecentEvents(100).filter(
			(event) => event.event === "orchestration_run",
		);
	}

	it("accepts memory none in agent frontmatter", async () => {
		const { loadAgentsFromDir } = await import(
			"../extensions/subagent/agents.ts"
		);
		const agents = loadAgentsFromDir(
			path.join(tmpDir, ".pi", "agents"),
			"project",
		);
		expect(agents[0]?.memory).toBe("none");
	});

	it("ships a read-only explorer agent", async () => {
		const { loadAgentsFromDir } = await import(
			"../extensions/subagent/agents.ts"
		);
		const agents = loadAgentsFromDir(
			path.resolve(import.meta.dirname, "../agents"),
			"user",
		);
		const explorer = agents.find((agent) => agent.name === "explorer");

		expect(explorer).toMatchObject({
			memory: "none",
			effort: "medium",
			model: "openai-codex/gpt-5.6-sol",
			skills: ["analysis-workflow"],
		});
		expect(explorer?.tools).toEqual([
			"read",
			"grep",
			"find",
			"ls",
			"web_search",
			"web_fetch",
		]);
		expect(explorer?.systemPrompt).toContain(
			"Investigate the assigned question without modifying repository or external state.",
		);
	});

	it("does not expose the retired team dispatch parameter", async () => {
		const { tool } = await loadTool();
		expect(tool.parameters.properties).not.toHaveProperty("team");
	});

	it(
		"passes an execution-attempt runId override to the child process",
		async () => {
			mockSuccessfulSpawn();
			const { runSingleAgent } = await import(
				"../extensions/subagent/index.ts"
			);
			const result = await runSingleAgent(
				tmpDir,
				[
					{
						name: "tester",
						description: "Test agent",
						systemPrompt: "",
						source: "project",
						filePath: path.join(tmpDir, ".pi", "agents", "tester.md"),
					},
				],
				"tester",
				"Check the override",
				undefined,
				undefined,
				undefined,
				undefined,
				(results) => ({
					mode: "single",
					agentScope: "project",
					projectAgentsDir: null,
					results,
				}),
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				"attempt-override",
			);

			expect(result.runId).toBe("attempt-override");
			expect(spawnMock.mock.calls[0][2].env.PI_SUBAGENT_RUN_ID).toBe(
				"attempt-override",
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"does not prompt for project agents by default",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });

			const result = await tool.execute(
				"call-project-default",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).not.toBe(true);
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(spawnMock).toHaveBeenCalledTimes(1);
			const spawnArgs = spawnMock.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--no-skills");
			expect(spawnArgs).toContain("--thinking");
			expect(spawnArgs[spawnArgs.indexOf("--thinking") + 1]).toBe("high");
			expect(spawnArgs).toContain("--tools");
			expect(spawnArgs[spawnArgs.indexOf("--tools") + 1]).toBe("read,grep");
			expect(spawnArgs).toContain("--model");
			expect(spawnArgs[spawnArgs.indexOf("--model") + 1]).toBe(
				"anthropic/claude-sonnet-4-6",
			);
			expect(spawnArgs).toContain("--skill");
			expect(spawnArgs[spawnArgs.indexOf("--skill") + 1]).toBe(
				path.join(skillDir, "SKILL.md"),
			);
			const spawnOptions = spawnMock.mock.calls[0][2] as {
				env: Record<string, string>;
			};
			expect(spawnOptions.env.PI_SUBAGENT_RUN_ID).toMatch(/^[0-9a-f-]+$/);
			expect(Date.parse(spawnOptions.env.PI_SUBAGENT_STARTED_AT)).not.toBeNaN();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"queues parallel tasks beyond the concurrency limit",
		async () => {
			const procs: MockProcess[] = [];
			const spawnWaiters = new Map<
				number,
				{
					resolve: () => void;
					reject: (error: Error) => void;
					timer: ReturnType<typeof setTimeout>;
				}
			>();
			const waitForSpawnCount = (count: number) =>
				new Promise<void>((resolve, reject) => {
					if (procs.length >= count) {
						resolve();
						return;
					}
					const timer = setTimeout(() => {
						spawnWaiters.delete(count);
						reject(
							new Error(
								`Timed out waiting for ${count} spawns; observed ${procs.length}`,
							),
						);
					}, SPAWN_WAIT_TIMEOUT_MS);
					spawnWaiters.set(count, { resolve, reject, timer });
				});
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				procs.push(proc);
				for (const [count, waiter] of spawnWaiters) {
					if (procs.length >= count) {
						spawnWaiters.delete(count);
						clearTimeout(waiter.timer);
						waiter.resolve();
					}
				}
				return proc;
			});
			const { tool } = await loadTool();

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const execution = tool.execute(
				"call-parallel-queued",
				{
					tasks: Array.from({ length: 10 }, (_, index) => ({
						agent: "tester",
						task: `Parallel task ${index + 1}`,
					})),
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			await waitForSpawnCount(8);
			expect(spawnMock).toHaveBeenCalledTimes(8);
			expect(procs).toHaveLength(8);

			procs[0].stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "done" }],
						stopReason: "end_turn",
					},
				})}\n`,
			);
			procs[0].emit("close", 0);

			await waitForSpawnCount(9);
			expect(spawnMock).toHaveBeenCalledTimes(9);

			for (const proc of procs.slice(1)) {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							stopReason: "end_turn",
						},
					})}\n`,
				);
				proc.emit("close", 0);
			}

			await waitForSpawnCount(10);
			expect(spawnMock).toHaveBeenCalledTimes(10);
			const lastProc = procs[9];
			lastProc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "done" }],
						stopReason: "end_turn",
					},
				})}\n`,
			);
			lastProc.emit("close", 0);

			const result = await execution;
			expect(result.content[0].text).toContain("Parallel: 10/10 succeeded");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"finishes a subagent when the child emits agent_end without close",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { tool } = await loadTool();

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const execution = tool.execute(
				"call-agent-end",
				{
					agent: "tester",
					task: "Finish on agent_end",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "agent_end",
					messages: [
						{
							role: "assistant",
							content: [{ type: "text", text: "agent-end done" }],
						},
					],
				})}\n`,
			);

			const result = await execution;
			expect(result.content[0].text).toContain("agent-end done");
			expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"uses modelSize/modelPolicy to override pinned agent models",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.5" },
				modelRegistry: {
					getAvailable: vi.fn(() => [
						{ provider: "openai-codex", id: "gpt-5.4-mini" },
						{ provider: "openai-codex", id: "gpt-5.3-codex" },
						{ provider: "openai-codex", id: "gpt-5.5" },
						{ provider: "openai-codex", id: "gpt-5.1-codex-max" },
						{ provider: "anthropic", id: "claude-sonnet-4-6" },
					]),
				},
			});

			const result = await tool.execute(
				"call-1",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					confirmProjectAgents: false,
					modelSize: "medium",
					modelPolicy: "same-family",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).not.toBe(true);
			expect(spawnMock).toHaveBeenCalledTimes(1);

			const spawnArgs = spawnMock.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--model");
			expect(spawnArgs).toContain("openai-codex/gpt-5.5");
			expect(spawnArgs).not.toContain("openai-codex/gpt-5.1-codex-max");
			expect(spawnArgs).not.toContain("anthropic/claude-sonnet-4-6");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"uses explicit model over modelSize and pinned agent models",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const getAvailable = vi.fn(() => [
				{ provider: "openai-codex", id: "gpt-5.5" },
				{ provider: "anthropic", id: "claude-sonnet-4-6" },
			]);

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.5" },
				modelRegistry: { getAvailable },
			});

			const result = await tool.execute(
				"call-explicit-model",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					confirmProjectAgents: false,
					model: "anthropic/claude-opus-4-5",
					modelSize: "medium",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.isError).not.toBe(true);
			expect(getAvailable).not.toHaveBeenCalled();
			const spawnArgs = spawnMock.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--model");
			expect(spawnArgs).toContain("anthropic/claude-opus-4-5");
			expect(spawnArgs).not.toContain("openai-codex/gpt-5.5");
			expect(spawnArgs).not.toContain("anthropic/claude-sonnet-4-6");
			expect(result.details.results[0].model).toBe("anthropic/claude-opus-4-5");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"uses explicit effort over agent frontmatter in every mode",
		async () => {
			const { tool } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });
			const cases = [
				{
					name: "single",
					params: {
						agent: "tester",
						task: "Check single effort",
						effort: "low",
						agentScope: "project",
					},
				},
				{
					name: "parallel",
					params: {
						tasks: [
							{
								agent: "tester",
								task: "Check parallel effort",
								effort: "minimal",
							},
						],
						agentScope: "project",
					},
				},
				{
					name: "chain",
					params: {
						chain: [
							{
								agent: "tester",
								task: "Check chain effort",
								effort: "xhigh",
							},
						],
						agentScope: "project",
					},
				},
			] as const;

			for (const item of cases) {
				mockSuccessfulSpawn();
				const before = spawnMock.mock.calls.length;
				const result = await tool.execute(
					`call-effort-${item.name}`,
					item.params,
					undefined,
					undefined,
					ctx,
				);
				expect(result.isError).not.toBe(true);
				const spawnArgs = spawnMock.mock.calls[before][1] as string[];
				const thinkingIndex = spawnArgs.indexOf("--thinking");
				expect(thinkingIndex).toBeGreaterThan(-1);
				const expected =
					item.name === "single"
						? "low"
						: item.name === "parallel"
							? "minimal"
							: "xhigh";
				expect(spawnArgs[thinkingIndex + 1]).toBe(expected);
				expect(result.details.results[0].effort).toBe(expected);
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"falls back to the agent's pinned model when no modelSize is requested",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.4" },
				modelRegistry: {
					getAvailable: vi.fn(() => [
						{ provider: "openai-codex", id: "gpt-5.4-mini" },
						{ provider: "openai-codex", id: "gpt-5.4-fast" },
						{ provider: "openai-codex", id: "gpt-5.4" },
						{ provider: "anthropic", id: "claude-sonnet-4-6" },
					]),
				},
			});

			await tool.execute(
				"call-2",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			const spawnArgs = spawnMock.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--model");
			expect(spawnArgs).toContain("anthropic/claude-sonnet-4-6");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"registers the subagent run as a TaskRecordV1 with completed lifecycle",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();

			const { listTasks } = await import("../lib/task-registry.ts");

			const before = listTasks();
			expect(before.length).toBe(0);

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			await tool.execute(
				"call-task-record",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			const after = listTasks();
			expect(after.length).toBe(1);
			const record = after[0];
			expect(record.origin).toBe("subagent");
			expect(record.agentName).toBe("tester");
			expect(record.state).toBe("completed");
			expect(record.startedAt).toBeDefined();
			expect(record.endedAt).toBeDefined();
			expect(record.usage?.inputTokens).toBe(10);
			expect(record.usage?.outputTokens).toBe(5);
			expect(record.metadata?.model).toBe("anthropic/claude-sonnet-4-6");
			expect(record.metadata?.effort).toBe("high");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"persists cumulative normalized usage with a context peak and known zero cost",
		async () => {
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				queueMicrotask(() => {
					for (const usage of [
						{
							input: 10,
							output: 5,
							cacheRead: 7,
							cacheWrite: 3,
							cost: { total: 0 },
							totalTokens: 200,
						},
						{
							input: 20,
							output: 6,
							cacheRead: 2,
							cacheWrite: 4,
							totalTokens: 100,
						},
					]) {
						proc.stdout.emit(
							"data",
							`${JSON.stringify({
								type: "message_end",
								message: {
									role: "assistant",
									content: [{ type: "text", text: "done" }],
									usage,
								},
							})}\n`,
						);
					}
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");

			await tool.execute(
				"call-normalized-usage",
				{
					agent: "tester",
					task: "Measure usage",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(listTasks()[0]?.usage).toEqual({
				inputTokens: 30,
				outputTokens: 11,
				totalTokens: 200,
				cacheCreationInputTokens: 7,
				cacheReadInputTokens: 9,
				processedTokens: 57,
				contextPeakTokens: 200,
				turns: 2,
				costUsd: 0,
				costSource: "pi-usage",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"persists unavailable cost and partial usage when cancelled",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");
			const controller = new AbortController();
			const execution = tool.execute(
				"call-cancelled-usage",
				{
					agent: "tester",
					task: "Cancel after usage",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				controller.signal,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "partial" }],
						usage: { input: 4, output: 2, totalTokens: 12 },
					},
				})}\n`,
			);
			controller.abort();
			proc.emit("close", 1);
			await expect(execution).rejects.toThrow("Subagent was aborted");

			const record = listTasks()[0];
			expect(record?.state).toBe("cancelled");
			expect(record?.usage).toMatchObject({
				inputTokens: 4,
				outputTokens: 2,
				processedTokens: 6,
				contextPeakTokens: 12,
				costUsd: null,
				costSource: "unavailable",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"does not create a repo-root false artifact when output is false or coerced to string false",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			for (const output of [false, "false"] as const) {
				const result = await tool.execute(
					`call-output-${String(output)}`,
					{
						agent: "tester",
						task: "Return compact review output",
						agentScope: "project",
						confirmProjectAgents: false,
						output,
					},
					undefined,
					undefined,
					ctx,
				);

				expect(result.content[0].text).not.toContain("Output saved to:");
			}
			expect(fs.existsSync(path.join(tmpDir, "false"))).toBe(false);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"returns ordinary single inline output without an artifact",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const result = await tool.execute(
				"call-single-inline",
				{
					agent: "tester",
					task: "Return inline output",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toBe("done");
			expect(result.details.results[0].outputPath).toBeUndefined();
			expect(result.details.results[0].outputReference).toBeUndefined();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"returns file-only output inline when artifacts are disabled",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const result = await tool.execute(
				"call-file-only-disabled",
				{
					agent: "tester",
					task: "Return output without an artifact",
					agentScope: "project",
					confirmProjectAgents: false,
					output: false,
					outputMode: "file-only",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("done");
			expect(result.content[0].text).toContain(
				"Output artifact disabled by output: false",
			);
			expect(result.details.results[0].outputReference).toBeUndefined();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"preserves legacy output:true by saving to the default artifact",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const result = await tool.execute(
				"call-legacy-output-true",
				{
					agent: "tester",
					task: "Return default artifact output",
					agentScope: "project",
					confirmProjectAgents: false,
					output: true,
				},
				undefined,
				undefined,
				ctx,
			);

			const outputPath = result.details.results[0].outputPath;
			if (!outputPath)
				throw new Error("Expected a default output artifact path");
			expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
			expect(result.content[0].text).toBe("done");
			expect(result.details.results[0].outputReference?.path).toBe(outputPath);
			await fs.promises.rm(outputPath, { force: true });
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"saves single file-only output to a default artifact when no path is provided",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const result = await tool.execute(
				"call-single-file-only-default",
				{
					agent: "tester",
					task: "Return default artifact output",
					agentScope: "project",
					confirmProjectAgents: false,
					outputMode: "file-only",
				},
				undefined,
				undefined,
				ctx,
			);

			const outputPath = result.details.results[0].outputPath;
			if (!outputPath)
				throw new Error("Expected a default output artifact path");
			expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
			expect(result.content[0].text).toContain(
				`Output saved to: ${outputPath}`,
			);
			await fs.promises.rm(outputPath, { force: true });
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"returns file-only output inline when artifact saving fails",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});
			const outputPath = tmpDir;

			const result = await tool.execute(
				"call-file-only-save-error",
				{
					agent: "tester",
					task: "Return output despite artifact failure",
					agentScope: "project",
					confirmProjectAgents: false,
					output: outputPath,
					outputMode: "file-only",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("done");
			expect(result.content[0].text).toContain(
				`Output file error: ${outputPath}`,
			);
			expect(result.details.results[0].saveError).toBeDefined();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"saves single file-only output and returns its artifact reference",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});
			const outputPath = path.join(tmpDir, "single-output.md");

			const result = await tool.execute(
				"call-single-file-only",
				{
					agent: "tester",
					task: "Return artifact output",
					agentScope: "project",
					confirmProjectAgents: false,
					output: outputPath,
					outputMode: "file-only",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
			expect(result.content[0].text).toContain(
				`Output saved to: ${outputPath}`,
			);
			expect(result.content[0].text).not.toContain("done");
			expect(result.details.results[0]).toMatchObject({
				outputMode: "file-only",
				outputPath,
				outputReference: { path: outputPath },
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"passes a file-only chain artifact reference to the next step",
		async () => {
			const spawnArgs: string[][] = [];
			let calls = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				spawnArgs.push(args);
				const proc = createMockProcess();
				const output = calls++ === 0 ? "first full output" : "second output";
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: output }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});
			const outputPath = path.join(tmpDir, "chain-first.md");

			const result = await tool.execute(
				"call-chain-file-only",
				{
					chain: [
						{
							agent: "tester",
							task: "Create the source output",
							output: outputPath,
							outputMode: "file-only",
						},
						{ agent: "tester", task: "Use this artifact: {previous}" },
					],
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			const artifactReference = `Output saved to: ${outputPath} (17 B, 1 line). Read this file if needed.`;
			expect(await fs.promises.readFile(outputPath, "utf8")).toBe(
				"first full output",
			);
			expect(spawnArgs[1].join(" ")).toContain(artifactReference);
			expect(spawnArgs[1].join(" ")).not.toContain("first full output");
			expect(result.content[0].text).toBe("second output");
			expect(result.details.results[0].outputReference?.message).toBe(
				artifactReference,
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"passes inline output to the next chain step when file-only artifacts are disabled",
		async () => {
			const spawnArgs: string[][] = [];
			let calls = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				spawnArgs.push(args);
				const proc = createMockProcess();
				const output = calls++ === 0 ? "first inline output" : "second output";
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: output }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			const result = await tool.execute(
				"call-chain-file-only-disabled",
				{
					chain: [
						{
							agent: "tester",
							task: "Create inline source output",
							output: false,
							outputMode: "file-only",
						},
						{ agent: "tester", task: "Use this output: {previous}" },
					],
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(spawnArgs[1].join(" ")).toContain("first inline output");
			expect(result.content[0].text).toBe("second output");
			expect(result.details.results[0].outputReference).toBeUndefined();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"renders active parallel subagents with model and effort",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { tool } = await loadTool();

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});
			let partialResult: Awaited<ReturnType<typeof tool.execute>> | undefined;

			const execution = tool.execute(
				"call-render-active",
				{
					tasks: [{ agent: "tester", task: "Keep running" }],
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				(partial: Awaited<ReturnType<typeof tool.execute>>) => {
					partialResult = partial;
				},
				ctx,
			);

			await vi.waitFor(() => expect(partialResult).toBeDefined());
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
			const rendered = tool
				.renderResult(partialResult, { expanded: false }, createMockTheme(), {})
				.render(120)
				.join("\n");
			expect(rendered).toContain("tester anthropic/claude-sonnet-4-6[high]");

			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "done" }],
						stopReason: "end_turn",
					},
				})}\n`,
			);
			proc.emit("close", 0);
			await execution;
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"registers a subagent failure as state=failed with errorReason",
		async () => {
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				queueMicrotask(() => {
					proc.stderr.emit("data", "agent crashed: simulated failure\n");
					proc.emit("close", 1);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			});

			await tool.execute(
				"call-fail",
				{
					agent: "tester",
					task: "Will fail",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			const records = listTasks();
			expect(records.length).toBe(1);
			expect(records[0].state).toBe("failed");
			expect(records[0].errorReason).toContain("simulated failure");
			expect(records[0].usage).toMatchObject({
				processedTokens: 0,
				contextPeakTokens: 0,
				costUsd: null,
				costSource: "unavailable",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"joins the subagent orchestration run to the settled workflow-friction interaction",
		async () => {
			const previousSubagentRunId = process.env.PI_SUBAGENT_RUN_ID;
			delete process.env.PI_SUBAGENT_RUN_ID;
			try {
				mockSuccessfulSpawn();
				const pi = createMockPi();
				workflowFrictionExtension(pi as never);
				const subagent = await import("../extensions/subagent/index.ts");
				subagent.default(pi as Parameters<typeof subagent.default>[0]);
				const tool = pi._getTool("subagent");
				if (!tool) throw new Error("subagent tool not registered");
				const ctx = createMockCtx({
					cwd: tmpDir,
					sessionManager: {
						getSessionId: () => "session-integration",
						getEntries: () => [],
					},
				});
				const beforeAgent = pi._getHook("before_agent_start")[0]?.handler;
				const settled = pi._getHook("agent_settled")[0]?.handler;
				if (!beforeAgent || !settled)
					throw new Error("workflow-friction lifecycle hooks not registered");

				await beforeAgent({ prompt: "delegate" }, ctx);
				await tool.execute(
					"call-workflow-friction-integration",
					{
						agent: "tester",
						task: "Join this run to the parent interaction",
						agentScope: "project",
					},
					undefined,
					undefined,
					ctx,
				);
				await settled({}, ctx);

				const { readRecentEvents } = await import("../lib/metrics.ts");
				const events = readRecentEvents(10);
				const run = events.find((event) => event.event === "orchestration_run");
				const interaction = events.find(
					(event) => event.event === "orchestration_interaction",
				);
				expect(run?.data?.orchestrationId).toEqual(expect.any(String));
				expect(run?.data?.interactionId).toBe(interaction?.data?.interactionId);
				expect(interaction?.data).toMatchObject({
					orchestrationIds: [run?.data?.orchestrationId],
					direct: false,
				});
			} finally {
				if (previousSubagentRunId === undefined)
					delete process.env.PI_SUBAGENT_RUN_ID;
				else process.env.PI_SUBAGENT_RUN_ID = previousSubagentRunId;
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"emits exactly one content-free orchestration run for every subagent mode and failure path",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });
			const execute = (params: Record<string, unknown>) =>
				tool.execute("call-telemetry", params, undefined, undefined, ctx);

			await execute({
				agent: "tester",
				task: "single",
				agentScope: "project",
			});
			await execute({
				tasks: [
					{ agent: "tester", task: "parallel one" },
					{ agent: "tester", task: "parallel two" },
				],
				agentScope: "project",
			});
			await execute({
				chain: [
					{ agent: "tester", task: "chain one" },
					{ agent: "tester", task: "chain two {previous}" },
				],
				agentScope: "project",
			});
			await execute({
				agent: "missing",
				task: "failure",
				agentScope: "project",
			});

			const runs = await orchestrationRuns();
			expect(runs).toHaveLength(4);
			const byMode = new Map(
				runs.map((event) => [
					(event.data as { mode: string }).mode,
					event.data as {
						status: string;
						parentVisibleBytes: number;
						workers: Array<{
							chainTransferBytes?: number;
							parentVisibleBytes: number;
							durationMs: number;
							usage: { inputTokens: number; costSource: string };
						}>;
					},
				]),
			);
			const parallel = byMode.get("parallel");
			expect(parallel?.workers).toHaveLength(2);
			expect(parallel?.parentVisibleBytes).toBeGreaterThan(0);
			expect(
				parallel?.workers.every((worker) => worker.parentVisibleBytes === 0),
			).toBe(true);
			expect(parallel?.workers.every((worker) => worker.durationMs >= 0)).toBe(
				true,
			);
			expect(
				parallel?.workers.every((worker) => worker.usage.inputTokens === 10),
			).toBe(true);
			const chain = byMode.get("chain");
			expect(chain?.workers[0]?.chainTransferBytes).toBeGreaterThan(0);
			expect(chain?.workers[0]?.parentVisibleBytes).toBe(0);
			const failure = runs.find(
				(event) => (event.data as { status: string }).status === "failed",
			)?.data as { status: string } | undefined;
			expect(failure?.status).toBe("failed");
			expect(JSON.stringify(failure)).not.toContain("Unknown agent");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"treats stopReason=error as a parallel failure",
		async () => {
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [],
								stopReason: "error",
								errorMessage:
									'{"detail":"The \'gpt-5.1-codex-max\' model is not supported when using Codex with a ChatGPT account."}',
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");

			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.5" },
			});

			const result = await tool.execute(
				"call-parallel-model-error",
				{
					tasks: [
						{
							agent: "tester",
							task: "Will model-error",
							output: false,
						},
					],
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("Parallel: 0/1 succeeded");
			expect(result.content[0].text).toContain("FAILED (model error)");
			const records = listTasks();
			expect(records.length).toBe(1);
			expect(records[0].state).toBe("failed");
			expect(records[0].errorReason).toContain("not supported");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);
});
