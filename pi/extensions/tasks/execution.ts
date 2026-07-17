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
	getUnmetBlockers,
	listTasks,
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	type SubagentTaskExecution,
	safeTransitionTask,
	startTask,
	type TaskRecordV1,
	tasksByIdSnapshot,
	updateTask,
} from "../../lib/task-registry.js";
import {
	executionIsReadOnly,
	scheduledTasksConflict,
	sortCriticalPathFirst,
	type ScheduledTask,
} from "../../lib/task-scheduler.js";
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
export const TASK_NOTIFICATION_MAX_BYTES = 500;

export interface TaskCompletionNotification {
	taskId: string;
	agent: string;
	status: "completed" | "failed" | "stopped";
	durationMs?: number;
	output?: string;
	outputPath?: string;
	error?: string;
}

export type TaskCompletionNotifier = (
	notification: TaskCompletionNotification,
) => void;

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
		| "failed_to_stop"
		| "start_failed";
	record?: TaskRecordV1;
	output?: string;
	truncated?: boolean;
	error?: string;
}

export type TaskMultiClassification =
	| "started"
	| "manual_ready"
	| "manual_running"
	| "pending"
	| "blocked"
	| "active"
	| "terminal"
	| "external_running"
	| "failed_to_stop"
	| "start_failed"
	| "orphaned"
	| "ownership_unknown"
	| "missing"
	| "foreign_workspace"
	| "aborted";

export interface TaskMultiResult {
	id: string;
	classification: TaskMultiClassification;
	state?: TaskRecordV1["state"];
	error?: string;
	record?: TaskRecordV1;
}

export interface TaskStartManyResult {
	outcome: "accepted" | "partial" | "rejected";
	results: TaskMultiResult[];
}

export interface TaskWaitResult {
	outcome: "persisted" | "aborted";
	results: TaskMultiResult[];
}

export interface TaskDrainBlocker {
	taskId: string;
	blockers: Array<{ id: string; status: string }>;
}

export interface TaskDrainResult {
	outcome: "quiescent" | "starved" | "aborted";
	started: string[];
	completed: string[];
	failed: string[];
	waiting: string[];
	starvation: TaskDrainBlocker[];
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

function boundedUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	const suffix = "...";
	let result = "";
	let bytes = Buffer.byteLength(suffix, "utf8");
	for (const character of value) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes) break;
		result += character;
		bytes += characterBytes;
	}
	return result + suffix;
}

function executionDurationMs(
	execution: SubagentTaskExecution,
	reportedDurationMs?: number,
): number {
	if (reportedDurationMs !== undefined) return Math.max(0, reportedDurationMs);
	const startedAt = execution.startedAt
		? Date.parse(execution.startedAt)
		: Number.NaN;
	return Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
}

export function formatTaskCompletionNotification(
	notification: TaskCompletionNotification,
): string {
	const duration =
		notification.durationMs === undefined
			? ""
			: ` durationMs=${Math.max(0, Math.round(notification.durationMs))}`;
	const firstLine = sanitizeTaskValue(
		notification.outputPath ??
			notification.output?.split(/\r?\n/, 1)[0] ??
			notification.error ??
			"",
	).trim();
	const evidence = firstLine
		? ` ${notification.outputPath ? "artifact" : "output"}=${firstLine}`
		: "";
	return boundedUtf8(
		`task=${notification.taskId} agent=${notification.agent} status=${notification.status}${duration}${evidence}`,
		TASK_NOTIFICATION_MAX_BYTES,
	);
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

	constructor(
		private readonly runner: TaskExecutionRunner = runTaskSubagent,
		private readonly ownershipWriter: typeof updateTask = updateTask,
		private readonly compensateStart: typeof safeTransitionTask = safeTransitionTask,
		private readonly completionNotifier?: TaskCompletionNotifier,
	) {}

	private notifyCompletion(notification: TaskCompletionNotification): void {
		try {
			this.completionNotifier?.(notification);
		} catch {
			// Notification delivery is fail-open; task state and output are authoritative.
		}
	}

	start(taskId: string, fallbackCwd: string): TaskExecutionResult {
		const record = getTask(taskId);
		if (!record) return { outcome: "not_found" };
		if (record.execution?.status === "failed_to_stop")
			return {
				outcome: "failed_to_stop",
				record,
				error: "task execution ownership must be reconciled with stop",
			};
		if (this.active.has(taskId))
			return { outcome: "rejected", record, error: "task is already running" };
		const execution = executionFor(record);
		if (!execution)
			return {
				outcome: "rejected",
				record,
				error: "task has no executable subagent specification",
			};
		if (!new Set(["pending", "blocked", "failed"]).has(record.state))
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
		const transition = startTask(taskId);
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
		try {
			this.ownershipWriter(taskId, { execution: runningExecution });
		} catch (error) {
			const persistenceError =
				error instanceof Error ? error.message : String(error);
			const compensation = this.compensateStart(taskId, "blocked", {
				blockReason: "execution metadata persistence failed",
			});
			const recoveryError =
				compensation.outcome === "persisted"
					? undefined
					: (compensation.error ?? compensation.outcome);
			return {
				outcome: "start_failed",
				record: getTask(taskId) ?? transition.record ?? record,
				error: recoveryError
					? `${persistenceError}; compensation failed: ${recoveryError}`
					: persistenceError,
			};
		}
		this.active.set(taskId, active);
		active.promise = this.finishExecution(
			taskId,
			runningExecution,
			fallbackCwd,
			active,
		).finally(() => {
			if (this.active.get(taskId) === active) this.active.delete(taskId);
		});
		return { outcome: "accepted", record: getTask(taskId) ?? record };
	}

	private classify(
		record: TaskRecordV1 | null,
		forExecute: boolean,
	): TaskMultiResult {
		if (!record) return { id: "", classification: "missing" };
		const base = { id: record.id, state: record.state, record };
		const blockers = getUnmetBlockers(
			record,
			tasksByIdSnapshot(listTasks({ includeTombstones: true })),
		);
		if (record.state !== "running") {
			if (forExecute && blockers.length > 0)
				return { ...base, classification: "blocked" };
			if (record.state === "pending")
				return {
					...base,
					classification:
						blockers.length > 0
							? "blocked"
							: record.execution === undefined
								? "manual_ready"
								: "pending",
				};
			if (record.state === "blocked")
				return { ...base, classification: "blocked" };
			return { ...base, classification: "terminal" };
		}
		if (record.execution?.status === "failed_to_stop")
			return { ...base, classification: "failed_to_stop" };
		if (this.active.has(record.id))
			return { ...base, classification: "active" };
		if (record.execution === undefined)
			return { ...base, classification: "manual_running" };
		const execution = executionFor(record);
		if (!execution) return { ...base, classification: "ownership_unknown" };
		if (execution.status === "running" || execution.status === "stop_requested")
			return {
				...base,
				classification:
					execution.ownerPid && processExists(execution.ownerPid)
						? "external_running"
						: "orphaned",
			};
		return { ...base, classification: "ownership_unknown" };
	}

	startMany(
		taskIds: readonly string[],
		fallbackCwd: string,
	): TaskStartManyResult {
		const candidates = taskIds.map((taskId) => {
			const record = getTask(taskId);
			return { taskId, record, classified: this.classify(record, true) };
		});
		const results = candidates.map(
			({ taskId, record, classified }): TaskMultiResult => {
				if (!record) return { ...classified, id: taskId };
				if (
					!executionFor(record) ||
					!(
						classified.classification === "pending" ||
						record.state === "blocked" ||
						record.state === "failed"
					)
				)
					return { ...classified, id: taskId };
				const started = this.start(taskId, fallbackCwd);
				if (started.outcome === "accepted")
					return {
						id: taskId,
						classification: "started",
						state: started.record?.state,
						record: started.record,
					};
				if (started.outcome === "start_failed")
					return {
						id: taskId,
						classification: "start_failed",
						state: started.record?.state,
						record: started.record,
						error: started.error,
					};
				return {
					id: taskId,
					classification:
						started.outcome === "failed_to_stop" ? "failed_to_stop" : "blocked",
					state: started.record?.state,
					record: started.record,
					error: started.error,
				};
			},
		);
		const started = results.filter(
			(result) => result.classification === "started",
		).length;
		return {
			outcome:
				started === results.length
					? "accepted"
					: started > 0
						? "partial"
						: "rejected",
			results,
		};
	}

	private scheduledTask(
		record: TaskRecordV1,
		fallbackCwd: string,
	): ScheduledTask {
		const execution = executionFor(record);
		const readOnly = executionIsReadOnly(record, (agentName) => {
			if (!execution) return undefined;
			const cwd = execution.cwd ?? fallbackCwd;
			const scope: AgentScope = execution.agentScope ?? "user";
			return discoverAgents(cwd, scope).agents.find(
				(agent) => agent.name === agentName,
			)?.tools;
		});
		return { record, readOnly };
	}

	private async waitForAnyActive(
		taskIds: readonly string[],
		signal?: AbortSignal,
	): Promise<"settled" | "aborted"> {
		const promises = taskIds.flatMap((id) => {
			const active = this.active.get(id);
			return active ? [active.promise] : [];
		});
		if (promises.length === 0) return "settled";
		if (signal?.aborted) return "aborted";
		let onAbort: (() => void) | undefined;
		const abortPromise = signal
			? new Promise<"aborted">((resolve) => {
					onAbort = () => resolve("aborted");
					signal.addEventListener("abort", onAbort, { once: true });
				})
			: undefined;
		const settled = Promise.race(promises).then(() => "settled" as const);
		const outcome = abortPromise
			? await Promise.race([settled, abortPromise])
			: await settled;
		if (signal && onAbort) signal.removeEventListener("abort", onAbort);
		return outcome;
	}

	async drain(options: {
		workspace: string;
		fallbackCwd: string;
		maxConcurrent?: number;
		signal?: AbortSignal;
	}): Promise<TaskDrainResult> {
		const maxConcurrent = options.maxConcurrent ?? 4;
		if (
			!Number.isInteger(maxConcurrent) ||
			maxConcurrent < 1 ||
			maxConcurrent > 8
		)
			throw new Error("maxConcurrent must be an integer between 1 and 8");
		const started = new Set<string>();
		const finish = (outcome: TaskDrainResult["outcome"]): TaskDrainResult => {
			const records = listTasks({
				includeTombstones: false,
				workspace: options.workspace,
			});
			const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
			const waitingRecords = records.filter(
				(record) =>
					record.state === "pending" &&
					executionFor(record) !== null &&
					getUnmetBlockers(record, byId).length > 0,
			);
			const starvation = waitingRecords.flatMap((record) => {
				const blockers = getUnmetBlockers(record, byId).filter((blocker) =>
					["failed", "cancelled", "missing", "tombstoned"].includes(
						blocker.status,
					),
				);
				return blockers.length > 0
					? [
							{
								taskId: record.id,
								blockers: blockers.map((blocker) => ({
									id: blocker.id,
									status: blocker.status,
								})),
							},
						]
					: [];
			});
			return {
				outcome:
					outcome === "quiescent" && starvation.length > 0
						? "starved"
						: outcome,
				started: [...started],
				completed: records
					.filter(
						(record) => started.has(record.id) && record.state === "completed",
					)
					.map((record) => record.id),
				failed: records
					.filter(
						(record) => started.has(record.id) && record.state === "failed",
					)
					.map((record) => record.id),
				waiting: waitingRecords.map((record) => record.id),
				starvation,
			};
		};

		while (true) {
			if (options.signal?.aborted) return finish("aborted");
			const records = listTasks({
				includeTombstones: false,
				workspace: options.workspace,
			});
			const byId = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
			const running = records.filter((record) => record.state === "running");
			const localActiveIds = running
				.filter((record) => this.active.has(record.id))
				.map((record) => record.id);
			const scheduled = running.map((record) =>
				this.scheduledTask(record, options.fallbackCwd),
			);
			const ready = sortCriticalPathFirst(
				records.filter(
					(record) =>
						record.state === "pending" &&
						executionFor(record) !== null &&
						getUnmetBlockers(record, byId).length === 0,
				),
				records,
			);
			let slots = Math.max(0, maxConcurrent - running.length);
			for (const record of ready) {
				if (slots === 0) break;
				const candidate = this.scheduledTask(record, options.fallbackCwd);
				if (
					scheduled.some((active) => scheduledTasksConflict(active, candidate))
				)
					continue;
				const result = this.start(record.id, options.fallbackCwd);
				if (result.outcome !== "accepted") continue;
				started.add(record.id);
				scheduled.push(candidate);
				localActiveIds.push(record.id);
				slots--;
			}
			if (localActiveIds.length > 0) {
				const waitOutcome = await this.waitForAnyActive(
					localActiveIds,
					options.signal,
				);
				if (waitOutcome === "aborted") return finish("aborted");
				continue;
			}
			return finish("quiescent");
		}
	}

	async wait(
		taskIds: readonly string[],
		signal?: AbortSignal,
	): Promise<TaskWaitResult> {
		const immediate = taskIds.map((taskId) => ({
			taskId,
			result: this.classify(getTask(taskId), false),
		}));
		const captured = immediate.flatMap(({ taskId, result }) => {
			if (result.classification !== "active") return [];
			const active = this.active.get(taskId);
			if (!active) return [];
			const capture = { taskId, settled: false, promise: Promise.resolve() };
			capture.promise = active.promise.then(
				() => {
					capture.settled = true;
				},
				() => {
					capture.settled = true;
				},
			);
			return [capture];
		});
		if (captured.length === 0)
			return {
				outcome: "persisted",
				results: immediate.map(({ taskId, result }) => ({
					...result,
					id: taskId,
				})),
			};
		if (signal?.aborted)
			return {
				outcome: "aborted",
				results: immediate.map(({ taskId, result }) =>
					result.classification === "active"
						? {
								id: taskId,
								classification: "aborted" as const,
								state: result.state,
								record: result.record,
							}
						: { ...result, id: taskId },
				),
			};
		let aborted = false;
		let onAbort: (() => void) | undefined;
		const abortPromise = signal
			? new Promise<void>((resolve) => {
					onAbort = () => {
						aborted = true;
						resolve();
					};
					signal.addEventListener("abort", onAbort, { once: true });
					if (signal.aborted) onAbort();
				})
			: undefined;
		if (abortPromise)
			await Promise.race([
				Promise.all(captured.map((item) => item.promise)).then(() => undefined),
				abortPromise,
			]);
		else await Promise.all(captured.map((item) => item.promise));
		if (signal && onAbort) signal.removeEventListener("abort", onAbort);
		const capturedById = new Map(captured.map((item) => [item.taskId, item]));
		const results = immediate.map(({ taskId, result }): TaskMultiResult => {
			const capture = capturedById.get(taskId);
			if (!capture) return { ...result, id: taskId };
			if (capture.settled)
				return { ...this.classify(getTask(taskId), false), id: taskId };
			return {
				id: taskId,
				classification: "aborted",
				state: result.state,
				record: result.record,
			};
		});
		return { outcome: aborted ? "aborted" : "persisted", results };
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

	private reconcileLateStoppedExecution(
		taskId: string,
		active: ActiveExecution,
	): boolean {
		if (!active.settled || !active.stopRequested) return active.settled;
		const current = getTask(taskId);
		const currentExecution = current && executionFor(current);
		if (currentExecution?.status === "failed_to_stop") {
			updateTask(taskId, {
				execution: { ...currentExecution, status: "stopped" },
			});
			safeTransitionTask(taskId, "cancelled");
			this.notifyCompletion({
				taskId,
				agent: currentExecution.agent,
				status: "stopped",
				durationMs: executionDurationMs(currentExecution),
			});
		}
		return true;
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
			if (this.reconcileLateStoppedExecution(taskId, active)) return;
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
				this.notifyCompletion({
					taskId,
					agent: execution.agent,
					status: "stopped",
					durationMs: executionDurationMs(execution, result.durationMs),
					output: result.output,
					outputPath: savedOutput.outputPath,
				});
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
			this.notifyCompletion({
				taskId,
				agent: execution.agent,
				status,
				durationMs: executionDurationMs(execution, result.durationMs),
				output: result.output,
				outputPath: savedOutput.outputPath,
			});
		} catch (error) {
			if (this.reconcileLateStoppedExecution(taskId, active)) return;
			if (active.stopRequested) {
				this.settleExecution(taskId, execution, "stopped", active);
				safeTransitionTask(taskId, "cancelled");
				this.notifyCompletion({
					taskId,
					agent: execution.agent,
					status: "stopped",
					durationMs: executionDurationMs(execution),
				});
				return;
			}
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			this.settleExecution(taskId, execution, "failed", active);
			safeTransitionTask(taskId, "failed", { errorReason: errorMessage });
			this.notifyCompletion({
				taskId,
				agent: execution.agent,
				status: "failed",
				durationMs: executionDurationMs(execution),
				error: errorMessage,
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
		if (execution && execution.status !== "failed_to_stop")
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
