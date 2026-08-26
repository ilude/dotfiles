import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowFrictionExtension from "../extensions/workflow-friction-review.js";
import {
	canonicalizeSavedSessionPath,
	SubagentRunManager,
} from "../extensions/subagent/run-manager.ts";
import {
	directMutationViolation,
	normalizeRepositoryScopes,
	toolsForScopedModifier,
} from "../extensions/subagent/scope-policy.ts";
import { assignReadOnlyFanoutExperiment } from "../lib/orchestration-telemetry.js";
import { runCorrelation } from "../lib/log-analytics/correlation.ts";
import {
	closeTaskDatabase,
	initializeTaskStore,
} from "../lib/task-store.js";
import {
	createMockCtx,
	createMockPi,
	createMockTheme,
} from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();
const SUBAGENT_TEST_TIMEOUT_MS = 30000;
const STRUCTURED_TEST_ARTIFACT_BYTES = 9000;

type MockProcess = EventEmitter & {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
	killed: boolean;
	pid?: number;
	exitCode?: number | null;
	signalCode?: NodeJS.Signals | null;
};

function createMockProcess(): MockProcess {
	const proc = new EventEmitter() as MockProcess;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn(() => true);
	proc.killed = false;
	return proc;
}

function testSessionHeader(sessionId: string, cwd: string): string {
	return `${JSON.stringify({
		type: "session",
		version: 3,
		id: sessionId,
		timestamp: "2026-07-17T00:00:00.000Z",
		cwd,
	})}\n`;
}

function beginManagedRun(
	manager: SubagentRunManager,
	runId: string,
): AbortController {
	const controller = new AbortController();
	manager.begin(
		{
			runId,
			owner: "direct",
			mode: "single",
			agent: "tester",
			task: "Test task",
			cwd: process.cwd(),
		},
		controller,
	);
	return controller;
}

vi.mock("node:child_process", () => ({
	spawn: spawnMock,
}));

describe("subagent modification scopes", () => {
	it("normalizes repository-relative scopes and rejects escapes", () => {
		expect(normalizeRepositoryScopes(["src\\api/", "./tests/api"])).toEqual([
			"src/api",
			"tests/api",
		]);
		expect(() => normalizeRepositoryScopes(["../outside"])).toThrow(
			"stay inside the repository",
		);
		expect(() => normalizeRepositoryScopes(["C:/outside"])).toThrow(
			"repository-relative",
		);
	});

	it("retains overlapping work markers without weakening containment", () => {
		expect(normalizeRepositoryScopes(["src", "src/api"])).toEqual(["src", "src/api"]);
	});

	it("blocks direct out-of-scope mutation and removes command tools", () => {
		const repositoryRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-subagent-scope-"),
		);
		fs.mkdirSync(path.join(repositoryRoot, "src", "api"), {
			recursive: true,
		});
		try {
			const policy = {
				repositoryRoot,
				scopes: ["src/api"],
			};
			expect(
				directMutationViolation(
					"edit",
					{ path: "src/api/router.ts" },
					repositoryRoot,
					policy,
				),
			).toBeUndefined();
			expect(
				directMutationViolation(
					"text_edit",
					{ paths: ["src/api/router.ts", "src/db.ts"] },
					repositoryRoot,
					policy,
				),
			).toContain("src/db.ts");
			expect(
				toolsForScopedModifier(["read", "bash", "pwsh", "edit", "write"]),
			).toEqual(["read", "edit", "write"]);
		} finally {
			fs.rmSync(repositoryRoot, { recursive: true, force: true });
		}
	});

	it("canonicalizes scopes and direct mutations through existing ancestors", () => {
		const repositoryRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-subagent-scope-"),
		);
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-outside-"));
		fs.mkdirSync(path.join(repositoryRoot, "src", "api"), {
			recursive: true,
		});
		const linkType = process.platform === "win32" ? "junction" : "dir";
		fs.symlinkSync(outside, path.join(repositoryRoot, "escape"), linkType);
		fs.symlinkSync(
			path.join(repositoryRoot, "src", "api"),
			path.join(repositoryRoot, "api-link"),
			linkType,
		);
		try {
			expect(() =>
				normalizeRepositoryScopes(["escape/new/file.ts"], repositoryRoot),
			).toThrow("symlink or junction");
			expect(
				directMutationViolation(
					"write",
					{ path: "escape/new/file.ts" },
					repositoryRoot,
					{ repositoryRoot, scopes: ["src/api"] },
				),
			).toContain("outside the assigned scope");
		} finally {
			fs.rmSync(repositoryRoot, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});
});

describe("subagent model override routing", () => {
	let tmpDir: string;
	let skillDir: string;
	let prevAgentDir: string | undefined;
	let prevOperatorDir: string | undefined;
	let prevMetricsDir: string | undefined;
	let prevRoutingSampleRate: string | undefined;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "pi-subagent-test-"),
		);
		const isolatedAgentDir = path.join(tmpDir, "agent");
		const userAgentsDir = path.join(isolatedAgentDir, "agents");
		const agentsDir = path.join(tmpDir, ".pi", "agents");
		skillDir = path.join(tmpDir, ".pi", "skills", "test-skill");
		await fs.promises.mkdir(userAgentsDir, { recursive: true });
		await fs.promises.mkdir(agentsDir, { recursive: true });
		await fs.promises.mkdir(skillDir, { recursive: true });
		await fs.promises.writeFile(
			path.join(userAgentsDir, "builder.md"),
			`---
name: builder
description: Test builder agent
tools: read
---

Build the requested change.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(userAgentsDir, "typescript-pro.md"),
			`---
name: typescript-pro
description: Test TypeScript agent
tools: read
---

Inspect TypeScript code.
`,
			"utf8",
		);
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
tools: read, grep, subagent
skills:
  - ../skills/test-skill/SKILL.md
---

You are a test agent.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "subscription.md"),
			`---
name: subscription
description: Subscription test agent
model: openai-codex/gpt-5.6-terra:high
tools: read, grep
---

Run subscription work.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "luna.md"),
			`---
name: luna
description: Luna continuation test agent
model: openai-codex/gpt-5.6-luna:high
tools: read, grep, bash
---

Run Luna continuation work.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "unpinned.md"),
			`---
name: unpinned
description: Unpinned test agent
tools: read, grep
---

Run unpinned work.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "orchestrator.md"),
			`---
name: teamlead
description: Orchestrator test agent
model: openai-codex/gpt-5.6-sol
effort: low
tools: read, grep, subagent
---

Coordinate bounded work.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "reviewer.md"),
			`---
name: reviewer
description: Reviewer test agent
tools: read, grep, bash
---

Review without direct file mutation.
`,
			"utf8",
		);
		await fs.promises.writeFile(
			path.join(agentsDir, "workflow-builder.md"),
			`---
name: workflow-builder
description: Workflow builder test agent
tools: read, bash, pwsh, edit, write
---

Execute workflow items with admitted tools only.
`,
			"utf8",
		);
		prevAgentDir = process.env.PI_CODING_AGENT_DIR;
		prevOperatorDir = process.env.PI_OPERATOR_DIR;
		prevMetricsDir = process.env.PI_METRICS_DIR;
		prevRoutingSampleRate = process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE;
		process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
		process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE = "0";
		process.env.PI_OPERATOR_DIR = path.join(tmpDir, "operator");
		initializeTaskStore(process.env.PI_OPERATOR_DIR);
		process.env.PI_METRICS_DIR = path.join(tmpDir, "metrics");
		const { getMetricsLogPath } = await import("../lib/metrics.ts");
		expect(path.relative(tmpDir, getMetricsLogPath())).not.toMatch(/^\.\./);
		spawnMock.mockReset();
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		subagentRunManager.clear({ abortRunning: true });
	});

	afterEach(async () => {
		vi.useRealTimers();
		closeTaskDatabase(path.join(tmpDir, "operator"));
		if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
		if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
		else process.env.PI_OPERATOR_DIR = prevOperatorDir;
		if (prevMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
		else process.env.PI_METRICS_DIR = prevMetricsDir;
		if (prevRoutingSampleRate === undefined)
			delete process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE;
		else process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE = prevRoutingSampleRate;
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		subagentRunManager.clear({ abortRunning: true });
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	function mockSuccessfulSpawn(output = "done") {
		spawnMock.mockImplementation((_command: string, _args: string[]) => {
			const proc = createMockProcess();

			queueMicrotask(() => {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: output }],
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

	const outputSchema = {
		type: "object",
		properties: { value: { type: "string" } },
		required: ["value"],
		additionalProperties: false,
	};
	const fableModel = {
		provider: "amazon-bedrock",
		id: "us.anthropic.claude-fable-5",
	};
	const subscriptionModels = [
		{ provider: "openai-codex", id: "gpt-5.6-luna" },
		{ provider: "openai-codex", id: "gpt-5.6-terra" },
		{ provider: "openai-codex", id: "gpt-5.6-sol" },
	];
	const fableCtx = (models = subscriptionModels) =>
		createMockCtx({
			cwd: tmpDir,
			model: fableModel,
			modelRegistry: { getAvailable: vi.fn(() => models) },
		});

	it("rejects new runs after disposal starts", async () => {
		const manager = new SubagentRunManager();
		const disposal = manager.dispose();

		expect(() => beginManagedRun(manager, "after-dispose")).toThrow(
			"Subagent run manager is disposing.",
		);
		await disposal;
	});

	it("waits for active runs and shares one disposal promise", async () => {
		const manager = new SubagentRunManager();
		const controller = beginManagedRun(manager, "dispose-once");
		const firstDisposal = manager.dispose();
		const secondDisposal = manager.dispose();
		let disposed = false;
		void firstDisposal.then(() => {
			disposed = true;
		});

		expect(secondDisposal).toBe(firstDisposal);
		expect(controller.signal.aborted).toBe(true);
		await Promise.resolve();
		expect(disposed).toBe(false);

		manager.settle("dispose-once", { status: "cancelled" });
		await firstDisposal;
		expect(disposed).toBe(true);
		expect(manager.list()).toEqual([]);
	});

	it("enumerates trusted agents while exposing only current subagent tools", async () => {
		const { pi } = await loadTool();
		for (const name of ["subagent_chain", "subagent_fanout", "subagent_workflow"])
			expect(pi._getTool(name)).toBeUndefined();
		expect(pi._getTool("subagent_continue")).toBeDefined();

		await pi
			._getHook("session_start")[0]
			.handler({ reason: "startup" }, createMockCtx({ cwd: tmpDir }));
		const tool = pi._getTool("subagent");
		if (!tool) throw new Error("subagent tool not registered");
		const properties = (
			tool.parameters as { properties: Record<string, unknown> }
		).properties;
		expect(JSON.stringify(tool.parameters).length).toBeLessThan(10_000);
		expect(properties).not.toHaveProperty("chain");
		expect(properties).not.toHaveProperty("continue");
		expect(properties).not.toHaveProperty("readOnlyFanout");
		expect(properties.agent).toMatchObject({
			type: "string",
			enum: expect.arrayContaining(["builder", "typescript-pro", "tester"]),
			description: expect.stringContaining("Trusted catalog"),
		});
		expect(properties.agentScope).toMatchObject({
			default: "user",
			description: expect.stringContaining("Project-local names require"),
		});
		expect(properties.taskId).toMatchObject({ type: "string" });
		expect(properties.role).toMatchObject({
			type: "string",
			enum: ["coordinator", "leaf"],
		});
		expect(properties.scope).toMatchObject({ minItems: 1 });
		expect(properties.output).toMatchObject({ type: "boolean" });
		const assertCatalogSchemas = () => {
			for (const name of ["subagent_read", "subagent_write", "subagent_teamlead"]) {
				const schema = pi._getTool(name)?.parameters as {
					properties: { items: { items: { properties: { agent: { enum: string[] } } } } };
				};
				expect(schema.properties.items.items.properties.agent.enum).toEqual(
					expect.arrayContaining(["builder", "typescript-pro", "tester"]),
				);
				expect(schema.properties.items.items.properties.agent.enum).not.toContain("worker");
			}
		};
		assertCatalogSchemas();
		const statusSchema = pi._getTool("subagent_status")?.parameters as { properties: Record<string, unknown> };
		expect(statusSchema.properties).toHaveProperty("processId");
		expect(statusSchema.properties).not.toHaveProperty("runId");
		const controlSchema = pi._getTool("subagent_control")?.parameters as { properties: { selector: { anyOf: Array<{ properties: Record<string, unknown> }> } } };
		expect(JSON.stringify(controlSchema)).toContain('"process"');
		expect(JSON.stringify(controlSchema)).not.toContain('"run"');
		const continueTool = pi._getTool("subagent_continue")!;
		const continueProperties = (continueTool.parameters as {
			properties: Record<string, unknown>;
		}).properties;
		expect(continueProperties).toMatchObject({
			agent: { enum: expect.arrayContaining(["builder"]) },
			session: expect.any(Object),
			output: { type: "boolean" },
		});
		for (const field of ["role", "depth", "authorityTools"])
			expect(continueProperties).not.toHaveProperty(field);
		expect(JSON.stringify(continueTool.parameters)).not.toMatch(
			/coordinator|leaf/,
		);
		for (const field of ["role", "depth", "authorityTools"])
			expect(() =>
				continueTool.prepareArguments?.({
					agent: "builder",
					session: "saved.jsonl",
					task: "again",
					[field]: field === "authorityTools" ? ["subagent_write"] : "coordinator",
				}),
			).toThrow(`does not accept ${field}`);
		expect(pi.getActiveTools()).not.toContain("subagent_continue");
		expect(pi.getActiveTools()).not.toContain("subagent");
		expect(pi.getActiveTools()).toEqual(
			expect.arrayContaining([
				"subagent_read",
				"subagent_write",
				"subagent_teamlead",
			]),
		);
		expect(pi.getActiveTools()).not.toContain("subagent_coordinate");
		const coordinate = pi._getTool("subagent_coordinate");
		if (!coordinate?.prepareArguments)
			throw new Error("coordinate compatibility preparation is not registered");
		const coordinateSchema = coordinate.parameters as {
			properties: Record<string, unknown>;
		};
		expect(coordinateSchema.properties).toHaveProperty("workspaceRoot");
		expect(coordinateSchema.properties).toHaveProperty("workBoundary");
		expect(coordinateSchema.properties).not.toHaveProperty("enforcedBoundary");
		expect(coordinateSchema.properties).not.toHaveProperty("boundary");
		expect(
			coordinate.prepareArguments({
				workspaceRoot: tmpDir,
				workBoundary: ["pi/extensions/subagent"],
				maxWorkers: 1,
				items: [
					{
						agent: "teamlead",
						task: "Coordinate the compatibility check.",
						cwd: tmpDir,
						effort: "medium",
						skills: ["typescript"],
					},
				],
			}),
		).toEqual({
			enforcedBoundary: tmpDir,
			boundary: ["pi/extensions/subagent"],
			maxWorkers: 1,
			items: [
				{
					agent: "teamlead",
					instructions: "Coordinate the compatibility check.",
					cwd: tmpDir,
					effort: "medium",
					skills: ["typescript"],
				},
			],
		});
		expect(pi.getActiveTools()).toContain("subagent_status");
		const status = pi._getTool("subagent_status");
		if (!status?.prepareArguments) throw new Error("status compatibility preparation is not registered");
		const statusPrepared = status.prepareArguments({ runId: "legacy-process" });
		expect(statusPrepared).toEqual({ runId: "legacy-process", processId: "legacy-process" });
		const control = pi._getTool("subagent_control");
		if (!control?.prepareArguments) throw new Error("control compatibility preparation is not registered");
		expect(control.prepareArguments({ action: "cancel", selector: { type: "run", id: "legacy-process" } })).toEqual({
			action: "cancel",
			selector: { type: "process", processId: "legacy-process" },
		});
		for (const name of ["subagent_read", "subagent_write", "subagent_teamlead"]) {
			await expect(
				pi._getTool(name)!.execute(
					`unknown-${name}`,
					{ items: [{ agent: "worker", task: "Should reject" }] },
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow(/Unknown agent.*Available agents:.*builder/);
		}
	});

	it("restores saved continuation authority and defaults unknown sessions to leaf", async () => {
		mockSuccessfulSpawn();
		const { pi } = await loadTool();
		const sessionPath = path.join(tmpDir, "saved.jsonl");
		fs.writeFileSync(sessionPath, testSessionHeader("saved", tmpDir));
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		const controller = new AbortController();
		subagentRunManager.begin(
			{
				runId: "saved-teamlead",
				owner: "direct",
				mode: "single",
				agent: "teamlead",
				task: "lead",
				cwd: tmpDir,
				role: "coordinator",
				depth: 1,
				authorityTools: ["read", "subagent_write"],
			},
			controller,
		);
		subagentRunManager.update("saved-teamlead", { sessionPath });
		const continuation = pi._getTool("subagent_continue");
		if (!continuation) throw new Error("continuation tool not registered");
		await continuation.execute(
			"continue-teamlead",
			{ agent: "builder", session: sessionPath, task: "continue" },
			new AbortController().signal,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);
		const resumed = subagentRunManager
			.list()
			.find((run) =>
				run.runId !== "saved-teamlead" &&
				run.sessionPath === canonicalizeSavedSessionPath(sessionPath),
			);
		expect(resumed).toMatchObject({
			role: "coordinator",
			depth: 1,
			authorityTools: ["read", "subagent_write"],
		});

		const unknownPath = path.join(tmpDir, "unknown.jsonl");
		fs.writeFileSync(unknownPath, testSessionHeader("unknown", tmpDir));
		await continuation.execute(
			"continue-unknown",
			{ agent: "builder", session: unknownPath, task: "continue" },
			new AbortController().signal,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);
		const unknown = subagentRunManager
			.list()
			.find((run) => run.sessionPath === canonicalizeSavedSessionPath(unknownPath));
		expect(unknown).toMatchObject({ role: "leaf", depth: 1 });
		expect(unknown?.authorityTools ?? []).not.toContain("subagent_write");
	});

	it("lets the root inspect liveness and compare observable progress", async () => {
		const { pi } = await loadTool();
		const status = pi._getTool("subagent_status");
		if (!status) throw new Error("subagent_status tool not registered");
		expect(status.promptGuidelines).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Never use subagent_status to poll"),
				expect.stringContaining("timeout, watchdog event"),
			]),
		);
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		beginManagedRun(subagentRunManager, "status-run");
		subagentRunManager.registerProcess("status-run", process.pid);

		await expect(
			status.execute(
				"status-list",
				{},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			),
		).rejects.toThrow("use /subagents to list tracked processes");

		const detail = await status.execute(
			"status-detail",
			{ processId: "status-run", sinceActivityVersion: 0 },
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);
		expect(detail.details).toMatchObject({
			found: true,
			processState: "alive",
			processAlive: true,
			progressedSince: true,
		});
		expect(detail.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("activity version: 1"),
		});
	});

	it("blocks unchanged status polling in the tool-call hook", async () => {
		const { pi } = await loadTool();
		const sessionStart = pi._getHook("session_start")[0].handler;
		const ctx = createMockCtx({ cwd: tmpDir });
		await sessionStart({ reason: "startup" }, ctx);
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		beginManagedRun(subagentRunManager, "guard-run");
		subagentRunManager.registerProcess("guard-run", process.pid);
		const hook = pi._getHook("tool_call")[0].handler;
		const event = { toolName: "subagent_status", input: { processId: "guard-run" } };

		expect(await hook(event, ctx)).toBeUndefined();
		const status = pi._getTool("subagent_status");
		if (!status) throw new Error("subagent_status tool not registered");
		await status.execute("guard-first", event.input, undefined, undefined, ctx);
		const blocked = await hook(event, ctx);
		expect(blocked).toMatchObject({ block: true });
		for (let attempt = 0; attempt < 50; attempt++)
			expect(await hook(event, ctx)).toMatchObject({ block: true });
		expect(ctx.abort).toHaveBeenCalledTimes(1);

		subagentRunManager.appendMessage("guard-run", {
			role: "assistant",
			content: [{ type: "text", text: "activity" }],
		} as any);
		expect(await hook(event, ctx)).toBeUndefined();
	});

	it("groups status checks by a returned orchestration ID", async () => {
		const { pi } = await loadTool();
		const status = pi._getTool("subagent_status");
		if (!status) throw new Error("subagent_status tool not registered");
		const { subagentRunManager } = await import(
			"../extensions/subagent/run-manager.ts"
		);
		for (const runId of ["group-run-1", "group-run-2"]) {
			subagentRunManager.begin(
				{
					runId,
					orchestrationId: "orchestration-group",
					owner: "direct",
					mode: "parallel",
					agent: "tester",
					task: runId,
					cwd: tmpDir,
				},
				new AbortController(),
			);
		}

		const grouped = await status.execute(
			"status-group",
			{ processId: "orchestration-group" },
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(grouped.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("orchestration: orchestration-group"),
		});
		expect(grouped.details).toMatchObject({
			orchestrationId: "orchestration-group",
			found: true,
		});
		expect(grouped.details.runs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ processId: "group-run-1" }),
				expect.objectContaining({ processId: "group-run-2" }),
			]),
		);
	});





	it("renders the full single-agent task prompt", async () => {
		const { tool } = await loadTool();
		if (!tool.renderCall) throw new Error("subagent renderCall not registered");
		const task =
			"Re-review the now-simplified context optimization diff. Verify every affected provider schema and preserve the complete reviewer instructions.\nReport all remaining findings with file and line references.";
		const component = tool.renderCall(
			{ agent: "code-reviewer", agentScope: "both", task },
			createMockTheme(),
			{},
		);
		const renderedLines = component
			.render(500)
			.map((line: string) => line.trim());
		const renderedTask = renderedLines.slice(1).join("\n");

		expect(renderedLines[0]).toContain("subagent code-reviewer [both]");
		expect(renderedTask).toBe(task);
		expect(renderedTask).not.toContain(`${task.slice(0, 60)}...`);
	});

	it("renders resolved agent model and reasoning effort", async () => {
		const { pi, tool } = await loadTool();
		const ctx = createMockCtx({ cwd: tmpDir, isProjectTrusted: () => true });
		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);
		if (!tool.renderCall) throw new Error("subagent renderCall not registered");

		const component = tool.renderCall(
			{ agent: "teamlead", agentScope: "project", role: "coordinator", task: "Coordinate one work package" },
			createMockTheme(),
			{},
		);
		const rendered = component.render(500).join("\n");

		expect(rendered).toContain(
			"subagent teamlead [project] (model: openai-codex/gpt-5.6-sol, effort: low)",
		);
	});

	it("renders canonical timing for every subagent entry point", async () => {
		const { pi } = await loadTool();
		const startedAt = new Date(2026, 7, 25, 20, 10, 25).getTime();
		const result = {
			content: [{ type: "text", text: "completed output" }],
			details: {
				mode: "single",
				agentScope: "user",
				projectAgentsDir: null,
				transcriptTiming: { startedAt, durationMs: 125_000 },
				results: [],
			},
		};
		for (const name of [
			"subagent",
			"subagent_read",
			"subagent_write",
			"subagent_teamlead",
			"subagent_coordinate",
			"subagent_continue",
		]) {
			const tool = pi._getTool(name);
			if (!tool?.renderResult) throw new Error(`${name} renderer not registered`);
			const running = tool.renderResult(
				{ ...result, details: { ...result.details, transcriptTiming: { startedAt } } } as never,
				{ expanded: false },
				createMockTheme(),
				{},
			).render(240).join("\n");
			expect(running).toContain("started 20:10:25 local");
			expect(running).not.toContain("duration");
			const rendered = tool.renderResult(
				result as never,
				{ expanded: false },
				createMockTheme(),
				{},
			).render(240).join("\n");
			expect(rendered).toContain("started 20:10:25 local | duration 2m05s");
		}

		const control = pi._getTool("subagent_control");
		if (!control?.renderCall || !control.renderResult)
			throw new Error("subagent_control renderer not registered");
		const controlContext = { executionStarted: true, state: {} } as never;
		const running = control.renderCall(
			{ action: "interrupt_tool", selector: { type: "process", processId: "run-1" } },
			createMockTheme(),
			controlContext,
		).render(120).join("\n");
		expect(running).toContain("started ");
		const settled = control.renderResult(
			{
				content: [{ type: "text", text: "resumed" }],
				details: { transcriptTiming: { startedAt, durationMs: 125_000 } },
			} as never,
			{ expanded: false },
			createMockTheme(),
			controlContext,
		).render(120).join("\n");
		expect(settled).toContain("started 20:10:25 local | duration 2m05s");

		for (const action of ["cancel", "force_terminate", "reconcile"]) {
			const rendered = control.renderCall(
			{ action, selector: { type: "process", processId: "run-1" } },
			createMockTheme(),
			{ executionStarted: true, state: {} } as never,
			).render(120).join("\n");
			expect(rendered).not.toContain("started ");
		}
	});

	it("adds project agents to schemas only after trust validation", async () => {
		const { pi } = await loadTool();
		const sessionStart = pi._getHook("session_start")[0].handler;
		const assertCatalog = (agent: string, present: boolean) => {
			for (const name of ["subagent_read", "subagent_write", "subagent_teamlead"]) {
				const schema = pi._getTool(name)!.parameters as any;
				const names = schema.properties.items.items.properties.agent.enum;
				expect(names.includes(agent)).toBe(present);
			}
		};
		await sessionStart(
			{ reason: "startup" },
			createMockCtx({ cwd: tmpDir, isProjectTrusted: () => false }),
		);
		assertCatalog("tester", false);
		let properties = (
			pi._getTool("subagent")!.parameters as {
				properties: { agent: { enum: string[] } };
			}
		).properties;
		expect(properties.agent.enum).toContain("builder");
		expect(properties.agent.enum).not.toContain("tester");
		for (const name of ["subagent_read", "subagent_write", "subagent_teamlead"])
			expect((pi._getTool(name)!.parameters as any).properties.items.items.properties.agent.enum).not.toContain("tester");

		await fs.promises.writeFile(
			path.join(tmpDir, ".pi", "agents", "tester-two.md"),
			`---
name: tester-two
description: Second test agent
---

You are another test agent.
`,
			"utf8",
		);
		await sessionStart(
			{ reason: "reload" },
			createMockCtx({ cwd: tmpDir, isProjectTrusted: () => true }),
		);
		properties = (
			pi._getTool("subagent")!.parameters as {
				properties: { agent: { enum: string[] } };
			}
		).properties;
		expect(properties.agent.enum).toEqual(
			expect.arrayContaining([
				"builder",
				"typescript-pro",
				"tester",
				"tester-two",
			]),
		);
		assertCatalog("tester", true);
		assertCatalog("tester-two", true);

		const otherCwd = path.join(tmpDir, "catalog-cwd");
		await fs.promises.mkdir(path.join(otherCwd, ".pi", "agents"), { recursive: true });
		await fs.promises.writeFile(
			path.join(otherCwd, ".pi", "agents", "cwd-agent.md"),
			"---\nname: cwd-agent\ndescription: Cwd test agent\n---\n\nCwd test agent.\n",
			"utf8",
		);
		await sessionStart(
			{ reason: "cwd_change" },
			createMockCtx({ cwd: otherCwd, isProjectTrusted: () => true }),
		);
		assertCatalog("cwd-agent", true);
		assertCatalog("tester", false);
		await sessionStart(
			{ reason: "reload" },
			createMockCtx({ cwd: otherCwd, isProjectTrusted: () => true }),
		);
		assertCatalog("cwd-agent", true);
	});

	it("supports project scopes while retaining a default-user schema", async () => {
		mockSuccessfulSpawn();
		const { pi } = await loadTool();
		await pi
			._getHook("session_start")[0]
			.handler({ reason: "startup" }, createMockCtx({ cwd: tmpDir }));
		const tool = pi._getTool("subagent");
		if (!tool) throw new Error("subagent tool not registered");
		const ctx = createMockCtx({ cwd: tmpDir });

		for (const agentScope of ["project", "both"] as const) {
			const result = await tool.execute(
				`call-${agentScope}-scope`,
				{ agent: "tester", task: "Do work", agentScope },
				undefined,
				undefined,
				ctx,
			);
			expect(result.details.agentScope).toBe(agentScope);
			expect(result.details.results[0].agentSource).toBe("project");
		}
		expect(spawnMock).toHaveBeenCalledTimes(2);
	});

	it("does not discover project agents after an untrusted cwd change", async () => {
		const otherCwd = path.join(tmpDir, "untrusted-project");
		const otherAgents = path.join(otherCwd, ".pi", "agents");
		await fs.promises.mkdir(otherAgents, { recursive: true });
		await fs.promises.writeFile(
			path.join(otherAgents, "untrusted.md"),
			`---
name: untrusted
description: Untrusted project agent
---

Do not load this agent.
`,
			"utf8",
		);
		const { pi } = await loadTool();
		await pi
			._getHook("session_start")[0]
			.handler(
				{ reason: "startup" },
				createMockCtx({ cwd: tmpDir, isProjectTrusted: () => true }),
			);
		const tool = pi._getTool("subagent");
		if (!tool) throw new Error("subagent tool not registered");

		await expect(
			tool.execute(
				"untrusted-cwd",
				{
					agent: "untrusted",
					task: "Do not run.",
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({
					cwd: otherCwd,
					isProjectTrusted: () => false,
				}),
			),
		).rejects.toThrow('Unknown agent: "untrusted"');
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("preserves command-capable reviewers without granting direct mutation", async () => {
		mockSuccessfulSpawn();
		const { tool } = await loadTool();
		const result = await tool.execute(
			"reviewer-compatibility",
			{
				agent: "reviewer",
				task: "Review the current change.",
				agentScope: "project",
			},
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(result.isError).not.toBe(true);
		const spawnArgs = spawnMock.mock.calls[0][1] as string[];
		expect(spawnArgs[spawnArgs.indexOf("--tools") + 1]).toBe(
			"read,grep,bash",
		);
	});

	it("rejects unknown and default-scope background agents before spawning", async () => {
		const { pi } = await loadTool();
		const sessionStart = pi._getHook("session_start")[0].handler;
		await sessionStart(
			{ reason: "startup" },
			createMockCtx({ cwd: tmpDir, isProjectTrusted: () => true }),
		);
		const tool = pi._getTool("subagent");
		if (!tool) throw new Error("subagent tool not registered");
		const ctx = createMockCtx({ cwd: tmpDir });

		await expect(
			tool.execute(
				"call-unknown-background",
				{
					agent: "engineer",
					task: "Do work",
					agentScope: "user",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow('Unknown agent: "engineer"');
		await expect(
			tool.execute(
				"call-out-of-scope-background",
				{
					agent: "tester",
					task: "Do work",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow('for agentScope "user"');
		expect(spawnMock).not.toHaveBeenCalled();
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("rejects leaf delegation before spawning", async () => {
		const previous = {
			runId: process.env.PI_SUBAGENT_RUN_ID,
			role: process.env.PI_SUBAGENT_ROLE,
			depth: process.env.PI_SUBAGENT_DEPTH,
		};
		process.env.PI_SUBAGENT_RUN_ID = "parent-run";
		process.env.PI_SUBAGENT_ROLE = "leaf";
		process.env.PI_SUBAGENT_DEPTH = "1";
		try {
			const { tool } = await loadTool();
			await expect(
				tool.execute(
					"call-nested",
					{
						agent: "tester",
						task: "Delegate again",
						agentScope: "project",
					},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("Leaf and depth-two subagents cannot delegate.");
			expect(spawnMock).not.toHaveBeenCalled();
		} finally {
			for (const [name, value] of Object.entries({
				PI_SUBAGENT_RUN_ID: previous.runId,
				PI_SUBAGENT_ROLE: previous.role,
				PI_SUBAGENT_DEPTH: previous.depth,
			})) {
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});

	it("treats a legacy run-only environment as a leaf", async () => {
		const names = [
			"PI_SUBAGENT_RUN_ID",
			"PI_SUBAGENT_ROLE",
			"PI_SUBAGENT_DEPTH",
			"PI_SUBAGENT_TREE_RUN_ID",
			"PI_SUBAGENT_TREE_ROLE",
			"PI_SUBAGENT_TREE_DEPTH",
		] as const;
		const previous = Object.fromEntries(
			names.map((name) => [name, process.env[name]]),
		) as Record<(typeof names)[number], string | undefined>;
		for (const name of names) delete process.env[name];
		process.env.PI_SUBAGENT_RUN_ID = "legacy-parent-run";
		try {
			const { pi, tool } = await loadTool();
			for (const hook of pi._getHook("session_start"))
				await hook.handler({}, createMockCtx({ cwd: tmpDir }));
			expect(pi.getActiveTools()).not.toContain("subagent");
			expect(pi.getActiveTools()).not.toContain("subagent_status");
			const status = pi._getTool("subagent_status");
			if (!status) throw new Error("subagent_status tool not registered");
			await expect(
				status.execute(
					"status-nested",
					{},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("Only the root agent can inspect subagent status.");
			await expect(
				tool.execute(
					"call-legacy-nested",
					{
						agent: "tester",
						task: "Delegate again",
						agentScope: "project",
					},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("Leaf and depth-two subagents cannot delegate.");
			expect(spawnMock).not.toHaveBeenCalled();
		} finally {
			for (const name of names) {
				const value = previous[name];
				if (value === undefined) delete process.env[name];
				else process.env[name] = value;
			}
		}
	});

	it("rejects parallel batches wider than eight before spawning", async () => {
		const { tool } = await loadTool();
		const result = await tool.execute(
			"call-too-wide",
			{
				tasks: Array.from({ length: 9 }, (_, index) => ({
					agent: "tester",
					task: `Item ${index + 1}`,
				})),
				agentScope: "project",
			},
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain(
			"delegation wave may contain at most 8 workers",
		);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("rejects an invalid parallel batch atomically", async () => {
		const { tool } = await loadTool();
		await expect(
			tool.execute(
				"call-invalid-parallel",
				{
					tasks: [
						{ agent: "tester", task: "Valid" },
						{ agent: "engineer", task: "Invalid" },
					],
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			),
		).rejects.toThrow('Unknown agent: "engineer"');
		expect(spawnMock).not.toHaveBeenCalled();
	});


	async function orchestrationRuns() {
		const { readRecentEvents } = await import("../lib/metrics.ts");
		return readRecentEvents(100).filter(
			(event) => event.event === "orchestration_run",
		);
	}

	it(
		"passes an execution-attempt runId override to the child process",
		async () => {
			mockSuccessfulSpawn();
			const { runSingleAgent } = await import(
				"../extensions/subagent/index.ts"
			);
			const result = await runCorrelation(
				{
					runtime_instance_id: "runtime-test",
					session_id: "session-parent",
					turn_id: "turn-parent",
					trace_id: "trace-parent",
					interaction_id: "interaction-parent",
					orchestration_id: "orchestration-parent",
					task_id: "task-parent",
				},
				() => runSingleAgent(
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
				),
			);

			expect(result.runId).toBe("attempt-override");
		const childEnvironment = spawnMock.mock.calls[0][2].env as Record<string, string>;
		expect(childEnvironment).toMatchObject({
			PI_CORRELATION_RUNTIME_INSTANCE_ID: "runtime-test",
			PI_CORRELATION_SESSION_ID: "session-parent",
			PI_CORRELATION_TURN_ID: "turn-parent",
			PI_CORRELATION_TRACE_ID: "trace-parent",
			PI_CORRELATION_INTERACTION_ID: "interaction-parent",
			PI_CORRELATION_ORCHESTRATION_ID: "orchestration-parent",
			PI_CORRELATION_RUN_ID: "attempt-override",
			PI_CORRELATION_TASK_ID: "task-parent",
			PI_SUBAGENT_RUN_ID: "attempt-override",
		});
		expect(childEnvironment.TRACEPARENT).toMatch(
			/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
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
			expect(spawnOptions.env.PI_SUBAGENT_WORKSPACE_ROOT).toBe(
				path.resolve(tmpDir),
			);
			expect(Date.parse(spawnOptions.env.PI_SUBAGENT_STARTED_AT)).not.toBeNaN();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"inherits a Team Lead agent directory for the child catalog",
		async () => {
			mockSuccessfulSpawn();
			const { pi } = await loadTool();
			const teamlead = pi._getTool("subagent_teamlead");
			if (!teamlead) throw new Error("Team Lead tool not registered");
			const result = await teamlead.execute(
				"call-nested-catalog",
				{
					items: [
						{
							agent: "teamlead",
							instructions: "Inspect the nested catalog.",
						},
					],
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.isError).not.toBe(true);
			const spawnOptions = spawnMock.mock.calls[0][2] as {
				cwd: string;
				env: NodeJS.ProcessEnv;
			};
			expect(spawnOptions.cwd).toBe(tmpDir);
			const childAgentDir = spawnOptions.env.PI_CODING_AGENT_DIR;
			expect(childAgentDir).toBe(path.join(tmpDir, "agent"));

			await fs.promises.writeFile(
				path.join(childAgentDir!, "agents", "developer.md"),
				`---
name: developer
description: Child developer agent
tools: read, write
---

Implement the requested change.
`,
				"utf8",
			);

			const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
			process.env.PI_CODING_AGENT_DIR = childAgentDir;
			try {
				const childPi = createMockPi();
				const childMod = await import("../extensions/subagent/index.ts");
				childMod.default(childPi as Parameters<typeof childMod.default>[0]);
				await childPi
					._getHook("session_start")[0]
					.handler({ reason: "startup" }, createMockCtx({ cwd: tmpDir }));

				const childWrite = childPi._getTool("subagent_write");
				if (!childWrite) throw new Error("child subagent_write tool not registered");
				const childWriteSchema = childWrite.parameters as {
					properties: {
						items: { items: { properties: { agent: { enum: string[] } } } };
					};
				};
				const childAgents =
					childWriteSchema.properties.items.items.properties.agent.enum;
				expect(childAgents).toContain("developer");

				const childResult = await childWrite.execute(
					"child-developer",
					{
						items: [
							{
								agent: "developer",
								instructions: "Implement the child change.",
							},
						],
						agentScope: "user",
					},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				);
				expect(childResult.isError).not.toBe(true);

				await expect(
					childWrite.execute(
						"child-unknown",
						{
							items: [
								{ agent: "unknown-profile", instructions: "Reject this." },
							],
							agentScope: "user",
						},
						undefined,
						undefined,
						createMockCtx({ cwd: tmpDir }),
					),
				).rejects.toThrow(/Unknown agent.*Available agents:.*developer/);
			} finally {
				if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"parses modern Team Lead continuation envelopes and owns the session path",
		async () => {
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				const sessionPath = path.join(
					sessionDir,
					`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
				);
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(sessionPath, testSessionHeader(sessionId, tmpDir), "utf8");
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{
									type: "text",
									text: "```json\n" +
										JSON.stringify({
											status: "partial",
											completed: ["inspect"],
											remaining: ["validate"],
											validation: { status: "passed" },
											requestedAdditionalTimeMs: 999_999,
											continuation: { sessionPath: "attacker-path" },
										}) +
										"\n```",
								}],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { pi } = await loadTool();
			const teamlead = pi._getTool("subagent_teamlead");
			if (!teamlead) throw new Error("Team Lead tool not registered");
			const result = await teamlead.execute(
				"modern-teamlead-continuation",
				{
					items: [{ agent: "teamlead", instructions: "Coordinate the package." }],
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			const child = result.details.results[0];
			expect(child.completion).toEqual({
				status: "partial",
				completed: ["inspect"],
				remaining: ["validate"],
				validation: { status: "passed" },
				continuation: {
					sessionPath: child.sessionPath,
					additionalTimeMs: 300_000,
				},
			});
			expect(child.sessionPath).toBeTruthy();
		});

	it(
		"rejects failed Team Lead validation as complete",
		async () => {
			mockSuccessfulSpawn(JSON.stringify({
				status: "complete",
				completed: ["inspect"],
				remaining: [],
				validation: { status: "failed", reason: "tests failed" },
			}));
			const { pi } = await loadTool();
			const teamlead = pi._getTool("subagent_teamlead");
			if (!teamlead) throw new Error("Team Lead tool not registered");
			const result = await teamlead.execute(
				"modern-teamlead-failed-validation",
				{
					items: [{ agent: "teamlead", instructions: "Validate the package." }],
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.details.results[0].completion).toMatchObject({
				status: "partial",
				completed: ["inspect"],
				remaining: [],
				validation: { status: "failed", reason: "tests failed" },
			});
		});

	it(
		"merges dispatch-selected skills with agent profile skills",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-dispatch-skills",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					skills: ["typescript"],
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.isError).not.toBe(true);
			const spawnArgs = spawnMock.mock.calls[0][1] as string[];
			const skillPaths = spawnArgs.flatMap((arg, index) =>
				arg === "--skill" ? [spawnArgs[index + 1]] : [],
			);
			expect(skillPaths).toContain(path.join(skillDir, "SKILL.md"));
			expect(skillPaths.some((skillPath) =>
				skillPath.endsWith(path.join("typescript", "SKILL.md")),
			)).toBe(true);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("keeps parallel siblings running when one child fails before launch", async () => {
		await fs.promises.writeFile(
			path.join(tmpDir, ".pi", "agents", "broken.md"),
			`---
name: broken
description: Broken test agent
skills:
  - missing-skill.md
---

This agent cannot launch.
`,
			"utf8",
		);
		mockSuccessfulSpawn();
		const { tool } = await loadTool();
		const result = await tool.execute(
			"parallel-isolated-failure",
			{
				tasks: [
					{ agent: "tester", task: "Complete this sibling." },
					{ agent: "broken", task: "Fail before launch." },
				],
				agentScope: "project",
			},
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(result.details.results).toMatchObject([
			{ agent: "tester", exitCode: 0 },
			{ agent: "broken", exitCode: 1 },
		]);
		expect(result.content[0].text).toContain("Parallel: 1/2 succeeded");
	});

	it(
		"persists an opt-in child session and records its path",
		async () => {
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				const sessionPath = path.join(
					sessionDir,
					`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
				);
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(sessionPath, testSessionHeader(sessionId, tmpDir), "utf8");
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "remembered" }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-continuable",
				{
					agent: "tester",
					task: "Remember the private fact",
					agentScope: "project",
					continuable: true,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			const child = result.details.results[0];
			expect(child.sessionPath).toMatch(/\.jsonl$/);
			expect(
				path.relative(tmpDir, child.sessionPath as string),
			).not.toMatch(/^\.\.(?:[\\/]|$)/);
			expect(fs.existsSync(child.sessionPath as string)).toBe(true);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			expect(subagentRunManager.get(child.runId as string)).toMatchObject({
				owner: "direct",
				status: "completed",
				sessionPath: canonicalizeSavedSessionPath(child.sessionPath as string),
			});
			expect(child.taskId).toBeUndefined();
			const args = spawnMock.mock.calls[0][1] as string[];
			expect(args).not.toContain("--no-session");
			expect(args).toContain("--session-id");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"continues a compressed child session with the same launcher policy",
		async () => {
			const sessionPath = path.join(tmpDir, "delegated-session.jsonl");
			const original = '{"type":"session","fact":"violet-orbit"}\n';
			await fs.promises.writeFile(
				`${sessionPath}.gz`,
				zlib.gzipSync(Buffer.from(original)),
			);
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-continue",
				{
					continue: {
						agent: "tester",
						session: sessionPath,
						task: "What fact did I give you? Please spend 30 additional seconds validating it.",
					},
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.isError).not.toBe(true);
			expect(await fs.promises.readFile(sessionPath, "utf8")).toBe(original);
			expect(fs.existsSync(`${sessionPath}.gz`)).toBe(false);
			const args = spawnMock.mock.calls[0][1] as string[];
			expect(
				args.slice(args.indexOf("--session"), args.indexOf("--session") + 2),
			).toEqual(["--session", sessionPath]);
			expect(args[args.indexOf("--tools") + 1]).toBe("read,grep");
			expect(args.join(" ")).toContain("30 additional seconds");
			expect(spawnMock.mock.calls[0][2].env.PI_SUBAGENT_ROLE).toBe("leaf");
			expect(spawnMock.mock.calls[0][2].env.PI_SUBAGENT_DEPTH).toBe("1");
			const child = result.details.results[0];
			expect(child.sessionPath).toBe(sessionPath);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			expect(subagentRunManager.get(child.runId as string)?.mode).toBe(
				"continue",
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("compresses delegated sessions only after the age threshold", async () => {
		const { compressDelegatedSessions } = await import(
			"../extensions/subagent/index.ts"
		);
		const dir = path.join(tmpDir, "sessions");
		const sessionPath = path.join(dir, "old.jsonl");
		await fs.promises.mkdir(dir, { recursive: true });
		await fs.promises.writeFile(sessionPath, "old session\n", "utf8");
		const now = Date.UTC(2026, 6, 17);
		const old = new Date(now - 31 * 24 * 60 * 60 * 1000);
		await fs.promises.utimes(sessionPath, old, old);

		expect(await compressDelegatedSessions({ dir, now, dryRun: true })).toEqual(
			[sessionPath],
		);
		expect(fs.existsSync(sessionPath)).toBe(true);
		await compressDelegatedSessions({ dir, now });
		expect(fs.existsSync(sessionPath)).toBe(false);
		expect(
			zlib
				.gunzipSync(await fs.promises.readFile(`${sessionPath}.gz`))
				.toString(),
		).toBe("old session\n");
	});

	it(
		"returns schema-validated parsed output without changing schema-less defaults",
		async () => {
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(
					path.join(sessionDir, `2026-07-17T00-00-00-000Z_${sessionId}.jsonl`),
					testSessionHeader(sessionId, tmpDir),
					"utf8",
				);
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: 'Result: {"value":"valid"}' }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-structured",
				{
					agent: "tester",
					task: "Return structured output",
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.details.results[0]).toMatchObject({
				structuredOutput: { value: "valid" },
				outputAttempts: 1,
			});
			expect(result.content[0].text).toContain('{"value":"valid"}');
			const args = spawnMock.mock.calls[0][1] as string[];
			expect(args).toContain("--session-id");
			expect(args.join(" ")).toContain("Return only one JSON object");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"assigns and records one read-only fan-out arm with structural validation",
		async () => {
			await fs.promises.writeFile(
				path.join(tmpDir, ".pi", "agents", "tester.md"),
				`---
name: tester
description: Test agent
model: anthropic/claude-sonnet-4-6
effort: high
tools: read, bash, edit, write, subagent
---

You are a test agent.
`,
				"utf8",
			);
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(
					path.join(
						sessionDir,
						`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
					),
					testSessionHeader(sessionId, tmpDir),
					"utf8",
				);
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: '{"value":"valid"}' }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const toolCallId = "fanout-call-3";
			const expectedAssignment = assignReadOnlyFanoutExperiment(toolCallId, 2);
			if (!expectedAssignment) throw new Error("assignment fixture must build");
			expect(expectedAssignment.arm).toBe("parallel-specialists");
			const { tool } = await loadTool();
			const result = await tool.execute(
				toolCallId,
				{
					readOnlyFanout: {
						single: { agent: "tester", task: "Investigate both items" },
						parallel: [
							{ agent: "tester", task: "Investigate item one" },
							{ agent: "tester", task: "Investigate item two" },
						],
					},
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			const expectedWorkers =
				expectedAssignment.arm === "parallel-specialists" ? 2 : 1;
			expect(spawnMock).toHaveBeenCalledTimes(expectedWorkers);
			expect(result.details.experiment).toEqual(expectedAssignment);
			expect(result.details.results).toHaveLength(expectedWorkers);
			for (const call of spawnMock.mock.calls) {
				const args = call[1] as string[];
				const tools = args[args.indexOf("--tools") + 1];
				expect(tools).toBe("read");
				expect(tools).not.toContain("bash");
				expect(tools).not.toContain("edit");
				expect(tools).not.toContain("write");
				expect(args.join(" ")).toContain(
					"This is a read-only experiment. Do not edit files or run mutating commands.",
				);
			}
			const { getMetricsLogPath, readRecentEvents } = await import(
				"../lib/metrics.ts"
			);
			const events = readRecentEvents(100);
			const assignmentEvent = events.find(
				(event) => event.event === "orchestration_experiment_assignment",
			);
			const outcomeEvent = events.find(
				(event) => event.event === "orchestration_experiment_outcome",
			);
			const runEvent = events.find(
				(event) => event.event === "orchestration_run",
			);
			expect(assignmentEvent?.data).toMatchObject({
				assignmentId: expectedAssignment.assignmentId,
				arm: expectedAssignment.arm,
				independentWorkItems: 2,
			});
			expect(outcomeEvent?.data).toMatchObject({
				assignmentId: expectedAssignment.assignmentId,
				orchestrationId: assignmentEvent?.data?.orchestrationId,
				validationOutcome: "passed",
				checksTotal: expectedWorkers,
				checksPassed: expectedWorkers,
			});
			expect(runEvent?.data).toMatchObject({
				orchestrationId: assignmentEvent?.data?.orchestrationId,
				mode:
					expectedAssignment.arm === "parallel-specialists"
						? "parallel"
						: "single",
				fanOut: expectedWorkers,
			});
			const storedEventNames = (
				await fs.promises.readFile(getMetricsLogPath(), "utf8")
			)
				.trim()
				.split("\n")
				.map((line) => (JSON.parse(line) as { event: string }).event);
			const assignmentIndex = storedEventNames.indexOf(
				"orchestration_experiment_assignment",
			);
			const runIndex = storedEventNames.indexOf("orchestration_run");
			const outcomeIndex = storedEventNames.indexOf(
				"orchestration_experiment_outcome",
			);
			expect(assignmentIndex).toBeGreaterThanOrEqual(0);
			expect(runIndex).toBeGreaterThan(assignmentIndex);
			expect(outcomeIndex).toBeGreaterThan(runIndex);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"stops a child after 64 completed turns and returns the partial result",
		async () => {
			const proc = createMockProcess();
			const spawned = new Promise<void>((resolve) => {
				spawnMock.mockImplementation(() => {
					resolve();
					return proc;
				});
			});
			const { tool } = await loadTool();
			const execution = tool.execute(
				"call-turn-budget",
				{
					agent: "tester",
					task: "Investigate until bounded",
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);
			await spawned;
			for (let turn = 1; turn <= 64; turn += 1) {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: `turn ${turn}` }],
							stopReason: "toolUse",
						},
					})}\n${JSON.stringify({ type: "turn_end" })}\n`,
				);
			}
			proc.emit("close", null);

			const result = await execution;
			expect(result.isError).toBe(true);
			expect(result.details.results[0]).toMatchObject({
				exitCode: 0,
				stopReason: "aborted",
				errorMessage: expect.stringContaining("64-turn budget"),
				usage: { turns: 64 },
			});
			expect(result.content[0].text).toContain("output may be partial");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"stops an explicitly read-only child after eight minutes",
		async () => {
			vi.useFakeTimers();
			const proc = createMockProcess();
			const spawned = new Promise<void>((resolve) => {
				spawnMock.mockImplementation(() => {
					resolve();
					return proc;
				});
			});
			let toolCallId = "";
			for (let index = 0; index < 100; index += 1) {
				const candidate = `fanout-timeout-${index}`;
				if (
					assignReadOnlyFanoutExperiment(candidate, 2)?.arm ===
					"single-generalist"
				) {
					toolCallId = candidate;
					break;
				}
			}
			if (!toolCallId) throw new Error("single fanout assignment not found");
			const { tool } = await loadTool();
			const execution = tool.execute(
				toolCallId,
				{
					readOnlyFanout: {
						single: { agent: "tester", task: "Inspect both items" },
						parallel: [
							{ agent: "tester", task: "Inspect item one" },
							{ agent: "tester", task: "Inspect item two" },
						],
					},
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);
			await spawned;
			const { READ_ONLY_SUBAGENT_TIMEOUT_MS } = await import(
				"../extensions/subagent/index.ts"
			);
			await vi.advanceTimersByTimeAsync(READ_ONLY_SUBAGENT_TIMEOUT_MS);
			proc.emit("close", null);

			const result = await execution;
			expect(result.isError).toBe(true);
			expect(result.details.results[0]).toMatchObject({
				exitCode: 0,
				stopReason: "aborted",
				errorMessage: expect.stringContaining("wall-clock budget"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"does not start a structured-output correction after 64 turns",
		async () => {
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(
					path.join(
						sessionDir,
						`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
					),
					testSessionHeader(sessionId, tmpDir),
					"utf8",
				);
				queueMicrotask(() => {
					for (let turn = 1; turn <= 64; turn += 1) {
						proc.stdout.emit(
							"data",
							`${JSON.stringify({
								type: "message_end",
								message: {
									role: "assistant",
									content: [{ type: "text", text: "still invalid" }],
									stopReason: turn === 64 ? "stop" : "toolUse",
								},
							})}\n${JSON.stringify({ type: "turn_end" })}\n`,
						);
					}
					proc.stdout.emit(
						"data",
						`${JSON.stringify({ type: "agent_end" })}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();

			await expect(
				tool.execute(
					"call-correction-at-turn-limit",
					{
						agent: "tester",
						task: "Return structured output within the turn budget",
						agentScope: "project",
						outputSchema,
					},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("validation failed at the 64-turn budget");
			expect(spawnMock).toHaveBeenCalledTimes(1);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"uses exactly one continuation correction for invalid structured output",
		async () => {
			let call = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				if (call === 0) {
					const sessionDir = args[args.indexOf("--session-dir") + 1];
					const sessionId = args[args.indexOf("--session-id") + 1];
					fs.mkdirSync(sessionDir, { recursive: true });
					fs.writeFileSync(
						path.join(
							sessionDir,
							`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
						),
						testSessionHeader(sessionId, tmpDir),
						"utf8",
					);
				}
				const text = call++ === 0 ? "not json" : '{"value":"corrected"}';
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-corrected",
				{
					agent: "tester",
					task: "Return structured output",
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(spawnMock).toHaveBeenCalledTimes(2);
			expect(result.details.results[0]).toMatchObject({
				structuredOutput: { value: "corrected" },
				outputAttempts: 2,
			});
			const correctionArgs = spawnMock.mock.calls[1][1] as string[];
			expect(correctionArgs).toContain("--session");
			expect(correctionArgs.join(" ")).toContain(
				"previous response failed output validation",
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"fails structured output after one invalid correction",
		async () => {
			let call = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				if (call++ === 0) {
					const sessionDir = args[args.indexOf("--session-dir") + 1];
					const sessionId = args[args.indexOf("--session-id") + 1];
					fs.mkdirSync(sessionDir, { recursive: true });
					fs.writeFileSync(
						path.join(
							sessionDir,
							`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
						),
						testSessionHeader(sessionId, tmpDir),
						"utf8",
					);
				}
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: "still invalid" }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();

			await expect(
				tool.execute(
					"call-invalid-correction",
					{
						agent: "tester",
						task: "Return structured output",
						agentScope: "project",
						outputSchema,
					},
					undefined,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("failed after one correction");
			expect(spawnMock).toHaveBeenCalledTimes(2);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"round-trips a bounded structured continuation without executing it",
		async () => {
			const continuationSchema = {
				type: "object",
				properties: {
					status: { type: "string", enum: ["partial"] },
					completed: { type: "array", items: { type: "string" } },
					remaining: { type: "array", items: { type: "string" } },
					continuation: {
						type: "object",
						properties: {
							sessionPath: { type: "string" },
							additionalTimeMs: { type: "integer", minimum: 1 },
						},
						required: ["sessionPath", "additionalTimeMs"],
						additionalProperties: false,
					},
				},
				required: ["status", "completed", "remaining", "continuation"],
				additionalProperties: false,
			};
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				const sessionPath = path.join(
					sessionDir,
					`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
				);
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(sessionPath, testSessionHeader(sessionId, tmpDir), "utf8");
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{
									type: "text",
									text: JSON.stringify({
										status: "partial",
										completed: ["inspect"],
										remaining: ["validate"],
										continuation: { sessionPath, additionalTimeMs: 45_000 },
									}),
								}],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-bounded-continuation",
				{
					agent: "tester",
					task: "Return bounded progress",
					agentScope: "project",
					continuable: true,
					outputSchema: continuationSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(spawnMock).toHaveBeenCalledTimes(1);
			expect(result.details.results[0].completion).toEqual({
				status: "partial",
				completed: ["inspect"],
				remaining: ["validate"],
				validation: { status: "passed" },
				continuation: {
					sessionPath: result.details.results[0].sessionPath,
					additionalTimeMs: 45_000,
				},
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"does not preserve malformed structured continuation requests",
		async () => {
			const continuationSchema = {
				type: "object",
				properties: {
					status: { type: "string", enum: ["partial"] },
					completed: { type: "array", items: { type: "string" } },
					remaining: { type: "array", items: { type: "string" } },
					continuation: { type: "object" },
				},
				required: ["status", "completed", "remaining", "continuation"],
				additionalProperties: false,
			};
			mockSuccessfulSpawn(JSON.stringify({
				status: "partial",
				completed: ["inspect"],
				remaining: ["validate"],
				continuation: { sessionPath: "", additionalTimeMs: 0 },
			}));
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-malformed-continuation",
				{
					agent: "tester",
					task: "Return malformed bounded progress",
					agentScope: "project",
					outputSchema: continuationSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.details.results[0].completion).toEqual({
				status: "partial",
				completed: ["inspect"],
				remaining: ["validate"],
				validation: { status: "passed" },
			});
			expect(spawnMock).toHaveBeenCalledTimes(1);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"forwards normalized structured objects through chains",
		async () => {
			const spawnArgs: string[][] = [];
			let call = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				spawnArgs.push(args);
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(
					path.join(sessionDir, `2026-07-17T00-00-00-000Z_${sessionId}.jsonl`),
					testSessionHeader(sessionId, tmpDir),
					"utf8",
				);
				const text =
					call++ === 0
						? 'prose before {"value":"first"} prose after'
						: '{"value":"second"}';
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-structured-chain",
				{
					chain: [
						{ agent: "tester", task: "First" },
						{ agent: "tester", task: "Use {previous}" },
					],
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(spawnArgs[1].join(" ")).toContain('Use {"value":"first"}');
			expect(spawnArgs[1].join(" ")).not.toContain("prose before");
			expect(result.details.results[1].structuredOutput).toEqual({
				value: "second",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"forwards bulky structured chain output by artifact reference",
		async () => {
			const spawnArgs: string[][] = [];
			const largeValue = "x".repeat(STRUCTURED_TEST_ARTIFACT_BYTES);
			let call = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				spawnArgs.push(args);
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				fs.mkdirSync(sessionDir, { recursive: true });
				fs.writeFileSync(
					path.join(sessionDir, `2026-07-17T00-00-00-000Z_${sessionId}.jsonl`),
					testSessionHeader(sessionId, tmpDir),
					"utf8",
				);
				const text = JSON.stringify({
					value: call++ === 0 ? largeValue : "done",
				});
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text }],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-bulky-structured-chain",
				{
					chain: [
						{ agent: "tester", task: "First" },
						{ agent: "tester", task: "Use {previous}" },
					],
					agentScope: "project",
					outputSchema,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(spawnArgs[1].join(" ")).toContain("Output saved to:");
			expect(spawnArgs[1].join(" ")).not.toContain(largeValue);
			expect(result.details.results[0].outputReference?.bytes).toBeGreaterThan(
				STRUCTURED_TEST_ARTIFACT_BYTES,
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"waits for child close after agent_end before settling the manager run",
		async () => {
			const proc = createMockProcess();
			proc.pid = 999_999;
			proc.exitCode = null;
			proc.signalCode = null;
			const spawned = new Promise<void>((resolve) => {
				spawnMock.mockImplementation(() => {
					resolve();
					return proc;
				});
			});
			const { tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
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

			await spawned;
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
			await Promise.resolve();

			expect(subagentRunManager.list()[0]?.status).toBe("running");
			if (process.platform === "win32") {
				const firstTaskkill = spawnMock.mock.calls.find(
					([command]) => command === "taskkill",
				);
				expect(firstTaskkill?.[1]).toContain("/F");
			} else expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
			proc.emit("close", null);

			const result = await execution;
			expect(result.content[0].text).toContain("agent-end done");
			expect(result.details.results[0]?.exitCode).toBe(0);
			expect(subagentRunManager.list()[0]?.status).toBe("completed");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"fails after forced termination reaches the no-close deadline",
		async () => {
			vi.useFakeTimers();
			const proc = createMockProcess();
			proc.pid = 999_999;
			proc.exitCode = null;
			proc.signalCode = null;
			let resolveSpawn: (() => void) | undefined;
			const spawned = new Promise<void>((resolve) => {
				resolveSpawn = resolve;
			});
			spawnMock.mockImplementation(() => {
				resolveSpawn?.();
				return proc;
			});
			const { tool } = await loadTool();
			const { SUBAGENT_TERMINATION_DEADLINE_MS } = await import(
				"../extensions/subagent/index.ts"
			);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

			const execution = tool.execute(
				"call-agent-end-timeout",
				{
					agent: "tester",
					task: "Finish without closing",
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);
			await spawned;
			proc.stdout.emit("data", `${JSON.stringify({ type: "agent_end" })}\n`);
			await vi.advanceTimersByTimeAsync(SUBAGENT_TERMINATION_DEADLINE_MS);

			const result = await execution;
			if (process.platform === "win32") {
				expect(
					spawnMock.mock.calls.some(
						([command, args]) =>
							command === "taskkill" &&
							Array.isArray(args) &&
							args.includes("/F"),
					),
				).toBe(true);
			} else expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
			expect(result.details.results[0]).toMatchObject({
				exitCode: 1,
				errorMessage: expect.stringContaining("did not close within"),
			});
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "failed",
				errorMessage: expect.stringContaining("did not close within"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("defaults teamlead to coordinator and rejects unregistered role words", async () => {
		mockSuccessfulSpawn();
		const { tool } = await loadTool();
		const ctx = createMockCtx({ cwd: tmpDir });

		await tool.execute(
			"implicit-teamlead",
			{
				agent: "teamlead",
				task: "Coordinate work",
				agentScope: "project",
				background: false,
			},
			undefined,
			undefined,
			ctx,
		);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock.mock.calls[0][2].env.PI_SUBAGENT_TREE_ROLE).toBe(
			"coordinator",
		);

		await expect(
			tool.execute(
				"unregistered-orchestrator",
				{
					agent: "orchestrator",
					task: "Coordinate work",
					agentScope: "project",
					background: false,
				},
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow(/Unknown agent.*Available agents/);
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	it("resolves every Fable child to an available subscription model", async () => {
		mockSuccessfulSpawn();
		const { tool } = await loadTool();
		const cases = [
			{
				params: { agent: "subscription", task: "Pinned" },
				expected: "openai-codex/gpt-5.6-terra:high",
			},
			{
				params: { agent: "unpinned", task: "Default" },
				expected: "openai-codex/gpt-5.6-luna",
			},
			{
				params: {
					agent: "unpinned",
					task: "Small",
					modelSize: "small",
				},
				expected: "openai-codex/gpt-5.6-luna",
			},
			{
				params: {
					agent: "unpinned",
					task: "Explicit",
					model: "openai-codex/gpt-5.6-sol:xhigh",
				},
				expected: "openai-codex/gpt-5.6-sol:xhigh",
			},
		] as const;

		for (const [index, item] of cases.entries()) {
			const before = spawnMock.mock.calls.length;
			const result = await tool.execute(
				`fable-model-${index}`,
				{ ...item.params, agentScope: "project" },
				undefined,
				undefined,
				fableCtx(),
			);
			const args = spawnMock.mock.calls[before][1] as string[];
			expect(args[args.indexOf("--model") + 1]).toBe(item.expected);
			expect(result.details.results[0].role).toBe("leaf");
			expect(result.details.results[0].model).toBe(item.expected);
			const outputPath = result.details.results[0].outputPath;
			expect(outputPath).toBeDefined();
			if (outputPath) await fs.promises.rm(outputPath, { force: true });
		}
	});

	it("applies subscription routing to Mantle Opus roots", async () => {
		mockSuccessfulSpawn();
		const { tool } = await loadTool();
		const result = await tool.execute(
			"mantle-opus-model",
			{
				agent: "unpinned",
				task: "Bounded work",
				agentScope: "project",
				modelSize: "small",
			},
			undefined,
			undefined,
			createMockCtx({
				cwd: tmpDir,
				model: {
					provider: "bedrock-mantle",
					id: "anthropic.claude-opus-5",
				},
				modelRegistry: { getAvailable: vi.fn(() => subscriptionModels) },
			}),
		);
		const args = spawnMock.mock.calls[0][1] as string[];
		expect(args[args.indexOf("--model") + 1]).toBe(
			"openai-codex/gpt-5.6-luna",
		);
		expect(args[args.indexOf("--thinking") + 1]).toBe("high");
		expect(result.details.results[0].role).toBe("leaf");
	});



	it("joins every text block in the final assistant response", async () => {
		spawnMock.mockImplementation(() => {
			const proc = createMockProcess();
			queueMicrotask(() => {
				proc.stdout.emit(
					"data",
					`${JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [
								{ type: "text", text: "first block" },
								{ type: "thinking", thinking: "hidden" },
								{ type: "text", text: "second block" },
							],
							stopReason: "end_turn",
						},
					})}\n`,
				);
				proc.emit("close", 0);
			});
			return proc;
		});
		const { tool } = await loadTool();
		const result = await tool.execute(
			"joined-final-blocks",
			{
				agent: "tester",
				task: "Return two final blocks.",
				agentScope: "project",
			},
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(result.content[0].text).toBe("first block\nsecond block");
	});

	it("bounds ordinary foreground results with a private artifact", async () => {
		const fullOutput = `${"x".repeat(60_000)}\n${"line\n".repeat(2_500)}`;
		mockSuccessfulSpawn(fullOutput);
		const { tool } = await loadTool();
		const result = await tool.execute(
			"provider-bounded-output",
			{
				agent: "tester",
				task: "Return a large result",
				agentScope: "project",
				output: false,
			},
			undefined,
			undefined,
			createMockCtx({
				cwd: tmpDir,
				model: { provider: "anthropic", id: "claude-sonnet-4-6" },
			}),
		);
		const visible = result.content[0].text;
		expect(Buffer.byteLength(visible, "utf8")).toBeLessThanOrEqual(16 * 1024);
		expect(visible.split(/\r\n|\r|\n/).length).toBeLessThanOrEqual(2_000);
		expect(visible).toContain(
			"Result truncated at the provider-visible foreground boundary",
		);
		const match = visible.match(/Output saved to: (.+?) \(/);
		expect(match?.[1]).toBeDefined();
		if (match?.[1]) {
			expect(await fs.promises.readFile(match[1], "utf8")).toBe(fullOutput);
			await fs.promises.rm(match[1], { force: true });
		}
	});

	it("bounds subscription-root results and forces generated artifacts", async () => {
		const fullOutput = `${"x".repeat(60_000)}\n${"line\n".repeat(2_500)}`;
		mockSuccessfulSpawn(fullOutput);
		const { tool } = await loadTool();
		const result = await tool.execute(
			"fable-bounded-output",
			{
				agent: "unpinned",
				task: "Return a large result",
				agentScope: "project",
				output: false,
			},
			undefined,
			undefined,
			fableCtx(),
		);
		const visible = result.content[0].text;
		expect(Buffer.byteLength(visible, "utf8")).toBeLessThanOrEqual(16 * 1024);
		expect(visible.split(/\r\n|\r|\n/).length).toBeLessThanOrEqual(2_000);
		expect(visible).toContain("Result truncated at the subscription foreground boundary");

		const childPath = result.details.results[0].outputPath;
		expect(childPath).toBeDefined();
		if (childPath) {
			expect(await fs.promises.readFile(childPath, "utf8")).toBe(fullOutput);
			await fs.promises.rm(childPath, { force: true });
		}
		const match = visible.match(/Output saved to: (.+?) \(/);
		expect(match?.[1]).toBeDefined();
		if (match?.[1]) {
			expect(await fs.promises.readFile(match[1], "utf8")).toBe(fullOutput);
			await fs.promises.rm(match[1], { force: true });
		}
	});

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
		"applies Luna high, Luna medium, and Sol low to unsampled size routes",
		async () => {
			process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE = "0";
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.6-sol" },
				modelRegistry: {
					getAvailable: vi.fn(() => [
						{ provider: "openai-codex", id: "gpt-5.6-luna" },
						{ provider: "openai-codex", id: "gpt-5.6-terra" },
						{ provider: "openai-codex", id: "gpt-5.6-sol" },
					]),
				},
			});
			const cases = [
				["small", "openai-codex/gpt-5.6-luna", "high"],
				["medium", "openai-codex/gpt-5.6-luna", "medium"],
				["large", "openai-codex/gpt-5.6-sol", "low"],
			] as const;

			for (const [index, [modelSize, model, effort]] of cases.entries()) {
				await tool.execute(
					`call-size-route-${index}`,
					{
						agent: "tester",
						task: "Check routed effort",
						agentScope: "project",
						modelSize,
					},
					undefined,
					undefined,
					ctx,
				);
				const args = spawnMock.mock.calls[index][1] as string[];
				expect(args[args.indexOf("--model") + 1]).toBe(model);
				expect(args[args.indexOf("--thinking") + 1]).toBe(effort);
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"tags sampled policy-resolved dispatches with model effort and outcome telemetry",
		async () => {
			process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE = "1";
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const ctx = createMockCtx({
				cwd: tmpDir,
				model: { provider: "openai-codex", id: "gpt-5.6-sol" },
				modelRegistry: {
					getAvailable: vi.fn(() => [
						{ provider: "openai-codex", id: "gpt-5.6-luna" },
						{ provider: "openai-codex", id: "gpt-5.6-terra" },
						{ provider: "openai-codex", id: "gpt-5.6-sol" },
					]),
				},
			});

			const result = await tool.execute(
				"call-sampled-policy-dispatch",
				{
					agent: "tester",
					task: "Check sampled routing",
					agentScope: "project",
					modelSize: "medium",
				},
				undefined,
				undefined,
				ctx,
			);

			const worker = result.details.results[0];
			expect(worker.routingExperiment).toMatchObject({
				experimentId: "codex-routing-outcomes-v1",
				taskClass: "subagent-single",
			});
			const args = spawnMock.mock.calls[0][1] as string[];
			expect(args).toContain(
				`openai-codex/${worker.routingExperiment?.modelId}`,
			);
			expect(args[args.indexOf("--thinking") + 1]).toBe(
				worker.routingExperiment?.effort,
			);
			const event = (await orchestrationRuns()).at(-1);
			expect(event?.data.workers[0]).toMatchObject({
				experimentId: "codex-routing-outcomes-v1",
				experimentArm: worker.routingExperiment?.id,
				experimentTaskClass: "subagent-single",
				validationOutcome: "unavailable",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"uses explicit model over modelSize and pinned agent models",
		async () => {
			process.env.PI_ROUTING_OUTCOME_SAMPLE_RATE = "1";
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
			expect(result.details.results[0].routingExperiment).toBeUndefined();
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
		"tracks a direct run in process without creating durable task state",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

			const result = await tool.execute(
				"call-process-run",
				{
					agent: "tester",
					task: "Check the thing",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				createMockCtx({
					cwd: tmpDir,
					model: { provider: "anthropic", id: "claude-sonnet-4-6" },
				}),
			);

			expect(listTasks()).toHaveLength(0);
			const child = result.details.results[0];
			expect(child.taskId).toBeUndefined();
			expect(subagentRunManager.get(child.runId as string)).toMatchObject({
				owner: "direct",
				status: "completed",
				agent: "tester",
				model: "anthropic/claude-sonnet-4-6",
				usage: { input: 10, output: 5, turns: 1 },
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"links foreground and parallel runs to existing tasks without changing task state",
		async () => {
			mockSuccessfulSpawn();
			const { tool } = await loadTool();
			const { createTask, getTask, resolveTaskWorkspace } = await import(
				"../lib/task-registry.ts"
			);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const workspace = resolveTaskWorkspace(tmpDir);
			const nestedCwd = path.join(tmpDir, "nested-workspace");
			await fs.promises.mkdir(nestedCwd);
			const taskStates = [
				"assigned",
				"assigned",
				"assigned",
				"assigned",
				"assigned",
			] as const;
			const linkedTasks = taskStates.map((state, index) =>
				createTask({
					origin: "other",
					state,
					summary: `linked work ${index}`,
					workspace,
					sessionId: undefined,
				}),
			);
			const [singleTask, firstParallelTask, secondParallelTask, fourthTask, fifthTask] =
				linkedTasks;
			const ctx = createMockCtx({ cwd: tmpDir });

			const single = await tool.execute(
				"call-linked-single",
				{
					agent: "tester",
					task: "Check linked work",
					taskId: singleTask.id,
					role: "coordinator",
					agentScope: "project",
					background: false,
				},
				undefined,
				undefined,
				ctx,
			);
			expect(single.details.results[0].taskId).toBe(singleTask.id);
			expect(
				subagentRunManager.get(single.details.results[0].runId as string),
			).toMatchObject({ taskId: singleTask.id, owner: "task" });

			const parallel = await tool.execute(
				"call-linked-parallel",
				{
					tasks: [
						{
							agent: "tester",
							task: "Check first part",
							taskId: firstParallelTask.id,
							role: "coordinator",
							cwd: nestedCwd,
						},
						{
							agent: "tester",
							task: "Check second part",
							taskId: secondParallelTask.id,
							role: "coordinator",
						},
						{
							agent: "tester",
							task: "Check fourth part",
							taskId: fourthTask.id,
							role: "coordinator",
						},
						{
							agent: "tester",
							task: "Check fifth part",
							taskId: fifthTask.id,
							role: "coordinator",
						},
					],
					agentScope: "project",
					background: false,
				},
				undefined,
				undefined,
				ctx,
			);
			expect(parallel.details.results.map((result) => result.taskId)).toEqual([
				firstParallelTask.id,
				secondParallelTask.id,
				fourthTask.id,
				fifthTask.id,
			]);
			expect(single.details.results[0].taskId).toBe(singleTask.id);
			for (const [task, state] of linkedTasks.map((task, index) => [
				[task, taskStates[index]],
			] as const)) {
				expect(getTask(task.id)?.state).toBe(state);
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("rejects invalid task links before spawning", async () => {
		const { tool } = await loadTool();
		const { createTask, tombstoneTask, listTasks, resolveTaskWorkspace } = await import(
			"../lib/task-registry.ts"
		);
		const workspace = resolveTaskWorkspace(tmpDir);
		const deleted = createTask({
			origin: "other",
			state: "assigned",
			summary: "deleted linked work",
			workspace,
			sessionId: "parent-session",
		});
		tombstoneTask(deleted.id);
		const foreign = createTask({
			origin: "other",
			state: "assigned",
			summary: "foreign linked work",
			workspace: resolveTaskWorkspace(path.join(tmpDir, "foreign")),
			sessionId: "parent-session",
		});
		const unassigned = createTask({
			origin: "other",
			state: "unassigned",
			summary: "unassigned linked work",
			workspace,
			sessionId: "parent-session",
		});
		const wrongSession = createTask({
			origin: "other",
			state: "assigned",
			summary: "other session linked work",
			workspace,
			sessionId: "other-session",
		});
		const ctx = createMockCtx({
			cwd: tmpDir,
			sessionManager: { getSessionId: vi.fn(() => "parent-session") },
		});
		const invalidCases = [
			["missing-task", /task was not found/],
			[deleted.id, /task was not found/],
			[foreign.id, /another workspace/],
			[unassigned.id, /not assigned/],
			[wrongSession.id, /another root session/],
		] as const;

		for (const [taskId, expected] of invalidCases) {
			await expect(
				tool.execute(
					`call-invalid-task-${taskId}`,
					{
						agent: "tester",
						task: "Do not spawn",
						taskId,
						agentScope: "project",
					},
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow(expected);
		}
		expect(
			listTasks({ includeTombstones: true }).find((task) => task.id === deleted.id),
		).toMatchObject({ state: "skipped", deletedAt: expect.any(String) });
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it(
		"links background runs without changing task state",
		async () => {
			const proc = createMockProcess();
			proc.pid = process.pid;
			spawnMock.mockImplementation(() => proc);
			const { pi, tool } = await loadTool();
			const { createTask, getTask, resolveTaskWorkspace } = await import(
				"../lib/task-registry.ts"
			);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const task = createTask({
				origin: "other",
				state: "assigned",
				summary: "background linked work",
				workspace: resolveTaskWorkspace(tmpDir),
			});
			const ctx = createMockCtx({ cwd: tmpDir });
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);

			const started = await tool.execute(
				"call-linked-background",
				{
					agent: "tester",
					task: "Work in the background",
					taskId: task.id,
					role: "coordinator",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(started.content[0].text).toContain("Started task-linked background");
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(subagentRunManager.list()[0]).toMatchObject({
				taskId: task.id,
				owner: "task",
				pid: process.pid,
				status: "running",
			});
			const runId = subagentRunManager.list()[0]?.runId;
			if (!runId) throw new Error("background run missing");
			const status = pi._getTool("subagent_status");
			if (!status) throw new Error("subagent_status tool not registered");
			const inspected = await status.execute(
				"status-linked-background",
				{ processId: runId, sinceActivityVersion: 0 },
				undefined,
				undefined,
				ctx,
			);
			expect(inspected.details).toMatchObject({
				processState: "alive",
				processAlive: true,
				progressedSince: true,
			});

			proc.emit("close", 1);
			await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(pi.sendMessage.mock.calls[0][0]).toMatchObject({
				customType: "subagent-result",
				details: { taskIds: [task.id], failed: true },
			});
			expect(getTask(task.id)?.state).toBe("assigned");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"runs transient background work and delivers its result later",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi, tool } = await loadTool();
			const { listTasks } = await import("../lib/task-registry.ts");
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const ctx = createMockCtx({ cwd: tmpDir });
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);

			const started = await tool.execute(
				"call-background",
				{
					agent: "tester",
					task: "Work independently",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(started.content[0].text).toContain(
				"Started transient background single",
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(subagentRunManager.list()[0]).toMatchObject({
				owner: "direct",
				status: "running",
			});
			expect(listTasks()).toHaveLength(0);

			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [
							{
								type: "text",
								text: `discarded-${"x".repeat(60 * 1024)}-background done`,
							},
						],
						stopReason: "stop",
					},
				})}\n`,
			);
			proc.emit("close", 0);

			await vi.waitFor(
				() =>
					expect(subagentRunManager.list()[0]?.status).toBe("completed"),
				{ timeout: 5000 },
			);
			await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					customType: "subagent-result",
					content: expect.stringContaining("background done"),
				}),
				{ deliverAs: "followUp", triggerTurn: true },
			);
			const delivered = pi.sendMessage.mock.calls[0][0].content as string;
			expect(delivered).toContain("[Result truncated.");
			expect(Buffer.byteLength(delivered, "utf8")).toBeLessThanOrEqual(16 * 1024);
			const artifactMatch = delivered.match(/Output saved to: (.+?) \(/);
			expect(artifactMatch?.[1]).toBeDefined();
			if (artifactMatch?.[1]) {
				expect(await fs.promises.readFile(artifactMatch[1], "utf8")).toContain("background done");
				await fs.promises.rm(artifactMatch[1], { force: true });
			}
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"preserves background workers and rebinds status listeners across reload",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi: firstPi, tool } = await loadTool();
			const firstCtx = createMockCtx({ cwd: tmpDir });
			await firstPi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, firstCtx);
			await tool.execute(
				"call-reload-background",
				{
					agent: "tester",
					task: "Survive reload",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				firstCtx,
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(firstCtx.ui.setStatus).toHaveBeenLastCalledWith(
				"subagents",
				"subagents 1 running",
			);

			await firstPi
				._getHook("session_shutdown")[0]
				.handler({ reason: "reload" }, firstCtx);
			const firstStatusCalls = firstCtx.ui.setStatus.mock.calls.length;
			const secondPi = createMockPi();
			const mod = await import("../extensions/subagent/index.ts");
			mod.default(secondPi as Parameters<typeof mod.default>[0]);
			const secondCtx = createMockCtx({ cwd: tmpDir });
			await secondPi
				._getHook("session_start")[0]
				.handler({ reason: "reload" }, secondCtx);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "running",
				background: true,
				owner: "direct",
			});
			expect(secondCtx.ui.setStatus).toHaveBeenLastCalledWith(
				"subagents",
				"subagents 1 running",
			);

			proc.emit("close", 0);
			await vi.waitFor(
				() =>
					expect(subagentRunManager.list()[0]?.status).toBe("completed"),
				{ timeout: 5000 },
			);
			await vi.waitFor(
				() => expect(secondPi.sendMessage).toHaveBeenCalledTimes(1),
				{ timeout: 5000 },
			);
			expect(firstCtx.ui.setStatus).toHaveBeenCalledTimes(firstStatusCalls);
			expect(firstPi.sendMessage).not.toHaveBeenCalled();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"shows failed runs until the next interactive user turn",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi, tool } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);
			await tool.execute(
				"call-failed-status",
				{
					agent: "tester",
					task: "Fail visibly",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			proc.emit("error", new Error("synthetic failure"));
			await vi.waitFor(
				() =>
					expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
						"subagents",
						"subagents 1 failed",
					),
				{ timeout: 5000 },
			);

			await pi._getHook("input")[0].handler(
				{ source: "interactive", text: "continue", images: [] },
				ctx,
			);
			expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
				"subagents",
				undefined,
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it.each(["new", "resume", "fork"] as const)(
		"delivers a completion during %s session replacement exactly once",
		async (reason) => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi: firstPi, tool } = await loadTool();
			const firstCtx = createMockCtx({ cwd: tmpDir });
			await firstPi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, firstCtx);
			await tool.execute(
				"call-replacement-background",
				{
					agent: "tester",
					task: "Finish during replacement",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				firstCtx,
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			await firstPi
				._getHook("session_shutdown")[0]
				.handler({ reason }, firstCtx);
			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "replacement complete" }],
						stopReason: "stop",
					},
				})}\n`,
			);
			proc.emit("close", 0);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			await vi.waitFor(
				() =>
					expect(subagentRunManager.pendingBackgroundCompletions()).toHaveLength(
						1,
					),
				{ timeout: 5000 },
			);
			expect(firstPi.sendMessage).not.toHaveBeenCalled();

			const secondPi = createMockPi();
			const mod = await import("../extensions/subagent/index.ts");
			mod.default(secondPi as Parameters<typeof mod.default>[0]);
			const secondCtx = createMockCtx({ cwd: tmpDir });
			await secondPi
				._getHook("session_start")[0]
				.handler({ reason }, secondCtx);
			await vi.waitFor(
				() => expect(secondPi.sendMessage).toHaveBeenCalledTimes(1),
				{ timeout: 5000 },
			);
			await secondPi._getHook("agent_settled")[0].handler({}, secondCtx);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(secondPi.sendMessage).toHaveBeenCalledTimes(1);
			expect(subagentRunManager.pendingBackgroundCompletions()).toEqual([]);
			expect(secondPi.sendMessage.mock.calls[0][0]).toMatchObject({
				customType: "subagent-result",
				content: expect.stringContaining("replacement complete"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"keeps a failed background completion delivery in the manager for retry",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi, tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const ctx = createMockCtx({ cwd: tmpDir });
			pi.sendMessage.mockImplementationOnce(() => {
				throw new Error("session unavailable");
			});
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);
			await tool.execute(
				"call-retry-background",
				{
					agent: "tester",
					task: "Retry delivery",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			proc.emit("close", 0);
			await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(subagentRunManager.pendingBackgroundCompletions()).toHaveLength(1);

			await pi._getHook("agent_settled")[0].handler({}, ctx);
			await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(2), {
				timeout: 5000,
			});
			expect(subagentRunManager.pendingBackgroundCompletions()).toEqual([]);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"awaits running background worker settlement on quit",
		async () => {
			const proc = createMockProcess();
			proc.pid = 999_999;
			proc.exitCode = null;
			proc.signalCode = null;
			spawnMock.mockImplementation(() => proc);
			const { pi, tool } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);
			await tool.execute(
				"call-quit-background",
				{
					agent: "tester",
					task: "Terminate on quit",
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			const shutdown = pi
				._getHook("session_shutdown")[0]
				.handler({ reason: "quit" }, ctx);
			let shutdownComplete = false;
			void shutdown.then(() => {
				shutdownComplete = true;
			});
			if (process.platform === "win32") {
				await vi.waitFor(
					() =>
						expect(
							spawnMock.mock.calls.some(
								([command]) => command === "taskkill",
							),
						).toBe(true),
					{ timeout: 5000 },
				);
			} else {
				await vi.waitFor(
					() => expect(proc.kill).toHaveBeenCalledWith("SIGTERM"),
					{ timeout: 5000 },
				);
			}
			expect(shutdownComplete).toBe(false);
			proc.emit("close", 1);
			await shutdown;
			expect(shutdownComplete).toBe(true);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"projects child streaming and tool activity into the shared read model",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const execution = tool.execute(
				"call-live-activity",
				{
					agent: "tester",
					task: "Stream activity",
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			proc.stdout.emit(
				"data",
				[
					JSON.stringify({
						type: "tool_execution_start",
						toolCallId: "tool-1",
						toolName: "grep",
						args: { pattern: "needle" },
					}),
					JSON.stringify({
						type: "tool_execution_update",
						toolCallId: "tool-1",
						partialResult: {
							content: [{ type: "text", text: "one match" }],
						},
					}),
					JSON.stringify({
						type: "message_update",
						assistantMessageEvent: {
							type: "text_delta",
							delta: "working",
						},
					}),
				].join("\n") + "\n",
			);
			await vi.waitFor(
				() =>
					expect(subagentRunManager.list()[0]).toMatchObject({
						liveText: "working",
						liveTools: [
							{
								id: "tool-1",
								name: "grep",
								output: "one match",
							},
						],
					}),
				{ timeout: 5000 },
			);
			proc.stdout.emit(
				"data",
				[
					JSON.stringify({
						type: "tool_execution_end",
						toolCallId: "tool-1",
					}),
					JSON.stringify({
						type: "message_end",
						message: {
							role: "assistant",
							content: [{ type: "text", text: "finished" }],
							stopReason: "stop",
						},
					}),
				].join("\n") + "\n",
			);
			proc.emit("close", 0);
			await execution;
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "completed",
				liveText: "",
				liveTools: [],
				transcript: [
					{ kind: "assistant", text: "finished" },
				],
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"tracks cumulative run usage with a context peak and known zero cost",
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
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

			const result = await tool.execute(
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

			const runId = result.details.results[0].runId as string;
			expect(subagentRunManager.get(runId)?.usage).toEqual({
				input: 30,
				output: 11,
				cacheRead: 9,
				cacheWrite: 7,
				contextPeakTokens: 200,
				turns: 2,
				cost: 0,
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"settles a pre-spawn abort as cancelled",
		async () => {
			const { tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const controller = new AbortController();
			controller.abort();

			await expect(
				tool.execute(
					"call-pre-spawn-abort",
					{
						agent: "tester",
						task: "Do not spawn",
						agentScope: "project",
					},
					controller.signal,
					undefined,
					createMockCtx({ cwd: tmpDir }),
				),
			).rejects.toThrow("Subagent was aborted");
			expect(spawnMock).not.toHaveBeenCalled();
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "cancelled",
				stopReason: "aborted",
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"retains unavailable cost and partial usage when cancelled",
		async () => {
			const proc = createMockProcess();
			const spawned = new Promise<void>((resolve) => {
				spawnMock.mockImplementation(() => {
					resolve();
					return proc;
				});
			});
			const { tool } = await loadTool();
			const { createTask, getTask, resolveTaskWorkspace } = await import(
				"../lib/task-registry.ts"
			);
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);
			const task = createTask({
				origin: "other",
				state: "assigned",
				summary: "cancelled linked work",
				workspace: resolveTaskWorkspace(tmpDir),
			});
			const controller = new AbortController();
			const execution = tool.execute(
				"call-cancelled-usage",
				{
					agent: "tester",
					task: "Cancel after usage",
					taskId: task.id,
					role: "coordinator",
					agentScope: "project",
					background: false,
					confirmProjectAgents: false,
				},
				controller.signal,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			await spawned;
			expect(spawnMock).toHaveBeenCalledTimes(1);
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

			const [snapshot] = subagentRunManager.list();
			expect(snapshot).toMatchObject({
				taskId: task.id,
				owner: "task",
				status: "cancelled",
				usage: {
					input: 4,
					output: 2,
					contextPeakTokens: 12,
					cost: null,
				},
			});
			expect(getTask(task.id)?.state).toBe("assigned");
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
			const spawned = new Promise<void>((resolve) => {
				spawnMock.mockImplementation(() => {
					resolve();
					return proc;
				});
			});
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

			await spawned;
			expect(spawnMock).toHaveBeenCalledTimes(1);
			expect(partialResult).toBeDefined();
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
		"records activity and renders elapsed closeout stats",
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
								content: [
									{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "a.ts" } },
									{ type: "toolCall", id: "read-2", name: "read", arguments: { path: "a.ts" } },
									{ type: "toolCall", id: "read-3", name: "read", arguments: { path: "b.ts" } },
									{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "a.ts" } },
									{ type: "toolCall", id: "write-1", name: "write", arguments: { path: "c.ts" } },
									{ type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "pnpm test" } },
									{ type: "toolCall", id: "pwsh-1", name: "pwsh", arguments: { command: "Get-Item ." } },
									{ type: "text", text: "done" },
								],
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const result = await tool.execute(
				"call-closeout-stats",
				{
					agent: "tester",
					task: "Record closeout activity",
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);
			const worker = result.details.results[0];
			expect(worker.activity).toEqual({
				toolCalls: 7,
				distinctTools: 5,
				commandsRun: 2,
				filesRead: 2,
				filesWritten: 2,
				subagentsStarted: 1,
			});
			worker.durationMs = 125_000;
			const rendered = tool
				.renderResult(result, { expanded: true }, createMockTheme(), {})
				.render(240)
				.join("\n");
			expect(rendered).toContain("time:2m05s");
			expect(rendered).toContain("files:r2/w2");
			expect(rendered).toContain("commands:2");
			expect(rendered).toContain("tools:7");
			expect(rendered).toContain("subagents:1");
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("resolves the current CLI without a shell-name fallback", async () => {
		const cliPath = path.join(tmpDir, "cli.js");
		await fs.promises.writeFile(cliPath, "", "utf8");
		const { subagentTestApi } = await import(
			"../extensions/subagent/index.ts"
		);

		expect(
			subagentTestApi.getPiInvocation(
				["--version"],
				cliPath,
				"C:/Program Files/nodejs/node.exe",
			),
		).toEqual({
			command: "C:/Program Files/nodejs/node.exe",
			args: [cliPath, "--version"],
		});
		expect(() =>
			subagentTestApi.getPiInvocation(
				["--version"],
				path.join(tmpDir, "missing-cli.js"),
				"C:/Program Files/nodejs/node.exe",
			),
		).toThrow("Pi CLI entrypoint is unavailable");
		expect(
			subagentTestApi.getPiInvocation(
				["--version"],
				"",
				"C:/Tools/pi.exe",
			),
		).toEqual({ command: "C:/Tools/pi.exe", args: ["--version"] });
	});

	it(
		"reports child process launch errors",
		async () => {
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				queueMicrotask(() => {
					proc.emit("error", new Error("spawn node ENOENT"));
				});
				return proc;
			});
			const { tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

			const result = await tool.execute(
				"call-launch-error",
				{
					agent: "tester",
					task: "Will not launch",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.content[0].text).toContain("spawn node ENOENT");
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "failed",
				errorMessage: expect.stringContaining("spawn node ENOENT"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"reports non-JSON child startup output",
		async () => {
			spawnMock.mockImplementation(() => {
				const proc = createMockProcess();
				queueMicrotask(() => {
					proc.stdout.emit("data", "Unable to load child CLI\n");
					proc.emit("close", 1);
				});
				return proc;
			});
			const { tool } = await loadTool();
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

			const result = await tool.execute(
				"call-startup-output",
				{
					agent: "tester",
					task: "Will fail during startup",
					agentScope: "project",
					confirmProjectAgents: false,
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.content[0].text).toContain("Unable to load child CLI");
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "failed",
				errorMessage: expect.stringContaining("Unable to load child CLI"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"records a failed subagent run with its error output",
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
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

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

			const [snapshot] = subagentRunManager.list();
			expect(snapshot).toMatchObject({
				status: "failed",
				usage: {
					input: 0,
					output: 0,
					contextPeakTokens: 0,
					cost: null,
				},
			});
			expect(snapshot.errorMessage).toContain("simulated failure");
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
		"continues a task-affined Luna session through the registered modern write tool",
		async () => {
			let launch = 0;
			let savedSessionPath: string | undefined;
			const childInvocations: Array<{
				args: string[];
				env: NodeJS.ProcessEnv;
			}> = [];
			spawnMock.mockImplementation((_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
				const proc = createMockProcess();
				childInvocations.push({ args: [...args], env: options.env });
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionId = args[args.indexOf("--session-id") + 1];
				const resumedSession = args.indexOf("--session") >= 0
					? args[args.indexOf("--session") + 1]
					: undefined;
				const sessionPath =
					resumedSession ??
					path.join(sessionDir, `2026-07-17T00-00-00-000Z_${sessionId}.jsonl`);
				fs.mkdirSync(sessionDir, { recursive: true });
				if (!resumedSession) {
					savedSessionPath = sessionPath;
					fs.writeFileSync(sessionPath, testSessionHeader(sessionId, tmpDir), "utf8");
				}
				queueMicrotask(() => {
					proc.stdout.emit(
						"data",
						`${JSON.stringify({
							type: "message_end",
							message: {
								role: "assistant",
								content: [{ type: "text", text: launch++ === 0 ? "task A" : "task B" }],
								usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, cost: { total: 0.01 }, totalTokens: 15 },
								stopReason: "end_turn",
							},
						})}\n`,
					);
					proc.emit("close", 0);
				});
				return proc;
			});

			const { pi } = await loadTool();
			const modernWrite = pi._getTool("subagent_write");
			if (!modernWrite) throw new Error("subagent_write tool not registered");
			const { createTask, resolveTaskWorkspace } = await import("../lib/task-registry.ts");
			const workspace = resolveTaskWorkspace(tmpDir);
			const taskA = createTask({
				origin: "other",
				state: "assigned",
				summary: "Task A",
				workspace,
				sessionId: "modern-affinity-parent",
			});
			const taskB = createTask({
				origin: "other",
				state: "assigned",
				summary: "Task B",
				workspace,
				sessionId: "modern-affinity-parent",
			});
			const ctx = createMockCtx({
				cwd: tmpDir,
				sessionManager: {
					getSessionId: () => "modern-affinity-parent",
					getEntries: () => [],
				},
			});

			const first = await modernWrite.execute(
				"modern-affinity-task-a",
				{ items: [{ agent: "luna", instructions: "Complete task A.", taskId: taskA.id }], agentScope: "project" },
				undefined,
				undefined,
				ctx,
			);
			const firstSessionPath = first.details.results[0]?.sessionPath;
			expect(firstSessionPath).toBeDefined();
			expect(path.normalize(firstSessionPath!).toLowerCase()).toBe(
				path.normalize(savedSessionPath!).toLowerCase(),
			);
			const second = await modernWrite.execute(
				"modern-affinity-task-b",
				{
					affinityTaskId: taskA.id,
					items: [{ agent: "luna", instructions: "Continue as task B.", taskId: taskB.id }],
					agentScope: "project",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(first.details.results[0]).toMatchObject({
				taskId: taskA.id,
				continuationStatus: "fresh",
			});
			const secondSessionPath = second.details.results[0]?.sessionPath;
			expect(second.details.results[0]).toMatchObject({
				taskId: taskB.id,
				continuationStatus: "continued",
			});
			expect(path.normalize(secondSessionPath!).toLowerCase()).toBe(
				path.normalize(firstSessionPath!).toLowerCase(),
			);
			expect(childInvocations).toHaveLength(2);
			expect(childInvocations[0]?.args).toEqual(expect.arrayContaining(["--session-id", expect.any(String)]));
			expect(childInvocations[1]?.args).toEqual(
				expect.arrayContaining(["--session", secondSessionPath]),
			);
			expect(childInvocations[0]?.env).toMatchObject({
				PI_SUBAGENT_TASK_ID: taskA.id,
				PI_SUBAGENT_CONTINUATION_STATUS: "fresh",
			});
			expect(childInvocations[1]?.env).toMatchObject({
				PI_SUBAGENT_TASK_ID: taskB.id,
				PI_SUBAGENT_CONTINUATION_STATUS: "continued",
			});

			const runs = await orchestrationRuns();
			expect(runs).toHaveLength(2);
			const workers = runs.flatMap((event) => event.data.workers);
			expect(workers).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ taskId: taskA.id, continuationStatus: "fresh" }),
					expect.objectContaining({ taskId: taskB.id, continuationStatus: "continued" }),
				]),
			);
			expect(runs.every((event) => event.data.executionKind === "write")).toBe(true);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"runs a modern read in the background and delivers its result later",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => proc);
			const { pi } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });
			await pi
				._getHook("session_start")[0]
				.handler({ reason: "startup" }, ctx);
			const read = pi._getTool("subagent_read");
			if (!read) throw new Error("subagent_read tool not registered");

			const started = await read.execute(
				"modern-read-background",
				{
					items: [{ agent: "tester", instructions: "Inspect independently." }],
					agentScope: "project",
					background: true,
				},
				undefined,
				undefined,
				ctx,
			);

			expect(started.content[0].text).toContain("Started transient background single");
			await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			proc.stdout.emit(
				"data",
				`${JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "inspection complete" }],
						stopReason: "stop",
					},
				})}\n`,
			);
			proc.emit("close", 0);

			await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(1), {
				timeout: 5000,
			});
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					customType: "subagent-result",
					content: expect.stringContaining("inspection complete"),
				}),
				{ deliverAs: "followUp", triggerTurn: true },
			);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"fails a child process that exits successfully without a deliverable",
		async () => {
			const proc = createMockProcess();
			spawnMock.mockImplementation(() => {
				queueMicrotask(() => proc.emit("close", 0));
				return proc;
			});
			const { pi } = await loadTool();
			const read = pi._getTool("subagent_read");
			if (!read) throw new Error("subagent_read tool not registered");

			const result = await read.execute(
				"modern-read-empty",
				{
					items: [{ agent: "tester", instructions: "Return a required inspection result." }],
					agentScope: "project",
				},
				undefined,
				undefined,
				createMockCtx({ cwd: tmpDir }),
			);

			expect(result.details.results[0]).toMatchObject({
				stopReason: "error",
				errorMessage: "Subagent completed without the required textual or structured deliverable.",
			});
			expect(result.content[0].text).toContain("required textual or structured deliverable");
			expect(result.details.results[0].outputReference).toBeUndefined();
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"emits exactly one closeout for each modern subagent tool",
		async () => {
			mockSuccessfulSpawn();
			const { pi } = await loadTool();
			const ctx = createMockCtx({ cwd: tmpDir });

			for (const [toolName, item] of [
				["subagent_read", { agent: "tester", instructions: "Inspect the package." }],
				["subagent_write", { agent: "tester", instructions: "Update the package." }],
				["subagent_teamlead", { agent: "teamlead", instructions: "Coordinate the package." }],
			] as const) {
				const tool = pi._getTool(toolName);
				if (!tool) throw new Error(`${toolName} tool not registered`);
				await tool.execute(
					`modern-${toolName}`,
					{ items: [item], agentScope: "project" },
					undefined,
					undefined,
					ctx,
				);
			}

			const runs = await orchestrationRuns();
			expect(runs).toHaveLength(3);
			expect(runs.map((event) => event.data.executionKind)).toEqual(
				expect.arrayContaining(["read", "write", "coordinator"]),
			);
			for (const executionKind of ["read", "write", "coordinator"])
				expect(
					runs.filter((event) => event.data.executionKind === executionKind),
				).toHaveLength(1);
			expect(runs.every((event) => event.data.workers)).toBe(true);
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it(
		"closes a partial coordinator budget once and does not duplicate it on continuation",
		async () => {
			let launch = 0;
			spawnMock.mockImplementation((_command: string, args: string[]) => {
				const proc = createMockProcess();
				const sessionDir = args[args.indexOf("--session-dir") + 1];
				const sessionIndex = args.indexOf("--session-id");
				const sessionArgIndex = args.indexOf("--session");
				const sessionId =
					sessionIndex >= 0
						? args[sessionIndex + 1]
						: `budget-continuation-${launch}`;
				const resumedSessionPath =
					sessionArgIndex >= 0 ? args[sessionArgIndex + 1] : undefined;
				const sessionPath =
					resumedSessionPath ??
					path.join(
						sessionDir,
						`2026-07-17T00-00-00-000Z_${sessionId}.jsonl`,
					);
				fs.mkdirSync(sessionDir, { recursive: true });
				if (!fs.existsSync(sessionPath))
					fs.writeFileSync(sessionPath, testSessionHeader(sessionId, tmpDir), "utf8");
				queueMicrotask(() => {
					if (launch === 0) {
						for (let turn = 1; turn <= 32; turn += 1) {
							proc.stdout.emit(
								"data",
								`${JSON.stringify({
									type: "message_end",
									message: {
										role: "assistant",
										content: [{ type: "text", text: `partial ${turn}` }],
										stopReason: "toolUse",
									},
								})}\n${JSON.stringify({ type: "turn_end" })}\n`,
							);
						}
					} else {
						proc.stdout.emit(
							"data",
							`${JSON.stringify({
								type: "message_end",
								message: {
									role: "assistant",
									content: [{ type: "text", text: "continued" }],
									stopReason: "end_turn",
								},
							})}\n`,
						);
					}
					launch += 1;
					proc.emit("close", 0);
				});
				return proc;
			});

			const { pi } = await loadTool();
			const teamlead = pi._getTool("subagent_teamlead");
			if (!teamlead) throw new Error("subagent_teamlead tool not registered");
			const ctx = createMockCtx({ cwd: tmpDir });
			const first = await teamlead.execute(
				"modern-coordinator-budget",
				{
					items: [{ agent: "teamlead", instructions: "Coordinate until bounded." }],
					agentScope: "project",
				},
				undefined,
				undefined,
				ctx,
			);
			const original = (await orchestrationRuns())[0];
			expect(original).toMatchObject({
				data: {
					executionKind: "coordinator",
					outcomeCode: "timeout",
					coordinatorBudgetOutcome: "max_turns",
				},
			});
			expect(first.details.results[0].completion?.status).toBe("partial");

			const continuation = pi._getTool("subagent_continue");
			if (!continuation) throw new Error("subagent_continue tool not registered");
			await continuation.execute(
				"modern-coordinator-continuation",
				{
					agent: "builder",
					session: first.details.results[0].sessionPath,
					task: "Continue the bounded coordination.",
				},
				undefined,
				undefined,
				ctx,
			);

			const runs = await orchestrationRuns();
			expect(runs).toHaveLength(2);
			expect(runs.filter((event) => event.data.orchestrationId === original.data.orchestrationId)).toHaveLength(1);
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
			await expect(
				execute({
					agent: "missing",
					task: "failure",
					agentScope: "project",
				}),
			).rejects.toThrow('Unknown agent: "missing"');

			const runs = await orchestrationRuns();
			expect(runs).toHaveLength(4);
			const byMode = new Map(
				runs.map((event) => [
					(event.data as { mode: string }).mode,
					event.data as {
						schemaVersion: number;
						status: string;
						executionKind: string;
						outcomeCode: string;
						legacyAdapterUse: boolean;
						legacyAdapterBranch: string;
						onclaveEligible: boolean;
						parentVisibleBytes: number;
						workers: Array<{
							chainTransferBytes?: number;
							parentVisibleBytes: number;
							durationMs: number;
							executionKind: string;
							outcomeCode: string;
							onclaveEligible: boolean;
							usage: { inputTokens: number; costSource: string };
						}>;
					},
				]),
			);
			const parallel = byMode.get("parallel");
			expect(parallel).toMatchObject({
				schemaVersion: 3,
				executionKind: "legacy",
				outcomeCode: "completed",
				legacyAdapterUse: true,
				legacyAdapterBranch: "parallel",
				onclaveEligible: false,
			});
			expect(parallel?.workers).toHaveLength(2);
			expect(parallel?.parentVisibleBytes).toBeGreaterThan(0);
			expect(
				parallel?.workers.every((worker) => worker.parentVisibleBytes === 0),
			).toBe(true);
			expect(parallel?.workers.every((worker) => worker.durationMs >= 0)).toBe(
				true,
			);
			expect(
				parallel?.workers.every(
					(worker) =>
						worker.usage.inputTokens === 10 &&
						worker.executionKind === "legacy" &&
						worker.outcomeCode === "completed" &&
						worker.onclaveEligible === false,
				),
			).toBe(true);
			const chain = byMode.get("chain");
			expect(chain?.workers[0]?.chainTransferBytes).toBeGreaterThan(0);
			expect(chain?.workers[0]?.parentVisibleBytes).toBe(0);
			const failure = runs.find(
				(event) => (event.data as { status: string }).status === "rejected",
			)?.data as { status: string } | undefined;
			expect(failure?.status).toBe("rejected");
			const serializedRuns = JSON.stringify(runs);
			expect(serializedRuns).not.toContain("Unknown agent");
			for (const forbidden of ["parallel one", "chain one", tmpDir])
				expect(serializedRuns).not.toContain(forbidden);
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
			const { subagentRunManager } = await import(
				"../extensions/subagent/run-manager.ts"
			);

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
			expect(subagentRunManager.list()).toHaveLength(1);
			expect(subagentRunManager.list()[0]).toMatchObject({
				status: "failed",
				errorMessage: expect.stringContaining("not supported"),
			});
		},
		SUBAGENT_TEST_TIMEOUT_MS,
	);

	it("pretty-prints subagent control results without changing details", async () => {
		const { pi } = await loadTool();
		const { getSubagentTreeBroker } = await import("../extensions/subagent/tree-runtime.ts");
		getSubagentTreeBroker().createTree({
			treeId: "formatting-tree",
			rootRunId: "formatting-root",
		});
		const control = pi._getTool("subagent_control");
		if (!control) throw new Error("subagent_control tool not registered");

		const controlled = await control.execute(
			"control-formatting",
			{ action: "cancel", selector: { type: "process", processId: "formatting-root" } },
			undefined,
			undefined,
			createMockCtx({ cwd: tmpDir }),
		);

		expect(controlled.content[0].text).toContain('\n  "action": "cancel"');
		expect(JSON.parse(controlled.content[0].text)).toEqual(controlled.details);
	});
});
