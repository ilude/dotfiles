import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	READ_TOOL_ALLOWLIST,
	SubagentTeamleadSchema,
	SubagentReadSchema,
	SubagentWriteSchema,
	prepareSubagentExecution,
	resolveTaskLink,
} from "../extensions/subagent/contracts.ts";
import {
	adaptLegacySubagentInvocation,
	HISTORICAL_SUBAGENT_TOOL_NAMES,
} from "../extensions/subagent/legacy-adapter.ts";
import { modernRequestToExecutorInput } from "../extensions/subagent/modern-adapter.ts";
import type { PreparedSubagentExecution } from "../extensions/subagent/contracts.ts";
import {
	classifySubagentResult,
	resolveChildToolAuthority,
} from "../extensions/subagent/index.ts";
import {
	diagnoseAgentAvailability,
	formatAgentAvailabilityDiagnostic,
} from "../extensions/subagent/agents.ts";
import {
	resolveTaskSessionAffinity,
	SubagentRunManager,
	type SubagentExecutionFingerprint,
	type SubagentRunSnapshot,
} from "../extensions/subagent/run-manager.ts";
import { createTask, resolveTaskWorkspace } from "../lib/task-registry.ts";
import { closeTaskDatabase, initializeTaskStore } from "../lib/task-store.ts";

type SchemaObject = {
	properties?: Record<string, SchemaObject>;
	items?: SchemaObject;
	type?: string;
};

function schemaProperties(schema: unknown): Record<string, SchemaObject> {
	return ((schema as SchemaObject).properties ?? {}) as Record<string, SchemaObject>;
}

describe("subagent T1 execution contracts", () => {
	it("keeps role-specific fields out of the three modern schemas", () => {
		const readItem = schemaProperties(schemaProperties(SubagentReadSchema).items?.items);
		const writeItem = schemaProperties(schemaProperties(SubagentWriteSchema).items?.items);
		const coordinator = schemaProperties(SubagentTeamleadSchema);
		const coordinatorItem = schemaProperties(coordinator.items?.items);

		expect(readItem).not.toHaveProperty("role");
		expect(readItem).not.toHaveProperty("scope");
		expect(readItem).not.toHaveProperty("workBoundary");
		expect(writeItem).not.toHaveProperty("role");
		expect(writeItem).not.toHaveProperty("scope");
		expect(writeItem).not.toHaveProperty("workBoundary");
		expect(coordinatorItem).not.toHaveProperty("role");
		expect(coordinatorItem).not.toHaveProperty("scope");
		expect(coordinatorItem).not.toHaveProperty("workPaths");
		expect(coordinatorItem).toHaveProperty("instructions");
		expect(coordinator).toHaveProperty("boundary");
		expect(coordinator).not.toHaveProperty("workBoundary");
		expect(readItem).toHaveProperty("skills");
		expect(writeItem).toHaveProperty("skills");
		expect(coordinatorItem).toHaveProperty("skills");
	});

	it("accepts affinity only for correlated single modern requests", () => {
		const read = schemaProperties(SubagentReadSchema);
		const write = schemaProperties(SubagentWriteSchema);
		expect(read).toHaveProperty("affinityTaskId");
		expect(write).toHaveProperty("affinityTaskId");
		expect(() =>
			prepareSubagentExecution(
				{
					kind: "read",
					affinityTaskId: "task-a",
					items: [
						{ agent: "reader", task: "one", taskId: "task-b" },
						{ agent: "reader", task: "two", taskId: "task-b" },
					],
				},
				{ parentCwd: process.cwd() },
			),
		).toThrow("single-item");
	});

	it("selects the latest eligible Luna generation and rejects every affinity boundary mismatch", () => {
		const fingerprint: SubagentExecutionFingerprint = {
			agent: "builder",
			skills: ["typescript"],
			role: "leaf",
			depth: 1,
			model: "openai-codex/gpt-5.6-luna",
			effort: "medium",
			authorityTools: ["read", "bash"],
		};
		const base = {
			runId: "run-a",
			taskId: "task-a",
			parentSessionId: "root",
			workspaceId: "/repo",
			model: fingerprint.model,
			sessionPath: "session-a.jsonl",
			status: "completed",
			settledAt: 1,
			settlementOrder: 1,
			executionFingerprint: fingerprint,
		} as unknown as SubagentRunSnapshot;
		const latest = { ...base, runId: "run-b", sessionPath: "session-b.jsonl", settlementOrder: 2 };
		const identity = { parentSessionId: "root", workspaceId: "/repo", fingerprint };
		expect(resolveTaskSessionAffinity([base, latest], "task-a", identity)).toMatchObject({
			outcome: "resolved",
			run: { runId: "run-b" },
		});
		const rejected = [
			["missing session", { sessionPath: undefined }],
			["missing root identity", { parentSessionId: undefined }],
			["missing workspace identity", { workspaceId: undefined }],
			["failed", { status: "failed" }],
			["active", { status: "running" }],
			["wrong root", { parentSessionId: "other" }],
			["wrong workspace", { workspaceId: "/other" }],
			["non-Luna", { model: "openai-codex/gpt-5.6-sol" }],
			["changed model", { executionFingerprint: { ...fingerprint, model: "openai-codex/gpt-5.6-sol" } }],
			["changed effort", { executionFingerprint: { ...fingerprint, effort: "high" } }],
			["changed profile", { executionFingerprint: { ...fingerprint, agent: "reviewer" } }],
			["changed role", { executionFingerprint: { ...fingerprint, role: "coordinator" } }],
			["changed depth", { executionFingerprint: { ...fingerprint, depth: 2 } }],
			["changed authority", { executionFingerprint: { ...fingerprint, authorityTools: ["read"] } }],
			["changed skills", { executionFingerprint: { ...fingerprint, skills: ["python"] } }],
		] as const;
		for (const [, patch] of rejected) {
			const candidate = { ...base, ...patch } as unknown as SubagentRunSnapshot;
			const result = resolveTaskSessionAffinity([candidate], "task-a", identity);
			expect(result.outcome).toBe("rejected");
			if (result.outcome === "rejected") {
				expect(result.reason).toContain("affinityTaskId=task-a");
				expect(result.reason).toContain("bounded eligible candidate count=");
			}
		}
		const ambiguous = [
			{ ...base, runId: "run-c", sessionPath: "session-c.jsonl", settlementOrder: 3 },
			{ ...base, runId: "run-d", sessionPath: "session-d.jsonl", settlementOrder: 3 },
		];
		expect(resolveTaskSessionAffinity(ambiguous, "task-a", identity).outcome).toBe("rejected");
	});

	it("scans alias generations of the canonical session and preserves task-B correlation", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-session-"));
		const session = path.join(directory, "session.jsonl");
		fs.writeFileSync(session, "");
		const fingerprint: SubagentExecutionFingerprint = {
			agent: "builder",
			skills: ["typescript", "dispatch"],
			role: "leaf",
			depth: 1,
			model: "openai-codex/gpt-5.6-luna",
			effort: "medium",
			authorityTools: ["bash", "read"],
		};
		const makeRun = (runId: string, taskId: string, sessionPath: string, order: number) => ({
			runId,
			taskId,
			parentSessionId: "root",
			workspaceId: directory,
			model: fingerprint.model,
			sessionPath,
			status: "completed",
			settledAt: order,
			settlementOrder: order,
			executionFingerprint: fingerprint,
		}) as unknown as SubagentRunSnapshot;
		try {
			const result = resolveTaskSessionAffinity(
				[
					makeRun("run-a", "task-a", session, 1),
					makeRun("run-b", "task-b", path.join(directory, ".", "session.jsonl"), 2),
				],
				"task-a",
				{ parentSessionId: "root", workspaceId: path.join(directory, "."), fingerprint },
			);
			expect(result).toMatchObject({ outcome: "resolved", run: { runId: "run-b", taskId: "task-b" } });
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	it("holds a canonical-session lease through settlement and path aliases", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-lease-"));
		const session = path.join(directory, "canonical.jsonl");
		fs.writeFileSync(session, "");
		const manager = new SubagentRunManager();
		const release = manager.acquireSessionLease(session, "run-a");
		try {
			expect(() => manager.acquireSessionLease(path.join(directory, ".", "canonical.jsonl"), "run-b")).toThrow("already active");
			manager.begin({ runId: "run-a", owner: "task", mode: "task-execute", agent: "builder", task: "work", cwd: "/repo" }, new AbortController());
			manager.settle("run-a", { status: "completed", sessionPath: session });
			expect(() => manager.acquireSessionLease(path.join(directory, "missing", "..", "canonical.jsonl"), "run-b")).toThrow("already active");
		} finally {
			release();
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	it("diagnoses unavailable agents against the effective scope before spawn", () => {
		const reader = {
			name: "reader",
			description: "reader",
			systemPrompt: "",
			source: "user" as const,
			filePath: "reader.md",
		};
		const developer = {
			name: "developer",
			description: "developer",
			systemPrompt: "",
			source: "user" as const,
			filePath: "developer.md",
		};
		const diagnostic = diagnoseAgentAvailability(
			["missing", "developer", "reader"],
			[reader],
			"project",
			{
				user: [reader, developer],
				project: [reader],
				both: [reader, developer],
			},
		);
		expect(diagnostic).toEqual({
			rejected: ["missing", "developer"],
			agentScope: "project",
			alternatives: ["reader"],
			scopeHints: [{ name: "developer", scopes: ["user", "both"] }],
		});
		const message = formatAgentAvailabilityDiagnostic(diagnostic!);
		expect(message).toContain('Usable alternatives: "reader"');
		expect(message).toContain(
			'"developer" is available with agentScope "user" or "both".',
		);
		expect(message).not.toMatch(/"missing" is available with agentScope/);
	});

	it("keeps completion, partial, and blocked worker states distinct", () => {
		expect(
			classifySubagentResult({ exitCode: 0 }),
		).toBe("completed");
		expect(
			classifySubagentResult({
				exitCode: 0,
				stopReason: "aborted",
				errorMessage: "soft deadline reached",
			}),
		).toBe("cancelled");
		expect(
			classifySubagentResult({
				exitCode: 1,
				errorMessage: "required validation is missing",
			}),
		).toBe("failed");
	});

	it("projects read authority from the closed positive allowlist", () => {
		const authority = resolveChildToolAuthority(
			{
				name: "reader",
				description: "reader",
				tools: [...READ_TOOL_ALLOWLIST, "registered_unknown_mutation"],
				systemPrompt: "",
				source: "user",
				filePath: "reader.md",
			},
			{ role: "leaf", hasScopeLease: false, executionKind: "read" },
		);

		expect(authority.tools).toEqual([...READ_TOOL_ALLOWLIST]);
		expect(authority.canDirectlyMutate).toBe(false);
	});

	it("resolves target-workspace trust before project-agent discovery", () => {
		const parent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-parent-"));
		const target = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-target-"));
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		const previousOperatorDir = process.env.PI_OPERATOR_DIR;
		const operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-operator-"));
		process.env.PI_OPERATOR_DIR = operatorDir;
		initializeTaskStore(operatorDir);
		const agentDir = path.join(parent, "agent");
		const projectAgents = path.join(target, ".pi", "agents");
		fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
		fs.mkdirSync(projectAgents, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "agents", "reader.md"),
			"---\nname: reader\ndescription: reader\n---\nRead.\n",
		);
		fs.writeFileSync(
			path.join(projectAgents, "target.md"),
			"---\nname: target\ndescription: target\n---\nTarget.\n",
		);
		process.env.PI_CODING_AGENT_DIR = agentDir;
		try {
			const trusted = prepareSubagentExecution(
				{
					kind: "read",
					items: [{ agent: "target", task: "Inspect" }],
					workspaceRoot: target,
					agentScope: "project",
				},
				{
					parentCwd: parent,
					isWorkspaceTrusted: (workspaceRoot) => workspaceRoot === target,
				},
			);
			expect(() =>
				prepareSubagentExecution(
					{
						kind: "read",
						items: [{ agent: "reader", task: "Inspect" }],
						workspaceRoot: target,
						agentScope: "project",
					},
					{
						parentCwd: parent,
						isWorkspaceTrusted: (workspaceRoot) => workspaceRoot === target,
					},
				),
			).toThrow(
				/Available agents: "target".*"reader" is available with agentScope "user" or "both"/,
			);
			const untrusted = prepareSubagentExecution(
				{
					kind: "read",
					items: [{ agent: "reader", task: "Inspect" }],
					workspaceRoot: target,
					agentScope: "project",
				},
				{ parentCwd: parent, isWorkspaceTrusted: () => false },
			);
			expect(trusted.projectTrusted).toBe(true);
			expect(trusted.items[0]?.agent.source).toBe("project");
			expect(untrusted.projectTrusted).toBe(false);
			expect(untrusted.items[0]?.agent.source).toBe("user");
			expect(() =>
				prepareSubagentExecution(
					{
						kind: "read",
						items: [
							{
								agent: "reader",
								task: "Inspect",
								skills: ["definitely-missing-dispatch-skill"],
							},
						],
						workspaceRoot: target,
					},
					{ parentCwd: parent, isWorkspaceTrusted: () => false },
				),
			).toThrow("references unknown skill");
			expect(() =>
				prepareSubagentExecution(
					{
						kind: "read",
						items: [
							{
								agent: "reader",
								task: "Inspect",
								skills: ["../skills/untrusted.md"],
							},
						],
						workspaceRoot: target,
					},
					{ parentCwd: parent, isWorkspaceTrusted: () => false },
				),
			).toThrow("must be a discovered skill name");
			expect(() =>
				prepareSubagentExecution(
					{
						kind: "read",
						items: [{ agent: "reader", task: "Inspect", cwd: parent }],
						workspaceRoot: target,
					},
					{ parentCwd: parent, isWorkspaceTrusted: () => false },
				),
			).toThrow("escapes the assigned workspace");
		} finally {
			closeTaskDatabase(operatorDir);
			if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
			else process.env.PI_OPERATOR_DIR = previousOperatorDir;
			fs.rmSync(operatorDir, { recursive: true, force: true });
			fs.rmSync(parent, { recursive: true, force: true });
			fs.rmSync(target, { recursive: true, force: true });
		}
	});

	it("distinguishes explicit, automatic, ambiguous, non-assigned, and foreign task links", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-tasks-"));
		const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-other-"));
		const previousOperatorDir = process.env.PI_OPERATOR_DIR;
		const operatorDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-operator-"));
		process.env.PI_OPERATOR_DIR = operatorDir;
		initializeTaskStore(operatorDir);
		try {
			const one = createTask({
				origin: "other",
				state: "assigned",
				summary: "one",
				workspace: resolveTaskWorkspace(workspace),
				sessionId: "root",
			});
			expect(resolveTaskLink(undefined, workspace, "root")).toMatchObject({
				outcome: "auto",
				task: { id: one.id },
			});
			const two = createTask({
				origin: "other",
				state: "assigned",
				summary: "two",
				workspace: resolveTaskWorkspace(workspace),
				sessionId: "root",
			});
			expect(resolveTaskLink(undefined, workspace, "root")).toEqual({ outcome: "none" });
			expect(resolveTaskLink(one.id, workspace, "root")).toMatchObject({ outcome: "explicit" });
			expect(resolveTaskLink("missing-task", workspace, "root")).toMatchObject({
				outcome: "invalid",
				choices: expect.arrayContaining([
					expect.objectContaining({ id: one.id }),
					expect.objectContaining({ id: two.id }),
				]),
			});
			const stale = createTask({
				origin: "other",
				state: "completed",
				summary: "stale",
				workspace: resolveTaskWorkspace(workspace),
			});
			expect(resolveTaskLink(stale.id, workspace, "root")).toMatchObject({
				outcome: "invalid",
				reason: "task is not assigned",
			});
			const foreign = createTask({
				origin: "other",
				state: "assigned",
				summary: "foreign",
				workspace: resolveTaskWorkspace(otherWorkspace),
			});
			expect(resolveTaskLink(foreign.id, workspace, "root")).toMatchObject({
				outcome: "invalid",
				reason: "task belongs to another workspace",
			});
		} finally {
			closeTaskDatabase(operatorDir);
			if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
			else process.env.PI_OPERATOR_DIR = previousOperatorDir;
			fs.rmSync(operatorDir, { recursive: true, force: true });
			fs.rmSync(workspace, { recursive: true, force: true });
			fs.rmSync(otherWorkspace, { recursive: true, force: true });
		}
	});

	it("passes each prepared item's canonical cwd and dispatch skills to the executor adapter", () => {
		const request = {
			kind: "read" as const,
			items: [
				{
					agent: "reader",
					task: "inspect",
					cwd: "/prepared/item",
					skills: ["typescript"],
				},
			],
		};
		const prepared = {
			items: [
				{
					request: request.items[0],
					workspaceRoot: "/workspace/root",
					taskLink: { outcome: "none" as const },
				},
			],
		} as unknown as PreparedSubagentExecution;

		expect(modernRequestToExecutorInput(request, prepared)).toMatchObject({
			cwd: "/prepared/item",
			skills: ["typescript"],
		});
	});

	it("translates every historical tool name through the compatibility adapter", () => {
		const fixtures: Record<string, unknown> = {
			subagent: { agent: "reader", task: "read", role: "leaf", scope: ["src"] },
			subagent_chain: { steps: [{ agent: "reader", task: "first" }] },
			subagent_continue: { agent: "reader", session: "saved.jsonl", task: "again" },
			subagent_fanout: {
				single: { agent: "reader", task: "one" },
				parallel: [{ agent: "reader", task: "two" }, { agent: "reader", task: "three" }],
			},
			subagent_workflow: { id: "workflow", items: [] },
		};
		for (const name of HISTORICAL_SUBAGENT_TOOL_NAMES) {
			const result = adaptLegacySubagentInvocation(name, fixtures[name]);
			expect(result.toolName).toBe(name);
			expect(result.branch).toBeDefined();
		}
		const continuation = adaptLegacySubagentInvocation(
			"subagent_continue",
			fixtures.subagent_continue,
		);
		expect(continuation.sessionPath).toBe("saved.jsonl");
		const legacy = adaptLegacySubagentInvocation("subagent", fixtures.subagent);
		if (!legacy.request || legacy.request.kind !== "write") throw new Error("legacy request missing");
		expect(legacy.request.items[0]).not.toHaveProperty("role");
		expect(legacy.request.items[0]).toMatchObject({
			agent: "reader",
			instructions: "read",
			boundaryPaths: ["src"],
		});
		const correlated = adaptLegacySubagentInvocation("subagent", {
			agent: "reader",
			task: "read",
			taskId: "task-root",
		});
		expect(correlated.request?.items[0]).toMatchObject({ taskId: "task-root" });
		expect(() =>
			adaptLegacySubagentInvocation("subagent", {
				taskId: "task-root",
				tasks: [
					{ agent: "reader", task: "one" },
					{ agent: "reader", task: "two" },
				],
			}),
		).toThrow("only valid for a single item");
	});
});
