import type {
	CoordinatorItem,
	CoordinatorRequest,
	ReadItem,
	ReadRequest,
	SubagentExecutionRequest,
	WriteItem,
	WriteRequest,
} from "./contracts.js";

export const HISTORICAL_SUBAGENT_TOOL_NAMES = [
	"subagent",
	"subagent_chain",
	"subagent_continue",
	"subagent_fanout",
	"subagent_workflow",
] as const;

export type HistoricalSubagentToolName =
	(typeof HISTORICAL_SUBAGENT_TOOL_NAMES)[number];

type LegacyItem = {
	agent?: unknown;
	instructions?: unknown;
	task?: unknown;
	prompt?: unknown;
	session?: unknown;
	taskId?: unknown;
	role?: unknown;
	scope?: unknown;
	workPaths?: unknown;
	boundaryPaths?: unknown;
	cwd?: unknown;
	effort?: unknown;
	output?: unknown;
	outputMode?: unknown;
};

type LegacyInput = LegacyItem & {
	tasks?: unknown;
	steps?: unknown;
	chain?: unknown;
	continue?: unknown;
	readOnlyFanout?: unknown;
	agentScope?: unknown;
	workspaceRoot?: unknown;
	enforcedBoundary?: unknown;
	cwd?: unknown;
	workBoundary?: unknown;
	boundary?: unknown;
	outputSchema?: unknown;
	background?: unknown;
	model?: unknown;
	modelSize?: unknown;
	modelPolicy?: unknown;
	confirmProjectAgents?: unknown;
};

export type LegacyBranch =
	| "single"
	| "parallel"
	| "chain"
	| "continue"
	| "fanout"
	| "workflow";

export interface LegacyAdapterResult {
	readonly toolName: HistoricalSubagentToolName;
	readonly branch: LegacyBranch;
	readonly request?: SubagentExecutionRequest;
	readonly sessionPath?: string;
	readonly outputMode?: "inline" | "file-only";
	readonly legacyWorkflow?: Readonly<Record<string, unknown>>;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result = value.filter(
		(item): item is string => typeof item === "string" && item.trim().length > 0,
	);
	return result.length > 0 ? result : undefined;
}

function itemFromLegacy(item: LegacyItem): ReadItem | WriteItem | CoordinatorItem {
	const agent = stringValue(item.agent);
	const instructions = stringValue(item.instructions ?? item.task ?? item.prompt);
	if (!agent || !instructions) throw new Error("Subagent items require an agent and instructions.");
	const common = {
		agent,
		instructions,
		...(stringValue(item.taskId) ? { taskId: stringValue(item.taskId) } : {}),
		...(stringValue(item.cwd) ? { cwd: stringValue(item.cwd) } : {}),
		...(stringValue(item.effort) ? { effort: stringValue(item.effort) } : {}),
	};
	const boundaryPaths = stringArray(item.boundaryPaths ?? item.workPaths ?? item.scope);
	return boundaryPaths ? { ...common, boundaryPaths } : common;
}

function kindForItems(items: readonly LegacyItem[], topLevelRole: unknown): "read" | "write" | "coordinator" {
	if (topLevelRole === "coordinator") return "coordinator";
	if (items.some((item) => item.role === "coordinator" || item.agent === "teamlead" || item.agent === "orchestrator"))
		return "coordinator";
	return "write";
}

function requestFromItems(
	items: readonly LegacyItem[],
	input: LegacyInput,
	role: unknown,
): SubagentExecutionRequest {
	const kind = kindForItems(items, role);
	const workspaceRoot = stringValue(input.enforcedBoundary ?? input.workspaceRoot ?? input.cwd);
	const agentScope = input.agentScope === "project" || input.agentScope === "both" || input.agentScope === "user"
		? input.agentScope
		: undefined;
	if (kind === "coordinator") {
		const coordinatorItems: CoordinatorItem[] = items.map((item) => {
			const base = itemFromLegacy(item);
			return {
				agent: base.agent,
				instructions: base.instructions,
				...(base.taskId ? { taskId: base.taskId } : {}),
				...(base.cwd ? { cwd: base.cwd } : {}),
				...(base.effort ? { effort: base.effort } : {}),
			};
		});
		return {
			kind,
			items: coordinatorItems,
			...(workspaceRoot ? { enforcedBoundary: workspaceRoot } : {}),
			...(agentScope ? { agentScope } : {}),
			...(stringArray(input.boundary ?? input.workBoundary ?? input.scope)
				? { boundary: stringArray(input.boundary ?? input.workBoundary ?? input.scope) }
				: {}),
		};
	}
	const mapped = items.map((item) => itemFromLegacy(item));
	return {
		kind,
		items: mapped as ReadItem[] & WriteItem[],
		...(workspaceRoot ? { enforcedBoundary: workspaceRoot } : {}),
		...(agentScope ? { agentScope } : {}),
	};
}

function legacyItems(input: LegacyInput, branch: LegacyBranch): LegacyItem[] {
	if (branch === "parallel") {
		if (!Array.isArray(input.tasks)) throw new Error("Legacy parallel mode requires tasks.");
		return input.tasks.map((item) => record(item) as LegacyItem);
	}
	if (branch === "chain") {
		if (!Array.isArray(input.chain ?? input.steps)) throw new Error("Legacy chain mode requires steps.");
		return (input.chain ?? input.steps) as LegacyItem[];
	}
	if (branch === "fanout") {
		const plan =
			input.readOnlyFanout === undefined
				? record(input)
				: record(input.readOnlyFanout);
		const single = record(plan.single);
		const parallel = Array.isArray(plan.parallel) ? plan.parallel : [];
		return [
			...(Object.keys(single).length > 0 ? [single as LegacyItem] : []),
			...parallel.map((item) => record(item) as LegacyItem),
		];
	}
	if (branch === "continue") {
		const continuation =
			input.continue === undefined ? input : record(input.continue);
		return [continuation as LegacyItem];
	}
	return [input];
}

function outputMode(input: LegacyItem): "inline" | "file-only" | undefined {
	if (input.outputMode === "inline" || input.outputMode === "file-only") return input.outputMode;
	if (typeof input.output === "boolean") return input.output ? "file-only" : undefined;
	if (typeof input.output === "string") return "file-only";
	return undefined;
}

export function adaptLegacySubagentInvocation(
	toolName: string,
	rawInput: unknown,
): LegacyAdapterResult {
	if (!HISTORICAL_SUBAGENT_TOOL_NAMES.includes(toolName as HistoricalSubagentToolName))
		throw new Error(`Unknown historical subagent tool: ${toolName}`);
	const name = toolName as HistoricalSubagentToolName;
	const input = record(rawInput) as LegacyInput;
	const branch: LegacyBranch =
		name === "subagent_chain"
			? "chain"
			: name === "subagent_continue"
				? "continue"
				: name === "subagent_fanout"
					? "fanout"
					: name === "subagent_workflow"
						? "workflow"
						: input.readOnlyFanout !== undefined
							? "fanout"
							: Array.isArray(input.tasks)
								? "parallel"
								: "single";
	if (branch === "workflow") {
		return {
			toolName: name,
			branch,
			legacyWorkflow: { ...input },
		};
	}
	const items = legacyItems(input, branch);
	const first = items[0];
	const role = input.role ?? first?.role;
	const continuation = branch === "continue" ? record(input.continue) : {};
	const sessionPath = stringValue(first?.session ?? continuation.session);
	return {
		toolName: name,
		branch,
		request: requestFromItems(items, input, role),
		...(first && outputMode(first) ? { outputMode: outputMode(first) } : {}),
		...(branch === "continue" && sessionPath ? { sessionPath } : {}),
	};
}
