import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { truncateTail } from "@earendil-works/pi-coding-agent";
import { getTasksDir } from "../../lib/operator-state.js";
import {
	getTask,
	getUnmetBlockers,
	listTasks,
	type SubagentTaskExecution,
	safeTransitionTask,
	type TaskRecordV1,
	tasksByIdSnapshot,
	updateTask,
} from "../../lib/task-registry.js";
import { sanitizeTaskValue } from "../../lib/task-security.js";
import { subagentModelFor } from "../fable.js";
import { type AgentScope, discoverAgents } from "../subagent/agents.js";
import {
	getFinalOutput,
	runSingleAgent,
	type SingleResult,
	type SubagentDetails,
} from "../subagent/index.js";

const OUTPUT_MAX_BYTES = 12_000;
const OUTPUT_MAX_LINES = 200;
const STOP_TIMEOUT_MS = 7_000;

export interface TaskExecutionRunResult {
	output: string;
	exitCode: number;
}

export type TaskExecutionRunner = (
	execution: SubagentTaskExecution,
	fallbackCwd: string,
	signal: AbortSignal,
	onUpdate: (output: string) => void,
	taskId: string,
) => Promise<TaskExecutionRunResult>;

interface ActiveExecution {
	controller: AbortController;
	promise: Promise<void>;
	liveOutput: string;
	stopRequested: boolean;
}

export interface TaskExecutionResult {
	outcome:
		| "accepted"
		| "persisted"
		| "not_found"
		| "rejected"
		| "not_running"
		| "failed_to_stop";
	record?: TaskRecordV1;
	output?: string;
	truncated?: boolean;
	error?: string;
}

function outputPathFor(taskId: string): string {
	return path.join(getTasksDir(), "output", `${taskId}.md`);
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function executionFor(record: TaskRecordV1): SubagentTaskExecution | null {
	const execution = record.execution;
	if (execution?.kind !== "subagent") return null;
	if (
		typeof execution.agent !== "string" ||
		!execution.agent.trim() ||
		typeof execution.task !== "string" ||
		!execution.task.trim()
	)
		return null;
	return execution;
}

function saveOutput(
	taskId: string,
	output: string,
): { outputPath?: string; outputError?: string } {
	if (!output) return {};
	const outputPath = outputPathFor(taskId);
	try {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, sanitizeTaskValue(output), {
			encoding: "utf-8",
			mode: 0o600,
		});
		return { outputPath };
	} catch (error) {
		return {
			outputError: error instanceof Error ? error.message : String(error),
		};
	}
}

function boundedOutput(output: string): {
	content: string;
	truncated: boolean;
} {
	const sanitized = sanitizeTaskValue(output);
	const result = truncateTail(sanitized, {
		maxBytes: OUTPUT_MAX_BYTES,
		maxLines: OUTPUT_MAX_LINES,
	});
	return { content: result.content, truncated: result.truncated };
}

export async function runTaskSubagent(
	execution: SubagentTaskExecution,
	fallbackCwd: string,
	signal: AbortSignal,
	onUpdate: (output: string) => void,
	taskId: string,
): Promise<TaskExecutionRunResult> {
	const cwd = execution.cwd ?? fallbackCwd;
	const scope: AgentScope = execution.agentScope ?? "user";
	const discovery = discoverAgents(cwd, scope);
	const agent = discovery.agents.find(
		(candidate) => candidate.name === execution.agent,
	);
	const model = subagentModelFor({
		model:
			execution.model ??
			(execution.modelSize === undefined ? agent?.model : undefined),
		modelSize: execution.modelSize,
	});
	const makeDetails = (results: SingleResult[]): SubagentDetails => ({
		mode: "single",
		agentScope: scope,
		projectAgentsDir: discovery.projectAgentsDir,
		results,
	});
	const result = await runSingleAgent(
		fallbackCwd,
		discovery.agents,
		execution.agent,
		execution.task,
		execution.cwd,
		undefined,
		signal,
		(partial) => {
			const text = partial.content.find((item) => item.type === "text")?.text;
			if (text) onUpdate(text);
		},
		makeDetails,
		model,
		execution.modelSize,
		undefined,
		taskId,
	);
	return {
		output: getFinalOutput(result.messages) || result.stderr,
		exitCode: result.exitCode,
	};
}

export class TaskExecutionCoordinator {
	private readonly active = new Map<string, ActiveExecution>();

	constructor(private readonly runner: TaskExecutionRunner = runTaskSubagent) {}

	start(taskId: string, fallbackCwd: string): TaskExecutionResult {
		const record = getTask(taskId);
		if (!record) return { outcome: "not_found" };
		if (this.active.has(taskId))
			return { outcome: "rejected", record, error: "task is already running" };
		const execution = executionFor(record);
		if (!execution)
			return {
				outcome: "rejected",
				record,
				error: "task has no executable subagent specification",
			};
		const reopenedForExecution =
			record.state === "running" &&
			execution.status !== "running" &&
			execution.status !== "stop_requested";
		if (
			!new Set(["pending", "blocked", "failed"]).has(record.state) &&
			!reopenedForExecution
		)
			return {
				outcome: "rejected",
				record,
				error: `task state ${record.state} cannot be executed`,
			};
		const blockers = getUnmetBlockers(
			record,
			tasksByIdSnapshot(listTasks({ includeTombstones: true })),
		);
		if (blockers.length > 0)
			return {
				outcome: "rejected",
				record,
				error: `task is waiting on ${blockers.map((item) => item.id).join(", ")}`,
			};

		const controller = new AbortController();
		const active: ActiveExecution = {
			controller,
			promise: Promise.resolve(),
			liveOutput: "",
			stopRequested: false,
		};
		const runningExecution: SubagentTaskExecution = {
			...execution,
			status: "running",
			ownerPid: process.pid,
			runId: crypto.randomUUID(),
		};
		const transition =
			record.state === "running"
				? { outcome: "persisted" as const, record }
				: safeTransitionTask(taskId, "running");
		if (transition.outcome !== "persisted")
			return {
				outcome: "rejected",
				record: transition.record ?? record,
				error: transition.error ?? "task could not enter running state",
			};
		updateTask(taskId, { execution: runningExecution });
		this.active.set(taskId, active);
		active.promise = this.finishExecution(
			taskId,
			runningExecution,
			fallbackCwd,
			active,
		).finally(() => this.active.delete(taskId));
		return { outcome: "accepted", record: getTask(taskId) ?? record };
	}

	private async finishExecution(
		taskId: string,
		execution: SubagentTaskExecution,
		fallbackCwd: string,
		active: ActiveExecution,
	): Promise<void> {
		try {
			const result = await this.runner(
				execution,
				fallbackCwd,
				active.controller.signal,
				(output) => {
					active.liveOutput = output;
				},
				taskId,
			);
			const savedOutput = saveOutput(taskId, result.output);
			let record = getTask(taskId);
			if (record?.state === "pending" || record?.state === "running") {
				safeTransitionTask(
					taskId,
					result.exitCode === 0 ? "completed" : "failed",
					result.exitCode === 0
						? {}
						: { errorReason: `subagent exited with code ${result.exitCode}` },
				);
				record = getTask(taskId);
			}
			if (!record) return;
			const status = active.stopRequested
				? "stopped"
				: record.state === "completed"
					? "completed"
					: "failed";
			updateTask(taskId, {
				execution: { ...execution, status, ...savedOutput },
			});
		} catch (error) {
			const record = getTask(taskId);
			if (!record) return;
			const status = active.stopRequested ? "stopped" : "failed";
			if (active.stopRequested && record.state !== "cancelled")
				safeTransitionTask(taskId, "cancelled");
			else if (!active.stopRequested && record.state === "running")
				safeTransitionTask(taskId, "failed", {
					errorReason: error instanceof Error ? error.message : String(error),
				});
			updateTask(taskId, { execution: { ...execution, status } });
		}
	}

	async stop(taskId: string): Promise<TaskExecutionResult> {
		const record = getTask(taskId);
		if (!record) return { outcome: "not_found" };
		const active = this.active.get(taskId);
		if (!active) {
			if (record.state !== "running") return { outcome: "not_running", record };
			const execution = executionFor(record);
			if (!execution) return { outcome: "not_running", record };
			const ownerPid = execution.ownerPid;
			const status =
				ownerPid && processExists(ownerPid) ? "failed_to_stop" : "orphaned";
			updateTask(taskId, { execution: { ...execution, status } });
			if (status === "orphaned")
				safeTransitionTask(taskId, "blocked", {
					blockReason: "orphaned execution",
				});
			return {
				outcome: status === "orphaned" ? "persisted" : "failed_to_stop",
				record: getTask(taskId) ?? record,
			};
		}

		active.stopRequested = true;
		const execution = executionFor(record);
		if (execution)
			updateTask(taskId, {
				execution: { ...execution, status: "stop_requested" },
			});
		active.controller.abort();
		const completed = await Promise.race([
			active.promise.then(() => true),
			new Promise<false>((resolve) =>
				setTimeout(() => resolve(false), STOP_TIMEOUT_MS),
			),
		]);
		if (!completed) {
			const current = getTask(taskId);
			const currentExecution = current && executionFor(current);
			if (currentExecution)
				updateTask(taskId, {
					execution: { ...currentExecution, status: "failed_to_stop" },
				});
			return {
				outcome: "failed_to_stop",
				record: getTask(taskId) ?? record,
			};
		}
		return { outcome: "persisted", record: getTask(taskId) ?? record };
	}

	output(taskId: string): TaskExecutionResult {
		const record = getTask(taskId);
		if (!record) return { outcome: "not_found" };
		const active = this.active.get(taskId);
		const execution = executionFor(record);
		let output = active?.liveOutput ?? "";
		if (!output && execution?.outputPath && fs.existsSync(execution.outputPath))
			output = fs.readFileSync(execution.outputPath, "utf-8");
		if (!output) output = record.preview ?? "";
		const bounded = boundedOutput(output || "(no output available)");
		return {
			outcome: "persisted",
			record,
			output: bounded.content,
			truncated: bounded.truncated,
		};
	}

	reconcileOrphans(): void {
		for (const record of listTasks({ states: ["running"] })) {
			const execution = executionFor(record);
			if (execution?.status !== "running") continue;
			const ownerPid = execution.ownerPid;
			if (ownerPid && processExists(ownerPid)) continue;
			updateTask(record.id, {
				execution: { ...execution, status: "orphaned" },
			});
			safeTransitionTask(record.id, "blocked", {
				blockReason: "orphaned execution",
			});
		}
	}

	async shutdown(): Promise<void> {
		await Promise.all(
			[...this.active.keys()].map((taskId) => this.stop(taskId)),
		);
	}
}
