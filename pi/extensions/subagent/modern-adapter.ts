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
	role?: "coordinator" | "leaf";
	cwd?: string;
	scope?: string[];
	workBoundary?: string[];
};

export type ModernExecutorInput = ModernInternalInput & {
	agent?: string;
	task?: string;
	taskId?: string;
	role?: "coordinator" | "leaf";
	tasks?: LegacyCompatibleItem[];
	cwd?: string;
	agentScope?: "user" | "project" | "both";
	scope?: string[];
	workBoundary?: string[];
	readOnlyFanout?: undefined;
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
		const workPaths =
			"workPaths" in item && Array.isArray(item.workPaths)
				? item.workPaths.filter((value): value is string => typeof value === "string")
				: undefined;
		return {
			agent: item.agent,
			task: item.task,
			...(taskId ? { taskId } : {}),
			role: request.kind === "coordinator" ? "coordinator" : "leaf",
			cwd: preparedItem.workspaceRoot,
			...(workPaths ? { scope: workPaths } : {}),
		};
	});
	const common = {
		__modernRequest: request,
		__modernPrepared: prepared,
		continuable: true as const,
	};
	if (request.kind === "coordinator") {
		const coordinator = request as CoordinatorRequest;
		return {
			...common,
			...(items.length === 1 ? items[0] : { tasks: items }),
			...(coordinator.workBoundary
				? { workBoundary: [...coordinator.workBoundary] }
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
