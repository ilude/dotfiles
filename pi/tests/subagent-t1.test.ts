import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	READ_TOOL_ALLOWLIST,
	SubagentCoordinateSchema,
	SubagentReadSchema,
	SubagentWriteSchema,
	prepareSubagentExecution,
	resolveTaskLink,
} from "../extensions/subagent/contracts.ts";
import {
	adaptLegacySubagentInvocation,
	HISTORICAL_SUBAGENT_TOOL_NAMES,
} from "../extensions/subagent/legacy-adapter.ts";
import { resolveChildToolAuthority } from "../extensions/subagent/index.ts";
import { createTask, resolveTaskWorkspace } from "../lib/task-registry.ts";

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
		const coordinator = schemaProperties(SubagentCoordinateSchema);
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
		expect(coordinator).toHaveProperty("workBoundary");
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
						items: [{ agent: "reader", task: "Inspect", cwd: parent }],
						workspaceRoot: target,
					},
					{ parentCwd: parent, isWorkspaceTrusted: () => false },
				),
			).toThrow("escapes the assigned workspace");
		} finally {
			if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			fs.rmSync(parent, { recursive: true, force: true });
			fs.rmSync(target, { recursive: true, force: true });
		}
	});

	it("distinguishes explicit, automatic, ambiguous, stale, and foreign task links", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-tasks-"));
		const otherWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-other-"));
		const previousOperatorDir = process.env.PI_OPERATOR_DIR;
		process.env.PI_OPERATOR_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-t1-operator-"));
		try {
			const one = createTask({
				origin: "other",
				state: "running",
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
				state: "running",
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
				reason: "task is not running",
			});
			const foreign = createTask({
				origin: "other",
				state: "running",
				summary: "foreign",
				workspace: resolveTaskWorkspace(otherWorkspace),
			});
			expect(resolveTaskLink(foreign.id, workspace, "root")).toMatchObject({
				outcome: "invalid",
				reason: "task belongs to another workspace",
			});
		} finally {
			if (previousOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
			else process.env.PI_OPERATOR_DIR = previousOperatorDir;
			fs.rmSync(workspace, { recursive: true, force: true });
			fs.rmSync(otherWorkspace, { recursive: true, force: true });
		}
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
		expect(legacy.request.items[0]).toMatchObject({ agent: "reader", task: "read", workPaths: ["src"] });
	});
});
