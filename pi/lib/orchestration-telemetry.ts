import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import type { MetricsEvent, RecordEventInput } from "./metrics.ts";
import {
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	type TaskUsage,
} from "./task-registry.ts";
import { sanitizeTaskValue } from "./task-security.ts";

export const ORCHESTRATION_TELEMETRY_SCHEMA_VERSION = 1 as const;

const MAX_WORKERS = 32;
const MAX_ORCHESTRATION_IDS = 64;
const MAX_PARENT_USAGE_MODELS = 8;
const MAX_STRING_LENGTH = 120;
const MAX_FILES = 367;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_MALFORMED_LINES = 10_000;

const MODES = new Set(["single", "parallel", "chain", "task-execute"]);
const STATUSES = new Set([
	"pending",
	"running",
	"completed",
	"failed",
	"cancelled",
	"stopped",
	"failed_to_stop",
	"orphaned",
	"rejected",
]);
const OUTPUT_MODES = new Set(["inline", "artifact", "none"]);
const COST_SOURCES = new Set(["pi-usage", "unavailable"]);
const VALIDATION_OUTCOMES = new Set(["passed", "failed", "unavailable"]);
const METADATA_VALUE = /^[A-Za-z0-9 ._\-/:@]+$/;
const FORBIDDEN_METADATA =
	/(?:\bBearer\s+|-----BEGIN|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.|:\/\/[^/\s@]+@)/i;

type OrchestrationMode = "single" | "parallel" | "chain" | "task-execute";
type OrchestrationStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled"
	| "stopped"
	| "failed_to_stop"
	| "orphaned"
	| "rejected";
type OutputMode = "inline" | "artifact" | "none";
type CostSource = "pi-usage" | "unavailable";

export type { CostSource, OrchestrationMode, OrchestrationStatus, OutputMode };

export interface OrchestrationWorker {
	runId: string;
	taskId?: string;
	agent: string;
	resolvedModel?: string;
	experimentId?: string;
	experimentArm?: string;
	experimentTaskClass?: string;
	validationOutcome?: "passed" | "failed" | "unavailable";
	status: OrchestrationStatus;
	exitCode?: number;
	durationMs?: number;
	outputMode?: OutputMode;
	childTextBytes?: number;
	parentVisibleBytes?: number;
	artifactBytes?: number;
	chainTransferBytes?: number;
	usage?: NormalizedTaskUsage;
	turns?: number;
}

export interface OrchestrationRunData {
	schemaVersion: 1;
	orchestrationId: string;
	parentSessionId?: string;
	interactionId?: string;
	mode: OrchestrationMode;
	fanOut?: number;
	status: OrchestrationStatus;
	durationMs?: number;
	childWorkMs?: number;
	childTextBytes?: number;
	parentVisibleBytes?: number;
	artifactBytes?: number;
	chainTransferBytes?: number;
	inlineBytesNotReturned?: number;
	workers: OrchestrationWorker[];
}

export interface ParentUsageByModel {
	provider: string;
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	contextPeakTokens?: number;
	costUsd?: number | null;
	costSource: CostSource;
}

export interface OrchestrationInteractionData {
	schemaVersion: 1;
	interactionId: string;
	orchestrationIds: string[];
	parentUsageByModel: ParentUsageByModel[];
	durationMs?: number;
	direct: boolean;
}

export interface BuildOrchestrationRunInput
	extends Omit<OrchestrationRunData, "schemaVersion" | "workers"> {
	workers: OrchestrationWorker[];
	session?: string;
}

export interface BuildOrchestrationInteractionInput
	extends Omit<OrchestrationInteractionData, "schemaVersion"> {
	session?: string;
}

type MetricsData<T extends object> = T & Record<string, unknown>;

export type OrchestrationEventInput =
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_run";
			data: MetricsData<OrchestrationRunData>;
	  })
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_interaction";
			data: MetricsData<OrchestrationInteractionData>;
	  });

function hasOnlyKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

function metadataString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const sanitized = sanitizeTaskValue(value);
	if (sanitized.length === 0 || sanitized.length > MAX_STRING_LENGTH)
		return undefined;
	if (FORBIDDEN_METADATA.test(sanitized)) return undefined;
	if (sanitized !== "[REDACTED]" && !METADATA_VALUE.test(sanitized))
		return undefined;
	return sanitized;
}

function nonnegative(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function status(value: unknown): OrchestrationStatus | undefined {
	return typeof value === "string" && STATUSES.has(value)
		? (value as OrchestrationStatus)
		: undefined;
}

function mode(value: unknown): OrchestrationMode | undefined {
	return typeof value === "string" && MODES.has(value)
		? (value as OrchestrationMode)
		: undefined;
}

function outputMode(value: unknown): OutputMode | undefined {
	return typeof value === "string" && OUTPUT_MODES.has(value)
		? (value as OutputMode)
		: undefined;
}

function costSource(value: unknown): CostSource | undefined {
	return typeof value === "string" && COST_SOURCES.has(value)
		? (value as CostSource)
		: undefined;
}

function normalizeUsage(value: unknown): NormalizedTaskUsage | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const usage = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(usage, [
			"inputTokens",
			"outputTokens",
			"totalTokens",
			"cacheCreationInputTokens",
			"cacheReadInputTokens",
			"processedTokens",
			"contextPeakTokens",
			"turns",
			"costUsd",
			"costSource",
		])
	)
		return undefined;
	const normalized = normalizeTaskUsage({
		inputTokens:
			typeof usage.inputTokens === "number" ? usage.inputTokens : undefined,
		outputTokens:
			typeof usage.outputTokens === "number" ? usage.outputTokens : undefined,
		totalTokens:
			typeof usage.totalTokens === "number" ? usage.totalTokens : undefined,
		cacheCreationInputTokens:
			typeof usage.cacheCreationInputTokens === "number"
				? usage.cacheCreationInputTokens
				: undefined,
		cacheReadInputTokens:
			typeof usage.cacheReadInputTokens === "number"
				? usage.cacheReadInputTokens
				: undefined,
		processedTokens:
			typeof usage.processedTokens === "number"
				? usage.processedTokens
				: undefined,
		contextPeakTokens:
			typeof usage.contextPeakTokens === "number"
				? usage.contextPeakTokens
				: undefined,
		turns: typeof usage.turns === "number" ? usage.turns : undefined,
		costUsd:
			typeof usage.costUsd === "number" || usage.costUsd === null
				? usage.costUsd
				: undefined,
		costSource:
			usage.costSource === "pi-usage" || usage.costSource === "unavailable"
				? usage.costSource
				: undefined,
	} satisfies TaskUsage);
	if (
		usage.costSource !== normalized.costSource ||
		!costSource(usage.costSource)
	)
		return undefined;
	return normalized;
}

function buildWorker(value: unknown): OrchestrationWorker | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const worker = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(worker, [
			"runId",
			"taskId",
			"agent",
			"resolvedModel",
			"experimentId",
			"experimentArm",
			"experimentTaskClass",
			"validationOutcome",
			"status",
			"exitCode",
			"durationMs",
			"outputMode",
			"childTextBytes",
			"parentVisibleBytes",
			"artifactBytes",
			"chainTransferBytes",
			"usage",
			"turns",
		])
	)
		return undefined;
	const runId = metadataString(worker.runId);
	const agent = metadataString(worker.agent);
	const workerStatus = status(worker.status);
	if (!runId || !agent || !workerStatus) return undefined;
	const result: OrchestrationWorker = { runId, agent, status: workerStatus };
	const taskId = metadataString(worker.taskId);
	const resolvedModel = metadataString(worker.resolvedModel);
	const experimentId = metadataString(worker.experimentId);
	const experimentArm = metadataString(worker.experimentArm);
	const experimentTaskClass = metadataString(worker.experimentTaskClass);
	const validationOutcome =
		typeof worker.validationOutcome === "string" &&
		VALIDATION_OUTCOMES.has(worker.validationOutcome)
			? (worker.validationOutcome as OrchestrationWorker["validationOutcome"])
			: undefined;
	const workerOutputMode = outputMode(worker.outputMode);
	const usage = normalizeUsage(worker.usage);
	if (worker.taskId !== undefined && !taskId) return undefined;
	if (worker.resolvedModel !== undefined && !resolvedModel) return undefined;
	if (worker.experimentId !== undefined && !experimentId) return undefined;
	if (worker.experimentArm !== undefined && !experimentArm) return undefined;
	if (worker.experimentTaskClass !== undefined && !experimentTaskClass)
		return undefined;
	if (worker.validationOutcome !== undefined && !validationOutcome)
		return undefined;
	if (worker.outputMode !== undefined && !workerOutputMode) return undefined;
	if (worker.usage !== undefined && !usage) return undefined;
	if (taskId) result.taskId = taskId;
	if (resolvedModel) result.resolvedModel = resolvedModel;
	if (experimentId) result.experimentId = experimentId;
	if (experimentArm) result.experimentArm = experimentArm;
	if (experimentTaskClass) result.experimentTaskClass = experimentTaskClass;
	if (validationOutcome) result.validationOutcome = validationOutcome;
	if (workerOutputMode) result.outputMode = workerOutputMode;
	for (const key of [
		"exitCode",
		"durationMs",
		"childTextBytes",
		"parentVisibleBytes",
		"artifactBytes",
		"chainTransferBytes",
		"turns",
	] as const) {
		const number = nonnegative(worker[key]);
		if (number !== undefined) result[key] = number;
	}
	if (usage) result.usage = usage;
	return result;
}

/** Builds the only accepted metrics input for an orchestration run. */
export function buildOrchestrationRunEvent(
	input: BuildOrchestrationRunInput,
): OrchestrationEventInput | null {
	const raw = input as unknown as Record<string, unknown>;
	if (
		!hasOnlyKeys(raw, [
			"orchestrationId",
			"parentSessionId",
			"interactionId",
			"mode",
			"fanOut",
			"status",
			"durationMs",
			"childWorkMs",
			"childTextBytes",
			"parentVisibleBytes",
			"artifactBytes",
			"chainTransferBytes",
			"inlineBytesNotReturned",
			"workers",
			"session",
		])
	)
		return null;
	const orchestrationId = metadataString(input.orchestrationId);
	const runMode = mode(input.mode);
	const runStatus = status(input.status);
	if (
		!orchestrationId ||
		!runMode ||
		!runStatus ||
		!Array.isArray(input.workers) ||
		input.workers.length > MAX_WORKERS
	)
		return null;
	const workers = input.workers.map(buildWorker);
	if (workers.some((worker) => worker === undefined)) return null;
	const data: MetricsData<OrchestrationRunData> = {
		schemaVersion: 1,
		orchestrationId,
		mode: runMode,
		status: runStatus,
		workers: workers as OrchestrationWorker[],
	};
	for (const key of ["parentSessionId", "interactionId"] as const) {
		const value = metadataString(input[key]);
		if (input[key] !== undefined && !value) return null;
		if (value) data[key] = value;
	}
	for (const key of [
		"fanOut",
		"durationMs",
		"childWorkMs",
		"childTextBytes",
		"parentVisibleBytes",
		"artifactBytes",
		"chainTransferBytes",
	] as const) {
		const value = nonnegative(input[key]);
		if (value !== undefined) data[key] = value;
	}
	for (const key of [
		"childTextBytes",
		"parentVisibleBytes",
		"artifactBytes",
		"chainTransferBytes",
	] as const) {
		if (data[key] === undefined) {
			const total = (workers as OrchestrationWorker[]).reduce(
				(sum, worker) => sum + (worker[key] ?? 0),
				0,
			);
			if (total > 0) data[key] = total;
		}
	}
	const childTextBytes = data.childTextBytes ?? 0;
	const parentVisibleBytes = data.parentVisibleBytes ?? 0;
	data.inlineBytesNotReturned = Math.max(
		0,
		childTextBytes - parentVisibleBytes,
	);
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	return { event: "orchestration_run", ...(session ? { session } : {}), data };
}

function buildParentUsage(value: unknown): ParentUsageByModel | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const usage = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(usage, [
			"provider",
			"model",
			"inputTokens",
			"outputTokens",
			"cacheReadTokens",
			"cacheWriteTokens",
			"contextPeakTokens",
			"costUsd",
			"costSource",
		])
	)
		return undefined;
	const provider = metadataString(usage.provider);
	const modelName = metadataString(usage.model);
	const source = costSource(usage.costSource);
	if (!provider || !modelName || !source) return undefined;
	const result: ParentUsageByModel = {
		provider,
		model: modelName,
		costSource: source,
	};
	for (const key of [
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
		"contextPeakTokens",
	] as const) {
		const number = nonnegative(usage[key]);
		if (number !== undefined) result[key] = number;
	}
	if (usage.costUsd === null) result.costUsd = null;
	else {
		const costUsd = nonnegative(usage.costUsd);
		if (usage.costUsd !== undefined && costUsd === undefined) return undefined;
		if (costUsd !== undefined) result.costUsd = costUsd;
	}
	if (
		(source === "unavailable") !==
		(result.costUsd === null || result.costUsd === undefined)
	)
		return undefined;
	return result;
}

/** Builds the only accepted metrics input for an orchestration interaction. */
export function buildOrchestrationInteractionEvent(
	input: BuildOrchestrationInteractionInput,
): OrchestrationEventInput | null {
	const raw = input as unknown as Record<string, unknown>;
	if (
		!hasOnlyKeys(raw, [
			"interactionId",
			"orchestrationIds",
			"parentUsageByModel",
			"durationMs",
			"direct",
			"session",
		])
	)
		return null;
	const interactionId = metadataString(input.interactionId);
	if (
		!interactionId ||
		!Array.isArray(input.orchestrationIds) ||
		input.orchestrationIds.length > MAX_ORCHESTRATION_IDS ||
		!Array.isArray(input.parentUsageByModel) ||
		input.parentUsageByModel.length > MAX_PARENT_USAGE_MODELS ||
		typeof input.direct !== "boolean"
	)
		return null;
	const orchestrationIds = input.orchestrationIds.map(metadataString);
	const parentUsageByModel = input.parentUsageByModel.map(buildParentUsage);
	if (
		orchestrationIds.some((id) => !id) ||
		parentUsageByModel.some((usage) => !usage)
	)
		return null;
	const data: MetricsData<OrchestrationInteractionData> = {
		schemaVersion: 1,
		interactionId,
		orchestrationIds: orchestrationIds as string[],
		parentUsageByModel: parentUsageByModel as ParentUsageByModel[],
		direct: input.direct,
	};
	const durationMs = nonnegative(input.durationMs);
	if (durationMs !== undefined) data.durationMs = durationMs;
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	return {
		event: "orchestration_interaction",
		...(session ? { session } : {}),
		data,
	};
}

export interface OrchestrationReaderDiagnostics {
	filesScanned: number;
	malformedLines: number;
	unsupportedLines: number;
	overLimitLines: number;
	duplicateLines: number;
	totalInputBytes: number;
	truncated: boolean;
	truncationReason?:
		| "file_limit"
		| "line_limit"
		| "input_limit"
		| "malformed_limit";
}

export interface ReadOrchestrationEventsOptions {
	dir: string;
	days: number;
	now?: Date;
}

export interface ReadOrchestrationEventsResult {
	events: Array<
		MetricsEvent & {
			event: "orchestration_run" | "orchestration_interaction";
			data: OrchestrationRunData | OrchestrationInteractionData;
		}
	>;
	diagnostics: OrchestrationReaderDiagnostics;
}

function dateFileName(date: Date): string {
	return `metrics-${date.toISOString().slice(0, 10)}.jsonl`;
}

function metricsFiles(
	dir: string,
	days: number,
	now: Date,
): { files: string[]; overLimit: boolean } {
	if (!Number.isInteger(days) || days < 1)
		return { files: [], overLimit: false };
	const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
	const cursor = new Date(
		Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
	);
	const end = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const names = new Set<string>(["metrics.jsonl"]);
	while (cursor <= end && names.size <= MAX_FILES + 1) {
		names.add(dateFileName(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	const files = [...names]
		.filter((name) => fs.existsSync(path.join(dir, name)))
		.sort();
	return {
		files: files.slice(0, MAX_FILES),
		overLimit: files.length > MAX_FILES || names.size > MAX_FILES + 1,
	};
}

function validEvent(value: unknown): value is MetricsEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const event = value as Record<string, unknown>;
	return (
		event.schemaVersion === 1 &&
		typeof event.id === "string" &&
		typeof event.ts === "string" &&
		typeof event.event === "string" &&
		(event.data === undefined ||
			(typeof event.data === "object" &&
				event.data !== null &&
				!Array.isArray(event.data)))
	);
}

function eventInWindow(
	event: MetricsEvent,
	start: number,
	end: number,
): boolean {
	const timestamp = Date.parse(event.ts);
	return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
}

function normalizePayload(
	event: MetricsEvent,
): ReadOrchestrationEventsResult["events"][number] | null {
	const data = event.data as Record<string, unknown> | undefined;
	if (!data || data.schemaVersion !== ORCHESTRATION_TELEMETRY_SCHEMA_VERSION)
		return null;
	const {
		schemaVersion: _schemaVersion,
		inlineBytesNotReturned: _inlineBytesNotReturned,
		...payload
	} = data;
	if (event.event === "orchestration_run") {
		const built = buildOrchestrationRunEvent({
			...payload,
			session: event.session,
		} as BuildOrchestrationRunInput);
		return built ? { ...event, event: built.event, data: built.data } : null;
	}
	if (event.event === "orchestration_interaction") {
		const built = buildOrchestrationInteractionEvent({
			...payload,
			session: event.session,
		} as BuildOrchestrationInteractionInput);
		return built ? { ...event, event: built.event, data: built.data } : null;
	}
	return null;
}

/** Reads bounded orchestration events from daily and legacy metrics JSONL files. */
export async function readOrchestrationEvents(
	options: ReadOrchestrationEventsOptions,
): Promise<ReadOrchestrationEventsResult> {
	const now = options.now ?? new Date();
	const diagnostics: OrchestrationReaderDiagnostics = {
		filesScanned: 0,
		malformedLines: 0,
		unsupportedLines: 0,
		overLimitLines: 0,
		duplicateLines: 0,
		totalInputBytes: 0,
		truncated: false,
	};
	const { files, overLimit } = metricsFiles(options.dir, options.days, now);
	if (overLimit) {
		diagnostics.truncated = true;
		diagnostics.truncationReason = "file_limit";
	}
	const start = now.getTime() - options.days * 24 * 60 * 60 * 1000;
	const seen = new Set<string>();
	const events: ReadOrchestrationEventsResult["events"] = [];
	for (const file of files) {
		if (diagnostics.truncated && diagnostics.truncationReason === "input_limit")
			break;
		diagnostics.filesScanned++;
		const lines = readline.createInterface({
			input: fs.createReadStream(path.join(options.dir, file), {
				encoding: "utf-8",
			}),
			crlfDelay: Number.POSITIVE_INFINITY,
		});
		for await (const line of lines) {
			const bytes = Buffer.byteLength(line, "utf-8") + 1;
			if (bytes > MAX_LINE_BYTES) {
				diagnostics.overLimitLines++;
				continue;
			}
			if (diagnostics.totalInputBytes + bytes > MAX_INPUT_BYTES) {
				diagnostics.truncated = true;
				diagnostics.truncationReason = "input_limit";
				lines.close();
				break;
			}
			diagnostics.totalInputBytes += bytes;
			if (!line.trim()) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				diagnostics.malformedLines++;
				if (diagnostics.malformedLines >= MAX_MALFORMED_LINES) {
					diagnostics.truncated = true;
					diagnostics.truncationReason = "malformed_limit";
					lines.close();
					break;
				}
				continue;
			}
			if (
				!validEvent(parsed) ||
				!eventInWindow(parsed, start, now.getTime()) ||
				(parsed.event !== "orchestration_run" &&
					parsed.event !== "orchestration_interaction")
			)
				continue;
			const normalized = normalizePayload(parsed);
			if (!normalized) {
				diagnostics.unsupportedLines++;
				continue;
			}
			if (seen.has(normalized.id)) {
				diagnostics.duplicateLines++;
				continue;
			}
			seen.add(normalized.id);
			events.push(normalized);
		}
		if (diagnostics.truncated && diagnostics.truncationReason !== "file_limit")
			break;
	}
	events.sort(
		(left, right) =>
			left.ts.localeCompare(right.ts) || left.id.localeCompare(right.id),
	);
	return { events, diagnostics };
}
