import { createHash } from "node:crypto";
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
import { correlationForEmission, type CorrelationFields } from "./log-analytics/correlation.ts";

export const ORCHESTRATION_TELEMETRY_SCHEMA_VERSION = 3 as const;
export const READ_ONLY_FANOUT_EXPERIMENT_ID = "read-only-fanout-v1";
export const READ_ONLY_FANOUT_EXPERIMENT_VERSION = 1 as const;
export const READ_ONLY_FANOUT_TASK_CLASS = "read-only-multi-item-analysis";
export const READ_ONLY_FANOUT_RISK_CLASS = "read-only";

const MAX_WORKERS = 32;
const MAX_READ_ONLY_FANOUT_ITEMS = 8;
const MAX_ORCHESTRATION_IDS = 64;
const MAX_PARENT_USAGE_MODELS = 8;
const MAX_STRING_LENGTH = 120;
const MAX_FILES = 367;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_MALFORMED_LINES = 10_000;
const MAX_TELEMETRY_COUNT = 1_000_000;
const MAX_INTERVENTION_NUMERIC = 1_000_000_000;

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
const TREE_ROLES = new Set(["root", "coordinator", "leaf"]);
const WORKFLOW_PHASES = new Set(["map", "retry", "verify", "reduce"]);
const EXECUTION_KINDS = new Set(["read", "write", "coordinator", "legacy"]);
const OUTCOME_CODES = new Set([
	"completed",
	"failed",
	"cancelled",
	"rejected",
	"timeout",
	"interrupted",
	"continued",
	"partial",
	"unknown",
]);
const WORKSPACE_ROOT_SOURCES = new Set(["default", "override"]);
const COORDINATOR_BUDGET_OUTCOMES = new Set([
	"not_applicable",
	"within_budget",
	"max_workers",
	"max_turns",
	"soft_deadline",
]);
const LEGACY_ADAPTER_BRANCHES = new Set([
	"single",
	"parallel",
	"chain",
	"continue",
	"fanout",
	"workflow",
]);
const TASK_LINK_SOURCES = new Set(["none", "explicit", "auto", "invalid"]);
const INTERVENTION_CODES = new Set([
	"rejection",
	"containment",
	"timeout",
	"interruption",
	"continuation",
	"budget",
	"task-link",
	"legacy-adapter",
	"boundary",
	"watchdog",
	"ping",
	"recovery",
]);
const INTERVENTION_OUTCOMES = new Set([
	"rejected",
	"contained",
	"timed_out",
	"interrupted",
	"continued",
	"acknowledged",
	"completed",
	"failed",
	"partial",
	"unknown",
]);
const METADATA_VALUE = /^[A-Za-z0-9 ._\-/:@]+$/;
const METADATA_IDENTIFIER = /^[A-Za-z0-9._:@-]+$/;
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
export type OrchestrationExecutionKind =
	| "read"
	| "write"
	| "coordinator"
	| "legacy";
export type ContinuationStatus = "fresh" | "continued";
export type OrchestrationOutcomeCode =
	| "completed"
	| "failed"
	| "cancelled"
	| "rejected"
	| "timeout"
	| "interrupted"
	| "continued"
	| "partial"
	| "unknown";
export type WorkspaceRootSource = "default" | "override";
export type CoordinatorBudgetOutcome =
	| "not_applicable"
	| "within_budget"
	| "max_workers"
	| "max_turns"
	| "soft_deadline";
export type LegacyAdapterBranch =
	| "single"
	| "parallel"
	| "chain"
	| "continue"
	| "fanout"
	| "workflow";
export type TaskLinkSource = "none" | "explicit" | "auto" | "invalid";
export type OrchestrationDeliverableOutcome =
	| "complete"
	| "partial"
	| "blocked"
	| "failed";
export type OrchestrationInterventionCode =
	| "rejection"
	| "containment"
	| "timeout"
	| "interruption"
	| "continuation"
	| "budget"
	| "task-link"
	| "legacy-adapter"
	| "boundary"
	| "watchdog"
	| "ping"
	| "recovery";
export type OrchestrationInterventionOutcome =
	| "rejected"
	| "contained"
	| "timed_out"
	| "interrupted"
	| "continued"
	| "acknowledged"
	| "completed"
	| "failed"
	| "partial"
	| "unknown";
export type { CostSource, OrchestrationMode, OrchestrationStatus, OutputMode };

export interface OrchestrationTelemetryFields {
	executionKind?: OrchestrationExecutionKind;
	outcomeCode?: OrchestrationOutcomeCode;
	deliverableOutcome?: OrchestrationDeliverableOutcome;
	workspaceRootSource?: WorkspaceRootSource;
	markerCount?: number;
	boundaryCount?: number;
	searchCount?: number;
	watchdogCount?: number;
	pingCount?: number;
	interruptionCount?: number;
	recoveryCount?: number;
	coordinatorBudgetOutcome?: CoordinatorBudgetOutcome;
	legacyAdapterBranch?: LegacyAdapterBranch;
	legacyAdapterUse?: boolean;
	taskLinkSource?: TaskLinkSource;
	onclaveEligible?: boolean;
}

export type OrchestrationTreeRole = "root" | "coordinator" | "leaf";
export type OrchestrationWorkflowPhase = "map" | "retry" | "verify" | "reduce";

export interface OrchestrationWorker extends OrchestrationTelemetryFields {
	runId: string;
	treeId?: string;
	parentRunId?: string;
	depth?: number;
	role?: OrchestrationTreeRole;
	workflowPhase?: OrchestrationWorkflowPhase;
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	coordinatorTaskId?: string;
	taskId?: string;
	continuationStatus?: ContinuationStatus;
	agent: string;
	resolvedModel?: string;
	selectedEffort?: string;
	advisoryPolicyVersion?: string;
	advisoryTaskClass?: string;
	advisoryRecommendedRoute?: string;
	advisoryClassification?: string;
	advisoryTopologyMismatch?: boolean;
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

export interface OrchestrationRunData extends OrchestrationTelemetryFields {
	schemaVersion: 3;
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

export interface OrchestrationInteractionData extends OrchestrationTelemetryFields {
	schemaVersion: 3;
	interactionId: string;
	orchestrationIds: string[];
	parentUsageByModel: ParentUsageByModel[];
	durationMs?: number;
	direct: boolean;
}

export type ReadOnlyFanoutArm =
	| "single-generalist"
	| "parallel-specialists";

export interface ReadOnlyFanoutAssignment {
	experimentId: typeof READ_ONLY_FANOUT_EXPERIMENT_ID;
	experimentVersion: typeof READ_ONLY_FANOUT_EXPERIMENT_VERSION;
	assignmentId: string;
	taskClass: typeof READ_ONLY_FANOUT_TASK_CLASS;
	riskClass: typeof READ_ONLY_FANOUT_RISK_CLASS;
	independentWorkItems: number;
	arm: ReadOnlyFanoutArm;
	assignmentMethod: "deterministic-hash";
}

export interface OrchestrationExperimentAssignmentData
	extends ReadOnlyFanoutAssignment {
	schemaVersion: 1;
	orchestrationId: string;
	interactionId?: string;
}

export interface OrchestrationExperimentOutcomeData {
	schemaVersion: 1;
	experimentId: typeof READ_ONLY_FANOUT_EXPERIMENT_ID;
	experimentVersion: typeof READ_ONLY_FANOUT_EXPERIMENT_VERSION;
	assignmentId: string;
	orchestrationId: string;
	validationKind: "output-schema";
	validationOutcome: "passed" | "failed" | "not_run";
	checksTotal: number;
	checksPassed: number;
}

export interface SubagentInterventionData {
	schemaVersion: 1;
	orchestrationId: string;
	runId: string;
	code: OrchestrationInterventionCode;
	outcome: OrchestrationInterventionOutcome;
	acknowledged: boolean;
	durationMs?: number;
	activeToolDurationMs?: number;
	activeToolOutputAgeMs?: number;
	activityVersion?: number;
	markerCount?: number;
	boundaryCount?: number;
	searchCount?: number;
	watchdogCount?: number;
	pingCount?: number;
	interruptionCount?: number;
	recoveryCount?: number;
}

export interface BuildSubagentInterventionInput
	extends Omit<SubagentInterventionData, "schemaVersion"> {
	session?: string;
	correlation?: EventCorrelation;
}

export interface BuildOrchestrationRunInput
	extends Omit<OrchestrationRunData, "schemaVersion" | "workers"> {
	workers: OrchestrationWorker[];
	session?: string;
	correlation?: EventCorrelation;
}

export interface BuildOrchestrationInteractionInput
	extends Omit<OrchestrationInteractionData, "schemaVersion"> {
	session?: string;
	correlation?: EventCorrelation;
}

export interface BuildOrchestrationExperimentAssignmentInput
	extends Omit<OrchestrationExperimentAssignmentData, "schemaVersion"> {
	session?: string;
	correlation?: EventCorrelation;
}

export interface BuildOrchestrationExperimentOutcomeInput
	extends Omit<OrchestrationExperimentOutcomeData, "schemaVersion"> {
	session?: string;
	correlation?: EventCorrelation;
}

type MetricsData<T extends object> = T & Record<string, unknown>;
type EventCorrelation = NonNullable<RecordEventInput["correlation"]>;

function eventCorrelation(input: {
	correlation?: EventCorrelation;
	session?: string;
	parentSessionId?: string;
	interactionId?: string;
	orchestrationId?: string;
	runId?: string;
	taskId?: string;
}): EventCorrelation | undefined {
	const inherited = correlationForEmission();
	const direct: Partial<CorrelationFields> = {
		...(input.session || input.parentSessionId
			? { session_id: input.parentSessionId ?? input.session }
			: {}),
		...(input.interactionId ? { interaction_id: input.interactionId } : {}),
		...(input.orchestrationId
			? { orchestration_id: input.orchestrationId }
			: {}),
		...(input.runId ? { run_id: input.runId } : {}),
		...(input.taskId ? { task_id: input.taskId } : {}),
	};
	const result = { ...(inherited ?? {}), ...(input.correlation ?? {}), ...direct };
	return Object.keys(result).length > 0 ? result : undefined;
}

export type SubagentInterventionEventInput = Omit<
	RecordEventInput,
	"event" | "data"
> & {
	event: "subagent_intervention";
	data: MetricsData<SubagentInterventionData>;
};

export type OrchestrationEventInput =
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_run";
			data: MetricsData<OrchestrationRunData>;
	  })
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_interaction";
			data: MetricsData<OrchestrationInteractionData>;
	  });

export type OrchestrationExperimentEventInput =
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_experiment_assignment";
			data: MetricsData<OrchestrationExperimentAssignmentData>;
	  })
	| (Omit<RecordEventInput, "event" | "data"> & {
			event: "orchestration_experiment_outcome";
			data: MetricsData<OrchestrationExperimentOutcomeData>;
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

function metadataIdentifier(value: unknown): string | undefined {
	const sanitized = metadataString(value);
	if (!sanitized || sanitized === "[REDACTED]") return undefined;
	return METADATA_IDENTIFIER.test(sanitized) ? sanitized : undefined;
}

function nonnegative(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function boundedCount(value: unknown): number | undefined {
	return typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= MAX_TELEMETRY_COUNT
		? value
		: undefined;
}

function boundedInterventionNumber(value: unknown): number | undefined {
	return typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= MAX_INTERVENTION_NUMERIC
		? value
		: undefined;
}

const DELIVERABLE_OUTCOMES = new Set<OrchestrationDeliverableOutcome>([
	"complete",
	"partial",
	"blocked",
	"failed",
]);

const ORCHESTRATION_TELEMETRY_KEYS = [
	"executionKind",
	"outcomeCode",
	"deliverableOutcome",
	"workspaceRootSource",
	"markerCount",
	"boundaryCount",
	"searchCount",
	"watchdogCount",
	"pingCount",
	"interruptionCount",
	"recoveryCount",
	"coordinatorBudgetOutcome",
	"legacyAdapterBranch",
	"legacyAdapterUse",
	"taskLinkSource",
	"onclaveEligible",
] as const;

function telemetryFields(
	value: Record<string, unknown>,
): OrchestrationTelemetryFields | undefined {
	const executionKind =
		typeof value.executionKind === "string" &&
		EXECUTION_KINDS.has(value.executionKind)
			? (value.executionKind as OrchestrationExecutionKind)
			: undefined;
	const outcomeCode =
		typeof value.outcomeCode === "string" && OUTCOME_CODES.has(value.outcomeCode)
			? (value.outcomeCode as OrchestrationOutcomeCode)
			: undefined;
	const deliverableOutcome =
		typeof value.deliverableOutcome === "string" &&
		DELIVERABLE_OUTCOMES.has(value.deliverableOutcome as OrchestrationDeliverableOutcome)
			? (value.deliverableOutcome as OrchestrationDeliverableOutcome)
			: undefined;
	const workspaceRootSource =
		typeof value.workspaceRootSource === "string" &&
		WORKSPACE_ROOT_SOURCES.has(value.workspaceRootSource)
			? (value.workspaceRootSource as WorkspaceRootSource)
			: undefined;
	const coordinatorBudgetOutcome =
		typeof value.coordinatorBudgetOutcome === "string" &&
		COORDINATOR_BUDGET_OUTCOMES.has(value.coordinatorBudgetOutcome)
			? (value.coordinatorBudgetOutcome as CoordinatorBudgetOutcome)
			: undefined;
	const legacyAdapterBranch =
		typeof value.legacyAdapterBranch === "string" &&
		LEGACY_ADAPTER_BRANCHES.has(value.legacyAdapterBranch)
			? (value.legacyAdapterBranch as LegacyAdapterBranch)
			: undefined;
	const taskLinkSource =
		typeof value.taskLinkSource === "string" &&
		TASK_LINK_SOURCES.has(value.taskLinkSource)
			? (value.taskLinkSource as TaskLinkSource)
			: undefined;
	if (
		(value.executionKind !== undefined && executionKind === undefined) ||
		(value.outcomeCode !== undefined && outcomeCode === undefined) ||
		(value.deliverableOutcome !== undefined && deliverableOutcome === undefined) ||
		(value.workspaceRootSource !== undefined && workspaceRootSource === undefined) ||
		(value.coordinatorBudgetOutcome !== undefined && coordinatorBudgetOutcome === undefined) ||
		(value.legacyAdapterBranch !== undefined && legacyAdapterBranch === undefined) ||
		(value.taskLinkSource !== undefined && taskLinkSource === undefined) ||
		(value.legacyAdapterUse !== undefined && typeof value.legacyAdapterUse !== "boolean") ||
		(value.onclaveEligible !== undefined && typeof value.onclaveEligible !== "boolean")
	)
		return undefined;
	const result: OrchestrationTelemetryFields = {};
	if (executionKind) result.executionKind = executionKind;
	if (outcomeCode) result.outcomeCode = outcomeCode;
	if (deliverableOutcome) result.deliverableOutcome = deliverableOutcome;
	if (workspaceRootSource) result.workspaceRootSource = workspaceRootSource;
	if (coordinatorBudgetOutcome)
		result.coordinatorBudgetOutcome = coordinatorBudgetOutcome;
	if (legacyAdapterBranch) result.legacyAdapterBranch = legacyAdapterBranch;
	if (taskLinkSource) result.taskLinkSource = taskLinkSource;
	if (value.legacyAdapterUse !== undefined)
		result.legacyAdapterUse = value.legacyAdapterUse as boolean;
	if (value.onclaveEligible !== undefined)
		result.onclaveEligible = value.onclaveEligible as boolean;
	for (const key of [
		"markerCount",
		"boundaryCount",
		"searchCount",
		"watchdogCount",
		"pingCount",
		"interruptionCount",
		"recoveryCount",
	] as const) {
		const count = boundedCount(value[key]);
		if (value[key] !== undefined && count === undefined) return undefined;
		if (count !== undefined) result[key] = count;
	}
	return result;
}

function treeDepth(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2
		? value
		: undefined;
}

function workflowAttempt(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3
		? value
		: undefined;
}

function status(value: unknown): OrchestrationStatus | undefined {
	return typeof value === "string" && STATUSES.has(value)
		? (value as OrchestrationStatus)
		: undefined;
}

function treeRole(value: unknown): OrchestrationTreeRole | undefined {
	return typeof value === "string" && TREE_ROLES.has(value)
		? (value as OrchestrationTreeRole)
		: undefined;
}

function workflowPhase(value: unknown): OrchestrationWorkflowPhase | undefined {
	return typeof value === "string" && WORKFLOW_PHASES.has(value)
		? (value as OrchestrationWorkflowPhase)
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
			"treeId",
			"parentRunId",
			"depth",
			"role",
			"workflowPhase",
			"taskKey",
			"attempt",
			"retryOrigin",
			"coordinatorTaskId",
			"taskId",
			"continuationStatus",
			"agent",
			"resolvedModel",
			"selectedEffort",
			"advisoryPolicyVersion",
			"advisoryTaskClass",
			"advisoryRecommendedRoute",
			"advisoryClassification",
			"advisoryTopologyMismatch",
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
			...ORCHESTRATION_TELEMETRY_KEYS,
		])
	)
		return undefined;
	const runId = metadataString(worker.runId);
	const agent = metadataString(worker.agent);
	const workerStatus = status(worker.status);
	if (!runId || !agent || !workerStatus) return undefined;
	const treeId = metadataIdentifier(worker.treeId);
	const parentRunId = metadataIdentifier(worker.parentRunId);
	const depth = treeDepth(worker.depth);
	const role = treeRole(worker.role);
	const phase = workflowPhase(worker.workflowPhase);
	const taskKey = metadataIdentifier(worker.taskKey);
	const attempt = workflowAttempt(worker.attempt);
	const retryOrigin = metadataIdentifier(worker.retryOrigin);
	const coordinatorTaskId = metadataIdentifier(worker.coordinatorTaskId);
	const taskId = metadataString(worker.taskId);
	const continuationStatus =
		worker.continuationStatus === "fresh" || worker.continuationStatus === "continued"
			? worker.continuationStatus
			: undefined;
	const resolvedModel = metadataString(worker.resolvedModel);
	const selectedEffort = metadataString(worker.selectedEffort);
	const advisoryPolicyVersion = metadataString(worker.advisoryPolicyVersion);
	const advisoryTaskClass = metadataString(worker.advisoryTaskClass);
	const advisoryRecommendedRoute = metadataString(worker.advisoryRecommendedRoute);
	const advisoryClassification = metadataString(worker.advisoryClassification);
	const advisoryTopologyMismatch = typeof worker.advisoryTopologyMismatch === "boolean" ? worker.advisoryTopologyMismatch : undefined;
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
	const fields = telemetryFields(worker);
	if (!fields) return undefined;
	const result: OrchestrationWorker = {
		...fields,
		runId,
		agent,
		status: workerStatus,
	};
	if (worker.treeId !== undefined && !treeId) return undefined;
	if (worker.parentRunId !== undefined && !parentRunId) return undefined;
	if (worker.depth !== undefined && depth === undefined) return undefined;
	if (worker.role !== undefined && !role) return undefined;
	if (worker.workflowPhase !== undefined && !phase) return undefined;
	if (worker.taskKey !== undefined && !taskKey) return undefined;
	if (worker.attempt !== undefined && attempt === undefined) return undefined;
	if (worker.retryOrigin !== undefined && !retryOrigin) return undefined;
	if (worker.coordinatorTaskId !== undefined && !coordinatorTaskId)
		return undefined;
	if (worker.taskId !== undefined && !taskId) return undefined;
	if (worker.continuationStatus !== undefined && continuationStatus === undefined)
		return undefined;
	if (worker.resolvedModel !== undefined && !resolvedModel) return undefined;
	if (worker.selectedEffort !== undefined && !selectedEffort) return undefined;
	if (worker.advisoryPolicyVersion !== undefined && !advisoryPolicyVersion) return undefined;
	if (worker.advisoryTaskClass !== undefined && !advisoryTaskClass) return undefined;
	if (worker.advisoryRecommendedRoute !== undefined && !advisoryRecommendedRoute) return undefined;
	if (worker.advisoryClassification !== undefined && !advisoryClassification) return undefined;
	if (worker.advisoryTopologyMismatch !== undefined && advisoryTopologyMismatch === undefined) return undefined;
	if (worker.experimentId !== undefined && !experimentId) return undefined;
	if (worker.experimentArm !== undefined && !experimentArm) return undefined;
	if (worker.experimentTaskClass !== undefined && !experimentTaskClass)
		return undefined;
	if (worker.validationOutcome !== undefined && !validationOutcome)
		return undefined;
	if (worker.outputMode !== undefined && !workerOutputMode) return undefined;
	if (worker.usage !== undefined && !usage) return undefined;
	if (treeId) result.treeId = treeId;
	if (parentRunId) result.parentRunId = parentRunId;
	if (depth !== undefined) result.depth = depth;
	if (role) result.role = role;
	if (phase) result.workflowPhase = phase;
	if (taskKey) result.taskKey = taskKey;
	if (attempt !== undefined) result.attempt = attempt;
	if (retryOrigin) result.retryOrigin = retryOrigin;
	if (coordinatorTaskId) result.coordinatorTaskId = coordinatorTaskId;
	if (taskId) result.taskId = taskId;
	if (continuationStatus) result.continuationStatus = continuationStatus;
	if (resolvedModel) result.resolvedModel = resolvedModel;
	if (selectedEffort) result.selectedEffort = selectedEffort;
	if (advisoryPolicyVersion) result.advisoryPolicyVersion = advisoryPolicyVersion;
	if (advisoryTaskClass) result.advisoryTaskClass = advisoryTaskClass;
	if (advisoryRecommendedRoute) result.advisoryRecommendedRoute = advisoryRecommendedRoute;
	if (advisoryClassification) result.advisoryClassification = advisoryClassification;
	if (advisoryTopologyMismatch !== undefined) result.advisoryTopologyMismatch = advisoryTopologyMismatch;
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
			"correlation",
			...ORCHESTRATION_TELEMETRY_KEYS,
		])
	)
		return null;
	const telemetry = telemetryFields(raw);
	if (!telemetry) return null;
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
		schemaVersion: ORCHESTRATION_TELEMETRY_SCHEMA_VERSION,
		...telemetry,
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
	const correlation = eventCorrelation({
		...input,
		...(session ? { session } : {}),
		orchestrationId,
	});
	return {
		event: "orchestration_run",
		...(session ? { session } : {}),
		...(correlation ? { correlation } : {}),
		data,
	};
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
			"correlation",
			...ORCHESTRATION_TELEMETRY_KEYS,
		])
	)
		return null;
	const telemetry = telemetryFields(raw);
	if (!telemetry) return null;
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
		schemaVersion: ORCHESTRATION_TELEMETRY_SCHEMA_VERSION,
		...telemetry,
		interactionId,
		orchestrationIds: orchestrationIds as string[],
		parentUsageByModel: parentUsageByModel as ParentUsageByModel[],
		direct: input.direct,
	};
	const durationMs = nonnegative(input.durationMs);
	if (durationMs !== undefined) data.durationMs = durationMs;
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	const correlation = eventCorrelation({
		...input,
		...(session ? { session } : {}),
		interactionId,
	});
	return {
		event: "orchestration_interaction",
		...(session ? { session } : {}),
		...(correlation ? { correlation } : {}),
		data,
	};
}

const INTERVENTION_NUMERIC_KEYS = [
	"durationMs",
	"activeToolDurationMs",
	"activeToolOutputAgeMs",
	"activityVersion",
	"markerCount",
	"boundaryCount",
	"searchCount",
	"watchdogCount",
	"pingCount",
	"interruptionCount",
	"recoveryCount",
] as const;

/** Builds the sparse, content-free intervention event. */
export function buildSubagentInterventionEvent(
	input: BuildSubagentInterventionInput,
): SubagentInterventionEventInput | null {
	const raw = input as unknown as Record<string, unknown>;
	if (
		!hasOnlyKeys(raw, [
			"orchestrationId",
			"runId",
			"code",
			"outcome",
			"acknowledged",
			...INTERVENTION_NUMERIC_KEYS,
			"session",
			"correlation",
		])
	)
		return null;
	const orchestrationId = metadataIdentifier(input.orchestrationId);
	const runId = metadataIdentifier(input.runId);
	const code =
		typeof input.code === "string" && INTERVENTION_CODES.has(input.code)
			? (input.code as OrchestrationInterventionCode)
			: undefined;
	const outcome =
		typeof input.outcome === "string" && INTERVENTION_OUTCOMES.has(input.outcome)
			? (input.outcome as OrchestrationInterventionOutcome)
			: undefined;
	if (
		!orchestrationId ||
		!runId ||
		!code ||
		!outcome ||
		typeof input.acknowledged !== "boolean"
	)
		return null;
	const data: MetricsData<SubagentInterventionData> = {
		schemaVersion: 1,
		orchestrationId,
		runId,
		code,
		outcome,
		acknowledged: input.acknowledged,
	};
	for (const key of INTERVENTION_NUMERIC_KEYS) {
		const value =
			key === "activityVersion" || key.endsWith("Count")
				? boundedCount(input[key])
				: boundedInterventionNumber(input[key]);
		if (input[key] !== undefined && value === undefined) return null;
		if (value !== undefined) data[key] = value;
	}
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	const correlation = eventCorrelation({
		...input,
		...(session ? { session } : {}),
		orchestrationId,
		runId,
	});
	return {
		event: "subagent_intervention",
		...(session ? { session } : {}),
		...(correlation ? { correlation } : {}),
		data,
	};
}

/** Assigns the opt-in read-only fan-out experiment deterministically. */
export function assignReadOnlyFanoutExperiment(
	sampleKey: string,
	independentWorkItems: number,
): ReadOnlyFanoutAssignment | undefined {
	if (
		!sampleKey.trim() ||
		!Number.isInteger(independentWorkItems) ||
		independentWorkItems < 2 ||
		independentWorkItems > MAX_READ_ONLY_FANOUT_ITEMS
	)
		return undefined;
	const digest = createHash("sha256")
		.update(`${READ_ONLY_FANOUT_EXPERIMENT_ID}:${sampleKey}`)
		.digest();
	return {
		experimentId: READ_ONLY_FANOUT_EXPERIMENT_ID,
		experimentVersion: READ_ONLY_FANOUT_EXPERIMENT_VERSION,
		assignmentId: `fanout-${digest.subarray(1, 9).toString("hex")}`,
		taskClass: READ_ONLY_FANOUT_TASK_CLASS,
		riskClass: READ_ONLY_FANOUT_RISK_CLASS,
		independentWorkItems,
		arm:
			digest[0] % 2 === 0
				? "single-generalist"
				: "parallel-specialists",
		assignmentMethod: "deterministic-hash",
	};
}

/** Builds the assignment event emitted before an experimental run starts. */
export function buildOrchestrationExperimentAssignmentEvent(
	input: BuildOrchestrationExperimentAssignmentInput,
): OrchestrationExperimentEventInput | null {
	const raw = input as unknown as Record<string, unknown>;
	if (
		!hasOnlyKeys(raw, [
			"experimentId",
			"experimentVersion",
			"assignmentId",
			"taskClass",
			"riskClass",
			"independentWorkItems",
			"arm",
			"assignmentMethod",
			"orchestrationId",
			"interactionId",
			"session",
			"correlation",
		])
	)
		return null;
	const assignmentId = metadataString(input.assignmentId);
	const orchestrationId = metadataString(input.orchestrationId);
	const interactionId = metadataString(input.interactionId);
	if (
		input.experimentId !== READ_ONLY_FANOUT_EXPERIMENT_ID ||
		input.experimentVersion !== READ_ONLY_FANOUT_EXPERIMENT_VERSION ||
		input.taskClass !== READ_ONLY_FANOUT_TASK_CLASS ||
		input.riskClass !== READ_ONLY_FANOUT_RISK_CLASS ||
		input.assignmentMethod !== "deterministic-hash" ||
		(input.arm !== "single-generalist" &&
			input.arm !== "parallel-specialists") ||
		!Number.isInteger(input.independentWorkItems) ||
		input.independentWorkItems < 2 ||
		input.independentWorkItems > MAX_READ_ONLY_FANOUT_ITEMS ||
		!assignmentId ||
		!orchestrationId ||
		(input.interactionId !== undefined && !interactionId)
	)
		return null;
	const data: MetricsData<OrchestrationExperimentAssignmentData> = {
		schemaVersion: 1,
		experimentId: input.experimentId,
		experimentVersion: input.experimentVersion,
		assignmentId,
		taskClass: input.taskClass,
		riskClass: input.riskClass,
		independentWorkItems: input.independentWorkItems,
		arm: input.arm,
		assignmentMethod: input.assignmentMethod,
		orchestrationId,
		...(interactionId ? { interactionId } : {}),
	};
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	const correlation = eventCorrelation({
		...input,
		...(session ? { session } : {}),
		orchestrationId,
		interactionId,
	});
	return {
		event: "orchestration_experiment_assignment",
		...(session ? { session } : {}),
		...(correlation ? { correlation } : {}),
		data,
	};
}

/** Builds the structural validation outcome for an experimental run. */
export function buildOrchestrationExperimentOutcomeEvent(
	input: BuildOrchestrationExperimentOutcomeInput,
): OrchestrationExperimentEventInput | null {
	const raw = input as unknown as Record<string, unknown>;
	if (
		!hasOnlyKeys(raw, [
			"experimentId",
			"experimentVersion",
			"assignmentId",
			"orchestrationId",
			"validationKind",
			"validationOutcome",
			"checksTotal",
			"checksPassed",
			"session",
			"correlation",
		])
	)
		return null;
	const assignmentId = metadataString(input.assignmentId);
	const orchestrationId = metadataString(input.orchestrationId);
	if (
		input.experimentId !== READ_ONLY_FANOUT_EXPERIMENT_ID ||
		input.experimentVersion !== READ_ONLY_FANOUT_EXPERIMENT_VERSION ||
		input.validationKind !== "output-schema" ||
		(input.validationOutcome !== "passed" &&
			input.validationOutcome !== "failed" &&
			input.validationOutcome !== "not_run") ||
		!Number.isInteger(input.checksTotal) ||
		input.checksTotal < 0 ||
		!Number.isInteger(input.checksPassed) ||
		input.checksPassed < 0 ||
		input.checksPassed > input.checksTotal ||
		!assignmentId ||
		!orchestrationId
	)
		return null;
	const data: MetricsData<OrchestrationExperimentOutcomeData> = {
		schemaVersion: 1,
		experimentId: input.experimentId,
		experimentVersion: input.experimentVersion,
		assignmentId,
		orchestrationId,
		validationKind: input.validationKind,
		validationOutcome: input.validationOutcome,
		checksTotal: input.checksTotal,
		checksPassed: input.checksPassed,
	};
	const session = metadataString(input.session);
	if (input.session !== undefined && !session) return null;
	const correlation = eventCorrelation({
		...input,
		...(session ? { session } : {}),
		orchestrationId,
	});
	return {
		event: "orchestration_experiment_outcome",
		...(session ? { session } : {}),
		...(correlation ? { correlation } : {}),
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
	if (
		!data ||
		(data.schemaVersion !== 1 &&
			data.schemaVersion !== 2 &&
			data.schemaVersion !== ORCHESTRATION_TELEMETRY_SCHEMA_VERSION)
	)
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
