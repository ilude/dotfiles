import { Type, type TSchema } from "typebox";
import {
	getTask,
	listTasks,
	resolveTaskWorkspace,
	type TaskRecordV1,
} from "../../lib/task-registry.js";
import {
	discoverAgents,
	withDispatchSkills,
	type AgentConfig,
	type AgentDiscoveryResult,
	type AgentScope,
} from "./agents.js";
import {
	checkNativePathTool,
	resolveWorkspaceRoot,
} from "./workspace-policy.js";

export const READ_TOOL_ALLOWLIST = ["read", "grep", "find", "ls"] as const;
export type ReadToolName = (typeof READ_TOOL_ALLOWLIST)[number];

export type ExecutionKind = "read" | "write" | "coordinator";

export const DEFAULT_COORDINATOR_MAX_WORKERS = 6;
export const DEFAULT_COORDINATOR_MAX_TURNS = 32;
export const DEFAULT_COORDINATOR_SOFT_DEADLINE_MS = 15 * 60 * 1000;

export interface SubagentItemBase {
	readonly agent: string;
	readonly task: string;
	readonly taskId?: string;
	readonly cwd?: string;
	readonly effort?: string;
	readonly skills?: readonly string[];
}

export interface ReadItem extends SubagentItemBase {
	readonly workPaths?: readonly string[];
}

export interface WriteItem extends SubagentItemBase {
	readonly workPaths?: readonly string[];
}

export type CoordinatorItem = SubagentItemBase;

export interface ReadRequest {
	readonly kind: "read";
	readonly items: readonly ReadItem[];
	readonly workspaceRoot?: string;
	readonly agentScope?: AgentScope;
}

export interface WriteRequest {
	readonly kind: "write";
	readonly items: readonly WriteItem[];
	readonly workspaceRoot?: string;
	readonly agentScope?: AgentScope;
}

export interface CoordinatorRequest {
	readonly kind: "coordinator";
	readonly items: readonly CoordinatorItem[];
	readonly workBoundary?: readonly string[];
	readonly maxWorkers?: number;
	readonly maxTurns?: number;
	readonly softDeadlineMs?: number;
	readonly workspaceRoot?: string;
	readonly agentScope?: AgentScope;
}

export type SubagentExecutionRequest =
	| ReadRequest
	| WriteRequest
	| CoordinatorRequest;

export interface SubagentItemResult {
	readonly agent: string;
	readonly taskId?: string;
	readonly status: "completed" | "failed" | "cancelled";
	readonly workPaths?: readonly string[];
	readonly workBoundary?: readonly string[];
	readonly output?: string;
}

export interface SubagentExecutionResult {
	readonly kind: ExecutionKind;
	readonly items: readonly SubagentItemResult[];
}

export interface ReadExecutionPolicy {
	readonly kind: "read";
	readonly tools: readonly ReadToolName[];
	readonly canMutate: false;
	readonly canDelegate: false;
}

export interface WriteExecutionPolicy {
	readonly kind: "write";
	readonly tools: readonly string[];
	readonly canMutate: true;
	readonly canDelegate: false;
}

export interface CoordinatorExecutionPolicy {
	readonly kind: "coordinator";
	readonly tools: readonly string[];
	readonly canMutate: false;
	readonly canDelegate: true;
}

export type ExecutionPolicy =
	| ReadExecutionPolicy
	| WriteExecutionPolicy
	| CoordinatorExecutionPolicy;

export interface PreparedSubagentItem<TItem extends SubagentItemBase> {
	readonly request: TItem;
	readonly workspaceRoot: string;
	readonly taskLink: TaskLinkResolution;
	readonly agent: AgentConfig;
	readonly projectTrusted: boolean;
	readonly discovery: AgentDiscoveryResult;
}

export interface PreparedSubagentExecution {
	readonly request: SubagentExecutionRequest;
	readonly policy: ExecutionPolicy;
	readonly workspaceRoot: string;
	readonly projectTrusted: boolean;
	readonly discovery: AgentDiscoveryResult;
	readonly items: readonly PreparedSubagentItem<SubagentItemBase>[];
	readonly workBoundary?: readonly string[];
}

export type TaskLinkResolution =
	| { readonly outcome: "none" }
	| { readonly outcome: "explicit"; readonly task: TaskRecordV1 }
	| { readonly outcome: "auto"; readonly task: TaskRecordV1 }
	| {
			readonly outcome: "invalid";
			readonly reason: string;
			readonly choices: readonly TaskRecordV1[];
	  };

export interface CoordinatorBudget {
	readonly maxWorkers: number;
	readonly maxTurns: number;
	readonly softDeadlineMs: number;
}

export interface CoordinatorAdmission<T> {
	readonly admitted: T[];
	readonly gaps: readonly string[];
}

export function formatCoordinatorGaps(gaps: readonly string[]): string {
	return gaps.length === 0
		? ""
		: `\n\nGaps:\n${gaps.map((gap) => `- ${gap}`).join("\n")}`;
}

export function admitCoordinatorDescendants<T>(
	items: readonly T[],
	maxWorkers: number | undefined,
): CoordinatorAdmission<T> {
	if (maxWorkers === undefined || items.length <= maxWorkers)
		return { admitted: [...items], gaps: [] };
	return {
		admitted: items.slice(0, maxWorkers),
		gaps: [`descendant worker budget exhausted: ${items.length - maxWorkers} worker(s) not admitted`],
	};
}

export function coordinatorBudgetFor(
	request: CoordinatorRequest,
): CoordinatorBudget {
	return {
		maxWorkers: request.maxWorkers ?? DEFAULT_COORDINATOR_MAX_WORKERS,
		maxTurns: request.maxTurns ?? DEFAULT_COORDINATOR_MAX_TURNS,
		softDeadlineMs:
			request.softDeadlineMs ?? DEFAULT_COORDINATOR_SOFT_DEADLINE_MS,
	};
}

export interface PrepareSubagentOptions {
	readonly parentCwd: string;
	readonly parentSessionId?: string;
	readonly isWorkspaceTrusted?: (workspaceRoot: string) => boolean;
	readonly agentScope?: AgentScope;
	readonly maxTaskChoices?: number;
	readonly allowExternalWorkspace?: boolean;
}

export const DEFAULT_MAX_TASK_CHOICES = 8;

const READ_SCHEMA_TOOLS = Type.Array(
	Type.String({ enum: [...READ_TOOL_ALLOWLIST] }),
);

const ItemFields = {
	agent: Type.String({ minLength: 1 }),
	task: Type.String({ minLength: 1 }),
	taskId: Type.Optional(Type.String({ minLength: 1 })),
	cwd: Type.Optional(Type.String({ minLength: 1 })),
	effort: Type.Optional(Type.String({ minLength: 1 })),
	skills: Type.Optional(
		Type.Array(Type.String({ minLength: 1 }), {
			minItems: 1,
			uniqueItems: true,
			description: "Skills to add to this agent for the assigned work.",
		}),
	),
};

const ReadItemSchema = Type.Object(
	{
		...ItemFields,
		workPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	},
	{ additionalProperties: false },
);

const WriteItemSchema = Type.Object(
	{
		...ItemFields,
		workPaths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	},
	{ additionalProperties: false },
);

const CoordinatorItemSchema = Type.Object(
	{ ...ItemFields },
	{ additionalProperties: false },
);

const CommonRequestFields = {
	workspaceRoot: Type.Optional(Type.String({ minLength: 1 })),
	agentScope: Type.Optional(
		Type.String({ enum: ["user", "project", "both"] }),
	),
};

export const SubagentReadSchema = Type.Object(
	{
		items: Type.Array(ReadItemSchema, { minItems: 1 }),
		...CommonRequestFields,
	},
	{ additionalProperties: false },
);

export const SubagentWriteSchema = Type.Object(
	{
		items: Type.Array(WriteItemSchema, { minItems: 1 }),
		...CommonRequestFields,
	},
	{ additionalProperties: false },
);

export const SubagentCoordinateSchema = Type.Object(
	{
		items: Type.Array(CoordinatorItemSchema, { minItems: 1, maxItems: 8 }),
		workBoundary: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
		maxWorkers: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
		maxTurns: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
		softDeadlineMs: Type.Optional(Type.Integer({ minimum: 1 })),
		...CommonRequestFields,
	},
	{ additionalProperties: false },
);

export const READ_AUTHORITY_SCHEMA: TSchema = READ_SCHEMA_TOOLS;

function policyFor(kind: ExecutionKind, agent: AgentConfig): ExecutionPolicy {
	switch (kind) {
		case "read":
			return {
				kind,
				tools: READ_TOOL_ALLOWLIST,
				canMutate: false,
				canDelegate: false,
			};
		case "write":
			return {
				kind,
				tools: [...new Set([...(agent.tools ?? []), "bash"])].filter(
					(tool) => tool !== "subagent" && !tool.startsWith("subagent_"),
				),
				canMutate: true,
				canDelegate: false,
			};
		case "coordinator":
			return {
				kind,
				tools: ["read", "grep", "find", "ls", "subagent_read", "subagent_write"],
				canMutate: false,
				canDelegate: true,
			};
	}
}

function choicesFor(
	workspaceRoot: string,
	parentSessionId: string | undefined,
	maxChoices: number,
): TaskRecordV1[] {
	return listTasks({
		states: ["running"],
		workspace: resolveTaskWorkspace(workspaceRoot),
		sessionId: parentSessionId,
		limit: maxChoices,
	}).filter((task) => !task.deletedAt);
}

export function resolveTaskLink(
	taskId: string | undefined,
	workspaceRoot: string,
	parentSessionId?: string,
	maxChoices = DEFAULT_MAX_TASK_CHOICES,
): TaskLinkResolution {
	const choices = choicesFor(workspaceRoot, parentSessionId, maxChoices);
	if (taskId !== undefined) {
		const task = getTask(taskId);
		if (!task || task.deletedAt)
			return { outcome: "invalid", reason: "task was not found", choices };
		if (task.workspace !== resolveTaskWorkspace(workspaceRoot))
			return { outcome: "invalid", reason: "task belongs to another workspace", choices };
		if (task.sessionId !== undefined && parentSessionId !== undefined && task.sessionId !== parentSessionId)
			return { outcome: "invalid", reason: "task is owned by another root session", choices };
		if (task.state !== "running")
			return { outcome: "invalid", reason: "task is not running", choices };
		return { outcome: "explicit", task };
	}
	if (choices.length === 1) return { outcome: "auto", task: choices[0] as TaskRecordV1 };
	return { outcome: "none" };
}

function assertTaskLink(link: TaskLinkResolution, item: SubagentItemBase): void {
	if (link.outcome === "invalid") {
		const choiceText = link.choices.map((task) => task.id).join(", ") || "none";
		throw new Error(`Invalid taskId for ${item.agent}: ${link.reason}. Current choices: ${choiceText}.`);
	}
}

function itemAgent(item: SubagentItemBase, discovery: AgentDiscoveryResult): AgentConfig {
	const agent = discovery.agents.find((candidate) => candidate.name === item.agent);
	if (!agent)
		throw new Error(`Unknown agent ${item.agent} in the selected workspace agent catalog.`);
	return agent;
}

export function prepareSubagentExecution(
	request: SubagentExecutionRequest,
	options: PrepareSubagentOptions,
): PreparedSubagentExecution {
	const workspace = resolveWorkspaceRoot(options.parentCwd, request.workspaceRoot, {
		allowExternal: options.allowExternalWorkspace ?? true,
	});
	if (workspace.outcome === "deny") throw new Error(workspace.reason);
	const workspaceRoot = workspace.workspaceRoot;
	const projectTrusted = options.isWorkspaceTrusted?.(workspaceRoot) ?? true;
	const agentScope = request.agentScope ?? options.agentScope ?? "user";
	// Project-local agent files are governed by the selected workspace trust
	// decision, not by the caller's prior catalog or requested scope alone.
	const discovery = projectTrusted
		? discoverAgents(workspaceRoot, agentScope)
		: discoverAgents(workspaceRoot, "user");
	const policy = policyFor(request.kind, discovery.agents[0] ?? {
		name: "",
		description: "",
		systemPrompt: "",
		source: "user",
		filePath: "",
	});
	const items = request.items.map((item) => {
		const cwdResult = checkNativePathTool(
			{ workspaceRoot },
			"read",
			{ path: item.cwd ?? "." },
			workspaceRoot,
		);
		if (cwdResult.outcome === "deny") throw new Error(cwdResult.reason);
		const effectiveCwd = cwdResult.targets[0] ?? workspaceRoot;
		const taskLink = resolveTaskLink(
			item.taskId,
			workspaceRoot,
			options.parentSessionId,
			options.maxTaskChoices,
		);
		assertTaskLink(taskLink, item);
		const discoveredAgent = itemAgent(item, discovery);
		const agent = item.skills
			? withDispatchSkills(discoveredAgent, item.skills)
			: discoveredAgent;
		return {
			request: { ...item, cwd: effectiveCwd },
			workspaceRoot,
			taskLink,
			agent,
			projectTrusted,
			discovery,
		};
	});
	return {
		request,
		policy,
		workspaceRoot,
		projectTrusted,
		discovery,
		items,
		...(request.kind === "coordinator" && request.workBoundary
			? { workBoundary: [...request.workBoundary] }
			: {}),
	};
}

export function policyForRequest(
	request: SubagentExecutionRequest,
	agent?: AgentConfig,
): ExecutionPolicy {
	return policyFor(request.kind, agent ?? {
		name: "",
		description: "",
		systemPrompt: "",
		source: "user",
		filePath: "",
	});
}

export function exhaustiveExecutionPolicy(
	request: SubagentExecutionRequest,
	agent?: AgentConfig,
): ExecutionPolicy {
	switch (request.kind) {
		case "read":
		case "write":
		case "coordinator":
			return policyForRequest(request, agent);
	}
}
