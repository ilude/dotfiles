import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { truncateTail } from "@earendil-works/pi-coding-agent";
import { recordEvent } from "../../lib/metrics.js";
import { getTasksDir } from "../../lib/operator-state.js";
import {
	buildOrchestrationRunEvent,
	type OrchestrationStatus,
	type OutputMode,
} from "../../lib/orchestration-telemetry.js";
import {
	getTask,
	listTasks,
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	type SubagentTaskExecution,
	safeTransitionTask,
	startTask,
	type TaskRecordV1,
	updateTask,
} from "../../lib/task-registry.js";
import { sanitizeTaskValue } from "../../lib/task-security.js";
import { registerOrchestrationInvocation } from "../../lib/workflow-friction.js";
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
	usage?: NormalizedTaskUsage;
	turns?: number;
	resolvedModel?: string;
	durationMs?: number;
	outputMode?: OutputMode;
	childTextBytes?: number;
	artifactBytes?: number;
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
	settled: boolean;
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
		execution.runId,
	);
	const output = getFinalOutput(result.messages) || result.stderr;
	return {
		output,
		exitCode: result.exitCode,
		usage: normalizeTaskUsage({
			inputTokens: result.usage.input,
			outputTokens: result.usage.output,
			totalTokens:
				result.usage.contextPeakTokens ||
				result.usage.input + result.usage.output,
			cacheCreationInputTokens: result.usage.cacheWrite,
			cacheReadInputTokens: result.usage.cacheRead,
			contextPeakTokens: result.usage.contextPeakTokens,
			turns: result.usage.turns,
			costUsd: result.usage.cost,
		}),
		turns: result.usage.turns,
		resolvedModel: result.model,
		durationMs: result.durationMs,
		outputMode:
			result.outputMode === "file-only"
				? "artifact"
				: result.outputMode === "inline"
					? "inline"
					: "none",
		childTextBytes: Buffer.byteLength(output, "utf-8"),
		...(result.outputReference
			? { artifactBytes: result.outputReference.bytes }
			: {}),
	};
}

export class TaskExecutionCoordinator {
	private readonly active = new Map<string, ActiveExecution>();
	private readonly settledOrchestrationIds = new Set<string>();

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
		const controller = new AbortController();
		const active: ActiveExecution = {
			controller,
			promise: Promise.resolve(),
			liveOutput: "",
			stopRequested: false,
			settled: false,
		};
		const runningExecution: SubagentTaskExecution = {
			...execution,
			status: "running",
			ownerPid: process.pid,
			runId: crypto.randomUUID(),
			orchestrationId: crypto.randomUUID(),
			startedAt: new Date().toISOString(),
		};
		const transition =
			record.state === "running"
				? { outcome: "persisted" as const, record }
				: startTask(taskId);
		if (transition.outcome !== "persisted")
			return {
				outcome: "rejected",
				record: transition.record ?? record,
				error: transition.error ?? "task could not enter running state",
			};
		const interactionId = runningExecution.orchestrationId
			? registerOrchestrationInvocation(runningExecution.orchestrationId)
			: undefined;
		if (interactionId) runningExecution.interactionId = interactionId;
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

	private settleExecution(
		taskId: string,
		execution: SubagentTaskExecution,
		status: Extract<OrchestrationStatus, SubagentTaskExecution["status"]>,
		active?: ActiveExecution,
		result?: TaskExecutionRunResult,
		savedOutput: { outputPath?: string; outputError?: string } = {},
	): void {
		if (
			active?.settled ||
			(execution.orchestrationId &&
				this.settledOrchestrationIds.has(execution.orchestrationId))
		)
			return;
		if (active) active.settled = true;
		if (execution.orchestrationId)
			this.settledOrchestrationIds.add(execution.orchestrationId);
		updateTask(taskId, {
			execution: { ...execution, status, ...savedOutput },
		});
		if (!execution.orchestrationId) return;
		const startedAt = execution.startedAt
			? Date.parse(execution.startedAt)
			: Number.NaN;
		const durationMs =
			result?.durationMs ??
			(Number.isFinite(startedAt)
				? Math.max(0, Date.now() - startedAt)
				: undefined);
		const childTextBytes =
			result?.childTextBytes ??
			(result ? Buffer.byteLength(result.output, "utf-8") : undefined);
		const event = buildOrchestrationRunEvent({
			orchestrationId: execution.orchestrationId,
			...(execution.interactionId
				? { interactionId: execution.interactionId }
				: {}),
			mode: "task-execute",
			fanOut: 1,
			status,
			...(durationMs === undefined
				? {}
				: { durationMs, childWorkMs: durationMs }),
			workers: [
				{
					runId: execution.runId ?? execution.orchestrationId,
					taskId,
					agent: execution.agent,
					...((result?.resolvedModel ?? execution.model)
						? { resolvedModel: result?.resolvedModel ?? execution.model }
						: {}),
					status,
					...(result ? { exitCode: Math.max(0, result.exitCode) } : {}),
					...(durationMs === undefined ? {} : { durationMs }),
					outputMode:
						result?.outputMode ??
						(savedOutput.outputPath ? "artifact" : "none"),
					...(childTextBytes === undefined ? {} : { childTextBytes }),
					parentVisibleBytes: 0,
					...(result?.artifactBytes === undefined
						? savedOutput.outputPath && childTextBytes !== undefined
							? { artifactBytes: childTextBytes }
							: {}
						: { artifactBytes: result.artifactBytes }),
					...(result?.usage ? { usage: result.usage } : {}),
					...(result?.turns === undefined ? {} : { turns: result.turns }),
				},
			],
		});
		if (event) recordEvent(event as Parameters<typeof recordEvent>[0]);
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
			if (active.settled) return;
			const savedOutput = saveOutput(taskId, result.output);
			if (active.stopRequested) {
				this.settleExecution(
					taskId,
					execution,
					"stopped",
					active,
					result,
					savedOutput,
				);
				safeTransitionTask(taskId, "cancelled");
				return;
			}
			const status = result.exitCode === 0 ? "completed" : "failed";
			this.settleExecution(
				taskId,
				execution,
				status,
				active,
				result,
				savedOutput,
			);
			safeTransitionTask(
				taskId,
				status,
				status === "completed"
					? {}
					: { errorReason: `subagent exited with code ${result.exitCode}` },
			);
		} catch (error) {
			if (active.settled) return;
			if (active.stopRequested) {
				this.settleExecution(taskId, execution, "stopped", active);
				safeTransitionTask(taskId, "cancelled");
				return;
			}
			this.settleExecution(taskId, execution, "failed", active);
			safeTransitionTask(taskId, "failed", {
				errorReason: error instanceof Error ? error.message : String(error),
			});
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
			if (status === "orphaned") {
				safeTransitionTask(taskId, "blocked", {
					blockReason: "orphaned execution",
				});
				this.settleExecution(taskId, execution, "orphaned");
			} else updateTask(taskId, { execution: { ...execution, status } });
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
				this.settleExecution(
					taskId,
					currentExecution,
					"failed_to_stop",
					active,
				);
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
			safeTransitionTask(record.id, "blocked", {
				blockReason: "orphaned execution",
			});
			this.settleExecution(record.id, execution, "orphaned");
		}
	}

	async shutdown(): Promise<void> {
		await Promise.all(
			[...this.active.keys()].map((taskId) => this.stop(taskId)),
		);
	}
}
