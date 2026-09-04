import type {
	CoordinatorRequest,
	ReadRequest,
	SubagentExecutionRequest,
	WriteRequest,
} from "./contracts.js";
import type { PreparedSubagentExecution } from "./contracts.js";

export type ModernInternalInput = {
	readonly __modernRequest: SubagentExecutionRequest;
	readonly __modernPrepared: PreparedSubagentExecution;
};

type LegacyCompatibleItem = {
	agent: string;
	task: string;
	taskId?: string;
	skills?: string[];
	role?: "coordinator" | "leaf";
	cwd?: string;
	scope?: string[];
	workBoundary?: string[];
	maxWorkers?: number;
	requiredReadPaths?: string[];
};

export type ModernExecutorInput = ModernInternalInput & {
	agent?: string;
	task?: string;
	taskId?: string;
	affinityTaskId?: string;
	role?: "coordinator" | "leaf";
	tasks?: LegacyCompatibleItem[];
	cwd?: string;
	agentScope?: "user" | "project" | "both";
	scope?: string[];
	workBoundary?: string[];
	maxWorkers?: number;
	continuationId?: string;
	readOnlyFanout?: undefined;
	background?: boolean;
	continuable: true;
};

export function modernRequestToExecutorInput(
	request: SubagentExecutionRequest,
	prepared: PreparedSubagentExecution,
): ModernExecutorInput {
	const items = prepared.items.map((preparedItem): LegacyCompatibleItem => {
		const item = preparedItem.request;
		const taskId = preparedItem.taskLink.outcome === "explicit" || preparedItem.taskLink.outcome === "auto"
			? preparedItem.taskLink.task.id
			: item.taskId;
		const instructions = item.instructions ?? item.task;
		if (!instructions) throw new Error("Prepared subagent item has no instructions.");
		const requiredReadPaths = "requiredReadPaths" in item && Array.isArray(item.requiredReadPaths)
			? item.requiredReadPaths.filter((value): value is string => typeof value === "string")
			: undefined;
		return {
			agent: item.agent,
			task: instructions,
			...(taskId ? { taskId } : {}),
			...(item.skills ? { skills: [...item.skills] } : {}),
			role: request.kind === "coordinator" ? "coordinator" : "leaf",
			cwd: item.cwd ?? preparedItem.workspaceRoot,
			...(requiredReadPaths ? { requiredReadPaths } : {}),
		};
	});
	const common = {
		__modernRequest: request,
		__modernPrepared: prepared,
		...(request.kind !== "coordinator" && request.affinityTaskId
			? { affinityTaskId: request.affinityTaskId }
			: {}),
		continuable: true as const,
		...(request.background === undefined ? {} : { background: request.background }),
		...(request.enforcedBoundary ? { workspaceRoot: request.enforcedBoundary } : {}),
	};
	if (request.kind === "coordinator") {
		const coordinator = request as CoordinatorRequest;
		return {
			...common,
			...(items.length === 1 ? items[0] : { tasks: items }),
			maxWorkers: coordinator.maxWorkers,
			...(coordinator.continuationId
				? { continuationId: coordinator.continuationId }
				: {}),
		};
	}
	if (request.kind === "read") {
		const read = request as ReadRequest;
		return {
			...common,
			...(items.length === 1 ? items[0] : { tasks: items }),
			readOnlyFanout: undefined,
			agentScope: read.agentScope,
		};
	}
	const write = request as WriteRequest;
	return {
		...common,
		...(items.length === 1 ? items[0] : { tasks: items }),
		agentScope: write.agentScope,
	};
}
