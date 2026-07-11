import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const FRICTION_SCHEMA_VERSION = 1;
export const REVIEW_MIN_DURATION_MS = 2 * 60 * 1000;
export const REVIEW_ALL_DURATION_MS = 10 * 60 * 1000;
export const REVIEW_SAMPLE_PERCENT = 15;
export const REVIEW_LOOKBACK_DAYS = 15;

const SUBMISSION_MAX_AGE_MS = 60_000;
const VALIDATION_PATTERN =
	/\b(?:biome|check|lint|pytest|ruff|shellcheck|test|tsc|typecheck|vitest)\b/i;
const FAILURE_PATTERN =
	/\b(?:command exited with code [1-9]\d*|elifecycle|failed|non-zero exit|timed out|traceback)\b/i;
const FRUSTRATION_PATTERN =
	/\b(?:bullshit|crap|damn|fuck(?:ed|ing)?|shit|wtf|not what i asked|over[- ]?designed|over[- ]?engineer(?:ed|ing)?|over[- ]?test(?:ed|ing)?|spinning (?:your|our) wheels|taking too long)\b/i;

export type WorkflowMode = "explore" | "engineer" | "unknown";
export type ReviewClassification =
	| "productive"
	| "mixed"
	| "churn"
	| "uncertain";

export interface SubmissionHint {
	text: string;
	mode: WorkflowMode;
	submittedAt: number;
}

export interface ToolTrace {
	toolName: string;
	argsText: string;
	resultText: string;
	isError: boolean;
	mutationGeneration: number;
}

export interface InteractionPacket {
	schemaVersion: number;
	interactionId: string;
	sessionId: string;
	mode: WorkflowMode;
	startedAt: string;
	settledAt: string;
	durationMs: number;
	subagentRunId?: string;
	subagentStartedAt?: string;
	selectionReasons: string[];
	userText: string;
	assistantTurns: string[];
	assistantText: string;
	tools: ToolTrace[];
	captureNote?: string;
}

export interface InteractionMetadataRecord {
	schemaVersion: number;
	interactionId: string;
	sessionId: string;
	mode: WorkflowMode;
	startedAt: string;
	settledAt: string;
	durationMs: number;
	subagentRunId?: string;
	subagentStartedAt?: string;
	selected: boolean;
	selectionReasons: string[];
	toolCount: number;
	toolFailureCount: number;
	validationCount: number;
	subagentCount: number;
	failedSubagentCount: number;
	fileMutationCount: number;
}

export interface InteractionMetadataSummary {
	total: number;
	selected: number;
	duration: { under2m: number; from2To10m: number; over10m: number };
	mode: Record<WorkflowMode, number>;
	selectionReasons: Record<string, number>;
	toolFailures: number;
	validationRuns: number;
	subagentRuns: number;
	failedSubagentRuns: number;
	fileMutations: number;
	medianDurationMs: number;
	p95DurationMs: number;
}

export interface ReviewResult {
	classification: ReviewClassification;
	confidence: number;
	summary: string;
	evidence: string[];
	reusableInstruction: {
		likely: "yes" | "no" | "uncertain";
		reason: string;
		targetSkill?: string;
	};
	suggestedChange?: string;
}

export interface StoredReviewRecord {
	schemaVersion: number;
	interactionId: string;
	sessionId: string;
	reviewedAt: string;
	startedAt: string;
	durationMs: number;
	subagentRunId?: string;
	subagentStartedAt?: string;
	mode: WorkflowMode;
	selectionReasons: string[];
	captureNote?: string;
	status: "completed" | "failed";
	review?: ReviewResult;
	error?: string;
}

let pendingSubmission: SubmissionHint | null = null;

export interface ParentAssistantUsage {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
	cost?: { total?: number };
}

export interface OrchestrationInteractionLifecycle {
	interactionId: string;
	sessionId: string;
	orchestrationIds: string[];
	parentUsageByModel: Array<{
		provider: string;
		model: string;
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens: number;
		cacheWriteTokens: number;
		contextPeakTokens: number;
		costUsd: number | null;
		costSource: "pi-usage" | "unavailable";
	}>;
}

interface ActiveOrchestrationInteraction {
	interactionId: string;
	sessionId: string;
	orchestrationIds: string[];
	parentUsageByModel: Map<
		string,
		{
			provider: string;
			model: string;
			inputTokens: number;
			outputTokens: number;
			cacheReadTokens: number;
			cacheWriteTokens: number;
			contextPeakTokens: number;
			costUsd: number;
			costKnown: boolean;
		}
	>;
}

const ORCHESTRATION_INTERACTION_STATE = Symbol.for(
	"pi.workflow-friction.orchestration-interaction.v1",
);

interface OrchestrationInteractionState {
	active: ActiveOrchestrationInteraction | null;
}

function orchestrationInteractionState(): OrchestrationInteractionState {
	const host = globalThis as typeof globalThis & {
		[ORCHESTRATION_INTERACTION_STATE]?: OrchestrationInteractionState;
	};
	const existing = host[ORCHESTRATION_INTERACTION_STATE];
	if (existing) return existing;
	const state: OrchestrationInteractionState = { active: null };
	host[ORCHESTRATION_INTERACTION_STATE] = state;
	return state;
}

function nonnegativeUsage(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 0;
}

export function workflowFrictionStorageRoot(): string {
	const override = process.env.PI_WORKFLOW_FRICTION_DIR;
	return override && override.length > 0
		? override
		: path.join(getAgentDir(), "workflow-friction");
}

export function activateOrchestrationInteraction(input: {
	interactionId: string;
	sessionId: string;
}): void {
	orchestrationInteractionState().active = {
		interactionId: input.interactionId,
		sessionId: input.sessionId,
		orchestrationIds: [],
		parentUsageByModel: new Map(),
	};
}

export function registerOrchestrationInvocation(
	orchestrationId: string,
): string | undefined {
	const active = orchestrationInteractionState().active;
	if (
		!active ||
		!orchestrationId ||
		active.orchestrationIds.includes(orchestrationId) ||
		active.orchestrationIds.length >= 64
	)
		return undefined;
	active.orchestrationIds.push(orchestrationId);
	return active.interactionId;
}

export function noteParentAssistantUsage(input: {
	provider: string;
	model: string;
	usage: ParentAssistantUsage | undefined;
}): void {
	const active = orchestrationInteractionState().active;
	if (!active || !input.usage || !input.provider || !input.model) return;
	const key = `${input.provider}\u0000${input.model}`;
	const existing = active.parentUsageByModel.get(key);
	if (!existing && active.parentUsageByModel.size >= 8) return;
	const current = existing ?? {
		provider: input.provider,
		model: input.model,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		contextPeakTokens: 0,
		costUsd: 0,
		costKnown: false,
	};
	current.inputTokens += nonnegativeUsage(input.usage.input);
	current.outputTokens += nonnegativeUsage(input.usage.output);
	current.cacheReadTokens += nonnegativeUsage(input.usage.cacheRead);
	current.cacheWriteTokens += nonnegativeUsage(input.usage.cacheWrite);
	current.contextPeakTokens = Math.max(
		current.contextPeakTokens,
		nonnegativeUsage(input.usage.totalTokens),
	);
	if (
		typeof input.usage.cost?.total === "number" &&
		Number.isFinite(input.usage.cost.total) &&
		input.usage.cost.total >= 0
	) {
		current.costUsd += input.usage.cost.total;
		current.costKnown = true;
	}
	active.parentUsageByModel.set(key, current);
}

export function settleOrchestrationInteraction(
	interactionId: string,
): OrchestrationInteractionLifecycle | null {
	const state = orchestrationInteractionState();
	const active = state.active;
	if (!active || active.interactionId !== interactionId) return null;
	state.active = null;
	return {
		interactionId: active.interactionId,
		sessionId: active.sessionId,
		orchestrationIds: [...active.orchestrationIds],
		parentUsageByModel: [...active.parentUsageByModel.values()].map(
			(usage) => ({
				provider: usage.provider,
				model: usage.model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				cacheReadTokens: usage.cacheReadTokens,
				cacheWriteTokens: usage.cacheWriteTokens,
				contextPeakTokens: usage.contextPeakTokens,
				costUsd: usage.costKnown ? usage.costUsd : null,
				costSource: usage.costKnown ? "pi-usage" : "unavailable",
			}),
		),
	};
}

export function resetOrchestrationInteraction(sessionId?: string): void {
	const state = orchestrationInteractionState();
	if (state.active && (!sessionId || state.active.sessionId === sessionId))
		state.active = null;
}

export function noteWorkflowSubmission(
	text: string,
	mode: WorkflowMode,
	submittedAt = Date.now(),
): void {
	pendingSubmission = { text, mode, submittedAt };
}

export function consumeWorkflowSubmission(
	now = Date.now(),
): SubmissionHint | null {
	const hint = pendingSubmission;
	pendingSubmission = null;
	if (!hint || now - hint.submittedAt > SUBMISSION_MAX_AGE_MS) return null;
	return hint;
}

export function createInteractionId(): string {
	return `interaction-${randomUUID()}`;
}

export function reviewSampleBucket(value: string): number {
	const prefix = createHash("sha256").update(value).digest("hex").slice(0, 8);
	return Number.parseInt(prefix, 16) % 100;
}

export function isControlSample(
	interactionId: string,
	percent = REVIEW_SAMPLE_PERCENT,
): boolean {
	return reviewSampleBucket(interactionId) < percent;
}

function normalizedCommand(trace: ToolTrace): string | null {
	if (trace.toolName !== "bash" && trace.toolName !== "pwsh") return null;
	try {
		const parsed = JSON.parse(trace.argsText) as Record<string, unknown>;
		if (typeof parsed.command === "string")
			return parsed.command.trim().replace(/\s+/g, " ").toLowerCase();
	} catch {
		// A bounded non-JSON argument summary cannot support command matching.
	}
	return null;
}

function traceFailed(trace: ToolTrace): boolean {
	return trace.isError || FAILURE_PATTERN.test(trace.resultText);
}

function isTaskExecutionTrace(trace: ToolTrace): boolean {
	if (trace.toolName !== "task") return false;
	try {
		const args = JSON.parse(trace.argsText) as Record<string, unknown>;
		return args.action === "execute";
	} catch {
		return false;
	}
}

export function interactionMetadataFromPacket(
	packet: InteractionPacket,
): InteractionMetadataRecord {
	let toolFailureCount = 0;
	let validationCount = 0;
	let subagentCount = 0;
	let failedSubagentCount = 0;
	let fileMutationCount = 0;
	for (const trace of packet.tools) {
		const failed = traceFailed(trace);
		if (failed) toolFailureCount += 1;
		const command = normalizedCommand(trace);
		if (command && VALIDATION_PATTERN.test(command)) validationCount += 1;
		if (trace.toolName === "subagent" || isTaskExecutionTrace(trace)) {
			subagentCount += 1;
			if (failed) failedSubagentCount += 1;
		}
		if (
			!failed &&
			(trace.toolName === "edit" ||
				trace.toolName === "write" ||
				trace.toolName === "text_edit" ||
				trace.toolName === "structured_edit")
		)
			fileMutationCount += 1;
	}
	return {
		schemaVersion: FRICTION_SCHEMA_VERSION,
		interactionId: packet.interactionId,
		sessionId: packet.sessionId,
		mode: packet.mode,
		startedAt: packet.startedAt,
		settledAt: packet.settledAt,
		durationMs: packet.durationMs,
		subagentRunId: packet.subagentRunId,
		subagentStartedAt: packet.subagentStartedAt,
		selected: packet.selectionReasons.length > 0,
		selectionReasons: packet.selectionReasons,
		toolCount: packet.tools.length,
		toolFailureCount,
		validationCount,
		subagentCount,
		failedSubagentCount,
		fileMutationCount,
	};
}

function percentile(values: number[], fraction: number): number {
	if (values.length === 0) return 0;
	const index = Math.min(
		values.length - 1,
		Math.max(0, Math.ceil(values.length * fraction) - 1),
	);
	return values[index];
}

export function summarizeInteractionMetadata(
	records: readonly InteractionMetadataRecord[],
	extraSelectedIds: ReadonlySet<string> = new Set(),
): InteractionMetadataSummary {
	const summary: InteractionMetadataSummary = {
		total: records.length,
		selected: 0,
		duration: { under2m: 0, from2To10m: 0, over10m: 0 },
		mode: { explore: 0, engineer: 0, unknown: 0 },
		selectionReasons: {},
		toolFailures: 0,
		validationRuns: 0,
		subagentRuns: 0,
		failedSubagentRuns: 0,
		fileMutations: 0,
		medianDurationMs: 0,
		p95DurationMs: 0,
	};
	const durations: number[] = [];
	for (const record of records) {
		const selected =
			record.selected || extraSelectedIds.has(record.interactionId);
		if (selected) summary.selected += 1;
		if (record.durationMs < REVIEW_MIN_DURATION_MS)
			summary.duration.under2m += 1;
		else if (record.durationMs <= REVIEW_ALL_DURATION_MS)
			summary.duration.from2To10m += 1;
		else summary.duration.over10m += 1;
		summary.mode[record.mode] += 1;
		for (const reason of record.selectionReasons)
			summary.selectionReasons[reason] =
				(summary.selectionReasons[reason] ?? 0) + 1;
		summary.toolFailures += record.toolFailureCount;
		summary.validationRuns += record.validationCount;
		summary.subagentRuns += record.subagentCount;
		summary.failedSubagentRuns += record.failedSubagentCount;
		summary.fileMutations += record.fileMutationCount;
		durations.push(record.durationMs);
	}
	durations.sort((a, b) => a - b);
	summary.medianDurationMs = percentile(durations, 0.5);
	summary.p95DurationMs = percentile(durations, 0.95);
	return summary;
}

export function detectFrictionTriggers(
	userText: string,
	tools: readonly ToolTrace[],
): string[] {
	const reasons = new Set<string>();
	if (FRUSTRATION_PATTERN.test(userText)) reasons.add("user_frustration");

	const failedCommands = new Map<string, number>();
	const validationCommands = new Map<string, number>();
	const failedTools = new Map<string, number>();
	let failedSubagents = 0;

	for (const trace of tools) {
		const failed = traceFailed(trace);
		if (failed) {
			failedTools.set(
				trace.toolName,
				(failedTools.get(trace.toolName) ?? 0) + 1,
			);
			if (trace.toolName === "subagent" || isTaskExecutionTrace(trace))
				failedSubagents += 1;
		}

		const command = normalizedCommand(trace);
		if (!command) continue;
		const key = `${trace.mutationGeneration}:${command}`;
		if (failed) failedCommands.set(key, (failedCommands.get(key) ?? 0) + 1);
		if (VALIDATION_PATTERN.test(command))
			validationCommands.set(key, (validationCommands.get(key) ?? 0) + 1);
	}

	if ([...failedCommands.values()].some((count) => count >= 2))
		reasons.add("repeated_failed_command");
	if ([...validationCommands.values()].some((count) => count >= 2))
		reasons.add("repeated_validation_without_edit");
	if ([...failedTools.values()].some((count) => count >= 2))
		reasons.add("repeated_tool_failure");
	if (failedSubagents >= 2) reasons.add("multiple_failed_subagents");

	return [...reasons].sort();
}

export function selectInteractionForReview(input: {
	interactionId: string;
	durationMs: number;
	triggers: readonly string[];
	manual?: boolean;
}): string[] {
	const reasons = new Set<string>();
	if (input.manual) reasons.add("manual_capture");

	if (input.durationMs > REVIEW_ALL_DURATION_MS) {
		reasons.add("duration_over_10m");
		for (const trigger of input.triggers) reasons.add(trigger);
		return [...reasons].sort();
	}

	if (
		input.durationMs >= REVIEW_MIN_DURATION_MS &&
		input.durationMs <= REVIEW_ALL_DURATION_MS
	) {
		if (input.triggers.length > 0) {
			for (const trigger of input.triggers) reasons.add(trigger);
		} else if (isControlSample(input.interactionId)) {
			reasons.add("random_control_15pct");
		}
	}

	return [...reasons].sort();
}

function trimText(value: unknown, max: number): string {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function unwrapJson(raw: string): string {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fenced?.[1] ?? trimmed;
}

export function parseReviewResult(raw: string): ReviewResult | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(unwrapJson(raw));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		return null;
	const value = parsed as Record<string, unknown>;
	if (
		value.classification !== "productive" &&
		value.classification !== "mixed" &&
		value.classification !== "churn" &&
		value.classification !== "uncertain"
	)
		return null;
	if (
		typeof value.confidence !== "number" ||
		!Number.isFinite(value.confidence) ||
		value.confidence < 0 ||
		value.confidence > 1
	)
		return null;
	if (
		!value.reusableInstruction ||
		typeof value.reusableInstruction !== "object"
	)
		return null;
	const reusable = value.reusableInstruction as Record<string, unknown>;
	if (
		reusable.likely !== "yes" &&
		reusable.likely !== "no" &&
		reusable.likely !== "uncertain"
	)
		return null;
	if (!Array.isArray(value.evidence)) return null;

	return {
		classification: value.classification,
		confidence: value.confidence,
		summary: trimText(value.summary, 600),
		evidence: value.evidence
			.filter((item): item is string => typeof item === "string")
			.slice(0, 5)
			.map((item) => item.trim().slice(0, 500)),
		reusableInstruction: {
			likely: reusable.likely,
			reason: trimText(reusable.reason, 500),
			targetSkill: trimText(reusable.targetSkill, 120) || undefined,
		},
		suggestedChange: trimText(value.suggestedChange, 600) || undefined,
	};
}

export function buildReviewPrompt(packet: InteractionPacket): string {
	return `Review one Pi interaction for workflow friction.

Return JSON only with this exact shape:
{"classification":"productive|mixed|churn|uncertain","confidence":0.0,"summary":"brief assessment","evidence":["specific bounded evidence"],"reusableInstruction":{"likely":"yes|no|uncertain","reason":"whether clearer reusable instructions would have prevented repeated failures","targetSkill":"optional existing skill or gap"},"suggestedChange":"optional smallest evidence-backed improvement"}

Rules:
- Judge progress, not raw activity volume.
- Distinguish productive debugging from repeated work that produced no new evidence.
- Check for premature or repeated validation, failure isolation before retry, delegation overhead, scope drift, unnecessary complexity, and whether the requested outcome was reached.
- When tools or helper scripts failed repeatedly, decide whether clearer reusable instructions probably would have prevented it. Do not force a skill recommendation when the problem is a tool, runtime, dependency, or task-specific defect.
- Do not quote credentials, tokens, private values, or long source content.
- Use at most five short evidence items.
- Omit suggestedChange unless the evidence supports one small change.

Interaction:
${JSON.stringify(packet)}`;
}

export function buildWorkflowReviewPrompt(
	records: readonly StoredReviewRecord[],
	experiments: readonly Record<string, unknown>[],
	interactionSummary: InteractionMetadataSummary,
): string {
	return `Analyze stored Pi workflow-friction reviews from the previous ${REVIEW_LOOKBACK_DAYS} days.

Present no more than three concise finding headlines. Present only one when only one is meaningful. For each headline include the occurrence count, representative session IDs, likely impact, and confidence. Distinguish observed records from reviewer interpretation. Recommend exactly one issue to discuss first.

Use this interaction pattern for the recommended issue:
1. State the problem.
2. State the goal.
3. Offer a small numbered set of concrete options.
4. Give one recommendation.
5. Wait for the user to choose and add context.

Do not edit files or apply changes. Avoid a wall of text. Do not pad the output. If source context is insufficient, inspect the referenced session ID before making a strong claim. If the user later approves and the change is applied, record an experiment marker with the workflow_friction_mark_change tool.

Interaction metadata summary (includes reviewed and unreviewed interactions):
${JSON.stringify(interactionSummary)}

Review records:
${JSON.stringify(records)}

Prior experiment markers:
${JSON.stringify(experiments)}`;
}
