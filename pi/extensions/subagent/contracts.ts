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
/** Retained for compatibility; coordinator defaults no longer use a short grace. */
export const DEFAULT_COORDINATOR_HARD_DEADLINE_GRACE_MS =
	DEFAULT_COORDINATOR_SOFT_DEADLINE_MS;

export interface SubagentItemBase {
	readonly agent: string;
	readonly instructions?: string;
	/** Hidden compatibility alias for resumed sessions. */
	readonly task?: string;
	readonly taskId?: string;
	readonly cwd?: string;
	readonly effort?: string;
	readonly skills?: readonly string[];
}

export interface ReadItem extends SubagentItemBase {
	/** Advisory paths supplied to coordinate the work; they do not grant authority. */
	readonly boundaryPaths?: readonly string[];
}

export interface WriteItem extends SubagentItemBase {
	/** Advisory paths supplied to coordinate the work; they do not grant authority. */
	readonly boundaryPaths?: readonly string[];
}

export type CoordinatorItem = SubagentItemBase;

export interface ReadRequest {
	readonly kind: "read";
	readonly items: readonly ReadItem[];
	/** Explicit task A whose settled Luna session may continue task B. Single-item only. */
	readonly affinityTaskId?: string;
	/** The filesystem boundary enforced by governed file tools and recognized recursive-search tools. */
	readonly enforcedBoundary?: string;
	/** Hidden compatibility alias for resumed sessions. */
	readonly workspaceRoot?: string;
	readonly agentScope?: AgentScope;
}

export interface WriteRequest {
	readonly kind: "write";
	readonly items: readonly WriteItem[];
	/** Explicit task A whose settled Luna session may continue task B. Single-item only. */
	readonly affinityTaskId?: string;
	/** The filesystem boundary enforced by governed file tools and recognized recursive-search tools. */
	readonly enforcedBoundary?: string;
	/** Hidden compatibility alias for resumed sessions. */
	readonly workspaceRoot?: string;
	readonly agentScope?: AgentScope;
}

export interface CoordinatorRequest {
	readonly kind: "coordinator";
	readonly items: readonly CoordinatorItem[];
	/** Advisory boundary for Team Lead coordination; it does not grant authority. */
	readonly boundary?: readonly string[];
	/** The filesystem boundary enforced by governed file tools and recognized recursive-search tools. */
	readonly enforcedBoundary?: string;
	/** Hidden compatibility alias for resumed sessions. */
	readonly workspaceRoot?: string;
	/** Hidden compatibility alias for resumed sessions. */
	readonly workBoundary?: readonly string[];
	readonly maxWorkers?: number;
	readonly maxTurns?: number;
	readonly softDeadlineMs?: number;
	/** Optional containment deadline. It must be later than softDeadlineMs. */
	readonly hardDeadlineMs?: number;
	readonly agentScope?: AgentScope;
}

export type SubagentExecutionRequest =
	| ReadRequest
	| WriteRequest
	| CoordinatorRequest;

export type ChildValidation =
	| { readonly status: "passed" }
	| { readonly status: "failed"; readonly reason: string }
	| { readonly status: "not-run"; readonly reason?: string };

export interface ChildContinuationRequest {
	readonly sessionPath: string;
	readonly additionalTimeMs: number;
}

export type ChildCompletion =
	| {
			readonly status: "complete";
			readonly completed: readonly string[];
			readonly remaining: readonly string[];
			readonly validation: Exclude<ChildValidation, { readonly status: "failed" }>;
	  }
	| {
			readonly status: "partial";
			readonly completed: readonly string[];
			readonly remaining: readonly string[];
			readonly validation: ChildValidation;
			readonly continuation?: ChildContinuationRequest;
	  }
	| {
			readonly status: "blocked";
			readonly expectedReading: string;
			readonly materialAlternative: string;
			readonly decision: string;
	  };

export interface SubagentItemResult {
	readonly agent: string;
	readonly taskId?: string;
	readonly status: "completed" | "failed" | "cancelled";
	readonly completion?: ChildCompletion;
	readonly boundaryPaths?: readonly string[];
	readonly boundary?: readonly string[];
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
	readonly boundary?: readonly string[];
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
	readonly hardDeadlineMs: number;
}

export interface CoordinatorAdmission<T> {
	readonly admitted: T[];
	readonly gaps: readonly string[];
}

export function formatCoordinatorTask(
	task: string,
	budget: CoordinatorBudget,
): string {
	return `${task}\n\nTeam Lead completion protocol:\n- Soft deadline: ${budget.softDeadlineMs} ms (advisory; use it to return a cooperative status report, not to stop work).\n- Hard deadline: ${budget.hardDeadlineMs} ms (enforced containment; work will be aborted and settled).\n- Before the hard deadline, return exactly one final JSON object, optionally fenced as \`\`\`json, with status complete, partial, or blocked.\n- Every status requires completed (string array), remaining (string array), and validation ({status: passed, failed, or not-run; include reason when useful}).\n- complete is valid only when validation is not failed and remaining is empty.\n- partial may include requestedAdditionalTimeMs (positive integer) and must not include a sessionPath; runtime supplies the saved sessionPath and bounds the time.\n- blocked should also include expectedReading, materialAlternative, and decision.\n- Ordinary prose is not durable completion proof. Do not claim complete without assigned validation evidence.`;
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
		gaps: [`subagent budget exhausted: ${items.length - maxWorkers} subagent(s) not admitted`],
	};
}

export function coordinatorBudgetFor(
	request: CoordinatorRequest,
): CoordinatorBudget {
	const softDeadlineMs =
		request.softDeadlineMs ?? DEFAULT_COORDINATOR_SOFT_DEADLINE_MS;
	const hardDeadlineMs = request.hardDeadlineMs ?? softDeadlineMs * 2;
	if (hardDeadlineMs <= softDeadlineMs)
		throw new Error("hardDeadlineMs must be greater than softDeadlineMs.");
	return {
		maxWorkers: request.maxWorkers ?? DEFAULT_COORDINATOR_MAX_WORKERS,
		maxTurns: request.maxTurns ?? DEFAULT_COORDINATOR_MAX_TURNS,
		softDeadlineMs,
		hardDeadlineMs,
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
	agent: Type.String({
		minLength: 1,
		description: "Discovered subagent assigned to this item.",
	}),
	instructions: Type.String({
		minLength: 1,
		description: "Required assigned work and its observable completion condition.",
	}),
	taskId: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Optional root-owned task reference for this assignment.",
		}),
	),
	cwd: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Working directory for the assigned subagent.",
		}),
	),
	effort: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Execution effort for the assigned subagent.",
		}),
	),
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
		boundaryPaths: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), {
				description: "Advisory paths for coordination; they do not grant authority.",
			}),
		),
	},
	{ additionalProperties: false },
);

const WriteItemSchema = Type.Object(
	{
		...ItemFields,
		boundaryPaths: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), {
				description: "Advisory paths for coordination; they do not grant authority.",
			}),
		),
	},
	{ additionalProperties: false },
);

const CoordinatorItemSchema = Type.Object(
	{ ...ItemFields },
	{ additionalProperties: false },
);

const CommonRequestFields = {
	affinityTaskId: Type.Optional(
		Type.String({
			minLength: 1,
			description: "Explicit prior task ID for serial Luna session affinity; single-item read/write only.",
		}),
	),
	enforcedBoundary: Type.Optional(
		Type.String({
			minLength: 1,
			description:
				"Enforced only for governed file tools and recognized recursive-search tools; not a general sandbox.",
		}),
	),
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

export const SubagentTeamleadSchema = Type.Object(
	{
		items: Type.Array(CoordinatorItemSchema, { minItems: 1, maxItems: 8 }),
		boundary: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), {
				description: "Advisory Team Lead boundary; it does not grant authority.",
			}),
		),
		maxWorkers: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 8,
				description: "Maximum number of subagents admitted to this Team Lead package.",
			}),
		),
		softDeadlineMs: Type.Optional(
			Type.Integer({
				minimum: 1,
				description: "Advisory elapsed time for this Team Lead package in milliseconds.",
			}),
		),
		hardDeadlineMs: Type.Optional(
			Type.Integer({
				minimum: 1,
				description: "Hard containment deadline in milliseconds; must be greater than softDeadlineMs.",
			}),
		),
		...CommonRequestFields,
	},
	{ additionalProperties: false },
);

/** Hidden compatibility schema retained for resumed subagent_coordinate calls. */
export const SubagentCoordinateSchema = Type.Object(
	{
		items: Type.Array(
			Type.Object(
				{
					agent: ItemFields.agent,
					task: Type.String({ minLength: 1 }),
					taskId: ItemFields.taskId,
					cwd: ItemFields.cwd,
					effort: ItemFields.effort,
					skills: ItemFields.skills,
				},
				{ additionalProperties: false },
			),
			{ minItems: 1, maxItems: 8 },
		),
		workBoundary: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
		workspaceRoot: Type.Optional(Type.String({ minLength: 1 })),
		maxWorkers: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
		maxTurns: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
		softDeadlineMs: Type.Optional(Type.Integer({ minimum: 1 })),
		hardDeadlineMs: Type.Optional(Type.Integer({ minimum: 1 })),
		agentScope: CommonRequestFields.agentScope,
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
		states: ["assigned"],
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
		if (task.state !== "assigned")
			return { outcome: "invalid", reason: "task is not assigned", choices };
		return { outcome: "explicit", task };
	}
	if (choices.length === 1) return { outcome: "auto", task: choices[0] as TaskRecordV1 };
	return { outcome: "none" };
}

/** Resolve the model-facing task reference without deriving identity from runtime context. */
export function resolvePreparedTaskLink(taskId: string | undefined): TaskLinkResolution {
	if (taskId === undefined) return { outcome: "none" };
	const task = getTask(taskId);
	return task && !task.deletedAt
		? { outcome: "explicit", task }
		: { outcome: "invalid", reason: "task was not found", choices: [] };
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
	const legacyRequest = request as SubagentExecutionRequest & {
		readonly workspaceRoot?: string;
		readonly workBoundary?: readonly string[];
	};
	const workspace = resolveWorkspaceRoot(
		options.parentCwd,
		request.enforcedBoundary ?? legacyRequest.workspaceRoot,
		{ allowExternal: options.allowExternalWorkspace ?? true },
	);
	if (workspace.outcome === "deny") throw new Error(workspace.reason);
	const workspaceRoot = workspace.workspaceRoot;
	if (request.kind === "coordinator" && "affinityTaskId" in request)
		throw new Error("affinityTaskId is only valid for a single-item modern read or write request.");
	if (request.kind !== "coordinator" && request.affinityTaskId !== undefined && request.items.length !== 1)
		throw new Error("affinityTaskId is only valid for a single-item modern read or write request.");
	if (request.kind !== "coordinator" && request.affinityTaskId !== undefined && request.items[0]?.taskId === undefined)
		throw new Error("affinityTaskId requires the current taskId for correlation.");
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
		const instructions = item.instructions ?? item.task;
		if (!instructions) throw new Error("Subagent items require instructions.");
		const taskLink = resolvePreparedTaskLink(item.taskId);
		assertTaskLink(taskLink, item);
		const discoveredAgent = itemAgent(item, discovery);
		const agent = item.skills
			? withDispatchSkills(discoveredAgent, item.skills)
			: discoveredAgent;
		return {
			request: { ...item, instructions, cwd: effectiveCwd },
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
		...(request.kind === "coordinator" && (request.boundary ?? legacyRequest.workBoundary)
			? { boundary: [...(request.boundary ?? legacyRequest.workBoundary ?? [])] }
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
