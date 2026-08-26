import { onSessionStart } from "../lib/session-start-metrics.js";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { recordEvent } from "../lib/metrics.js";
import { buildOrchestrationInteractionEvent } from "../lib/orchestration-telemetry.js";
import { sanitizeTaskValue } from "../lib/task-security.js";
import { defineAgent, type TypedAgentRunContext } from "../lib/typed-agent.js";
import {
	activateOrchestrationInteraction,
	buildReviewPrompt,
	correlationFieldsForPacket,
	consumeWorkflowSubmission,
	createInteractionId,
	detectFrictionTriggers,
	FRICTION_SCHEMA_VERSION,
	type InteractionMetadataRecord,
	type InteractionPacket,
	interactionMetadataFromPacket,
	noteParentAssistantUsage,
	noteWorkflowSubmission,
	REVIEW_LOOKBACK_DAYS,
	REVIEW_MIN_DURATION_MS,
	type ReviewResult,
	resetOrchestrationInteraction,
	type StoredReviewRecord,
	selectInteractionForReview,
	settleOrchestrationInteraction,
	summarizeInteractionMetadata,
	type ToolTrace,
	type WorkflowMode,
	workflowCorrelationFields,
	workflowFrictionStorageRoot,
} from "../lib/workflow-friction.js";

const REVIEW_TIMEOUT_MS = 120_000;
const MAX_USER_TEXT = 16_000;
const MAX_ASSISTANT_TURN = 8_000;
const MAX_ASSISTANT_TURNS = 12;
const MAX_TOOL_TRACES = 64;
const MAX_TOOL_ARGS = 1_000;
const MAX_TOOL_RESULT = 2_000;
const REVIEW_MODEL_PROVIDER = "openai-codex";
const REVIEW_MODEL_ID = "gpt-5.6-terra";

const WorkflowReviewInputSchema = Type.Object(
	{
		packet: Type.Object(
			{
				schemaVersion: Type.Number(),
				interactionId: Type.String(),
				sessionId: Type.String(),
				mode: Type.Union([
					Type.Literal("explore"),
					Type.Literal("engineer"),
					Type.Literal("unknown"),
				]),
				startedAt: Type.String(),
				settledAt: Type.String(),
				durationMs: Type.Number({ minimum: 0 }),
				subagentRunId: Type.Optional(Type.String()),
				subagentStartedAt: Type.Optional(Type.String()),
				selectionReasons: Type.Array(Type.String()),
				userText: Type.String({ maxLength: MAX_USER_TEXT }),
				assistantTurns: Type.Array(
					Type.String({ maxLength: MAX_ASSISTANT_TURN }),
					{
						maxItems: MAX_ASSISTANT_TURNS,
					},
				),
				assistantText: Type.String({ maxLength: MAX_ASSISTANT_TURN }),
				tools: Type.Array(
					Type.Object(
						{
							toolName: Type.String(),
							argsText: Type.String({ maxLength: MAX_TOOL_ARGS }),
							resultText: Type.String({ maxLength: MAX_TOOL_RESULT }),
							isError: Type.Boolean(),
							mutationGeneration: Type.Number({ minimum: 0 }),
						},
						{ additionalProperties: false },
					),
					{ maxItems: MAX_TOOL_TRACES },
				),
				captureNote: Type.Optional(Type.String({ maxLength: 1_000 })),
				repoRoot: Type.Optional(Type.String()),
				runtime_instance_id: Type.Optional(Type.String()),
				session_id: Type.Optional(Type.String()),
				turn_id: Type.Optional(Type.String()),
				trace_id: Type.Optional(Type.String()),
				interaction_id: Type.Optional(Type.String()),
				workflow_episode_id: Type.Optional(Type.String()),
				orchestration_id: Type.Optional(Type.String()),
				run_id: Type.Optional(Type.String()),
				task_id: Type.Optional(Type.String()),
				goal_id: Type.Optional(Type.String()),
				tool_call_id: Type.Optional(Type.String()),
				operation_id: Type.Optional(Type.String()),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const WorkflowReviewOutputSchema = Type.Object(
	{
		classification: Type.Union([
			Type.Literal("productive"),
			Type.Literal("mixed"),
			Type.Literal("churn"),
			Type.Literal("uncertain"),
		]),
		confidence: Type.Number({ minimum: 0, maximum: 1 }),
		impact: Type.Optional(
			Type.Union([
				Type.Literal("safety"),
				Type.Literal("correctness"),
				Type.Literal("efficiency"),
				Type.Literal("maintainability"),
			]),
		),
		summary: Type.String({ maxLength: 600 }),
		evidence: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 5 }),
		reusableInstruction: Type.Object(
			{
				likely: Type.Union([
					Type.Literal("yes"),
					Type.Literal("no"),
					Type.Literal("uncertain"),
				]),
				reason: Type.String({ maxLength: 500 }),
				scope: Type.Optional(
					Type.Union([
						Type.Literal("user"),
						Type.Literal("project"),
						Type.Literal("path"),
						Type.Literal("skill"),
						Type.Literal("deterministic-control"),
						Type.Literal("uncertain"),
					]),
				),
				targetSkill: Type.Optional(Type.String({ maxLength: 120 })),
				target: Type.Optional(
					Type.Object(
						{
							kind: Type.Union([
								Type.Literal("skill"),
								Type.Literal("new-skill"),
								Type.Literal("command"),
								Type.Literal("extension"),
								Type.Literal("tool"),
								Type.Literal("project-instruction"),
							]),
							name: Type.String({ minLength: 1, maxLength: 120 }),
							owner: Type.Optional(Type.String({ maxLength: 120 })),
						},
						{ additionalProperties: false },
					),
				),
			},
			{ additionalProperties: false },
		),
		suggestedChange: Type.Optional(Type.String({ maxLength: 600 })),
	},
	{ additionalProperties: false },
);

const MUTATION_TOOLS = new Set([
	"edit",
	"write",
	"text_edit",
	"structured_edit",
]);

interface PendingInput {
	text: string;
	submittedAt: number;
	mode: WorkflowMode;
}

interface ActiveTool {
	toolName: string;
	argsText: string;
	mutationGeneration: number;
}

interface ActiveInteraction {
	interactionId: string;
	sessionId: string;
	repoRoot: string;
	hasPriorAssistant: boolean;
	mode: WorkflowMode;
	startedAt: number;
	startedMonotonic: number;
	subagentRunId?: string;
	subagentStartedAt?: string;
	correlation: ReturnType<typeof correlationFieldsForPacket>;
	userTexts: string[];
	assistantTexts: string[];
	tools: ToolTrace[];
	activeTools: Map<string, ActiveTool>;
	mutationGeneration: number;
}

interface ReviewJob {
	schemaVersion: number;
	queuedAt: string;
	packet: InteractionPacket;
}

interface ExperimentRecord {
	schemaVersion: number;
	experimentId: string;
	recordedAt: string;
	sessionId: string;
	pattern: string;
	treatment: string;
	surfaces: string[];
}

interface CaptureAnnotation {
	interactionId: string;
	selectionReasons: string[];
	captureNote?: string;
}

type ImprovementDecisionChoice = "apply" | "edit" | "skip";

interface ImprovementDecisionSelection {
	choice: ImprovementDecisionChoice;
	text: string;
	detail?: string;
}

interface PendingLearningDiscussion {
	candidateId: string;
	phase: "discussing" | "selected";
	selection?: ImprovementDecisionSelection;
}

export interface LearningDecisionRecord {
	schemaVersion: 1;
	candidateId: string;
	decidedAt: string;
	decision: "applied" | "skipped";
	decisionText: string;
	approvedText?: string;
	targetPaths?: string[];
	validation?: string;
	rollback?: string;
	reason?: string;
	experimentId?: string;
}

export type ImprovementCandidateStatus =
	| "active"
	| "needs_review"
	| "stale"
	| "superseded"
	| "dismissed";

export interface ImprovementCandidateStatusRecord {
	schemaVersion: 1;
	eventId: string;
	candidateId: string;
	recordedAt: string;
	status: ImprovementCandidateStatus;
	reasonCode: string;
	reason: string;
	supersededBy?: string;
}

const IMPROVEMENT_CANDIDATE_STATUSES = new Set<ImprovementCandidateStatus>([
	"active",
	"needs_review",
	"stale",
	"superseded",
	"dismissed",
]);

function storageRoot(): string {
	return workflowFrictionStorageRoot();
}

function pendingDir(): string {
	return path.join(storageRoot(), "queue", "pending");
}

function processingDir(): string {
	return path.join(storageRoot(), "queue", "processing");
}

function annotationDir(): string {
	return path.join(storageRoot(), "annotations");
}

function reviewsPath(): string {
	return path.join(storageRoot(), "reviews.jsonl");
}

function interactionsPath(): string {
	return path.join(storageRoot(), "interactions.jsonl");
}

function experimentsPath(): string {
	return path.join(storageRoot(), "experiments.jsonl");
}

export function learningDecisionsPath(): string {
	return path.join(storageRoot(), "learning-decisions.jsonl");
}

export function candidateStatusesPath(): string {
	return path.join(storageRoot(), "candidate-status.jsonl");
}

function learningDecisionLockPath(): string {
	return path.join(storageRoot(), "learning-decisions.lock");
}

function workerLockPath(): string {
	return path.join(storageRoot(), "worker.lock");
}

function jobPath(dir: string, interactionId: string): string {
	return path.join(dir, `${interactionId}.json`);
}

function annotationPath(interactionId: string): string {
	return path.join(annotationDir(), `${interactionId}.json`);
}

async function ensureStorage(): Promise<void> {
	await fsp.mkdir(pendingDir(), { recursive: true, mode: 0o700 });
	await fsp.mkdir(processingDir(), { recursive: true, mode: 0o700 });
	await fsp.mkdir(annotationDir(), { recursive: true, mode: 0o700 });
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await fsp.writeFile(tempPath, `${JSON.stringify(value)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	await fsp.rename(tempPath, filePath);
}

async function readCaptureAnnotation(
	interactionId: string,
): Promise<CaptureAnnotation | null> {
	try {
		return JSON.parse(
			await fsp.readFile(annotationPath(interactionId), "utf8"),
		) as CaptureAnnotation;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function updateCaptureAnnotation(
	packet: InteractionPacket,
): Promise<void> {
	if (
		!packet.captureNote &&
		!packet.selectionReasons.includes("manual_capture")
	)
		return;
	const existing = await readCaptureAnnotation(packet.interactionId);
	const annotation: CaptureAnnotation = sanitizeTaskValue({
		interactionId: packet.interactionId,
		selectionReasons: [
			...new Set([
				...(existing?.selectionReasons ?? []),
				...packet.selectionReasons,
			]),
		].sort(),
		captureNote: packet.captureNote ?? existing?.captureNote,
	});
	await atomicJson(annotationPath(packet.interactionId), annotation);
}

async function applyCaptureAnnotation(
	packet: InteractionPacket,
): Promise<InteractionPacket> {
	const annotation = await readCaptureAnnotation(packet.interactionId);
	if (!annotation) return packet;
	return {
		...packet,
		selectionReasons: [
			...new Set([...packet.selectionReasons, ...annotation.selectionReasons]),
		].sort(),
		captureNote: annotation.captureNote ?? packet.captureNote,
	};
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
	await fsp.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
	await fsp.appendFile(filePath, `${JSON.stringify(value)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

function bounded(value: string, max: number): string {
	if (value.length <= max) return value;
	const suffix = "\n[truncated]";
	return `${value.slice(0, max - suffix.length)}${suffix}`;
}

function stableText(value: unknown, max: number): string {
	let text: string;
	try {
		text =
			typeof value === "string"
				? value
				: (JSON.stringify(value) ?? String(value));
	} catch {
		text = String(value);
	}
	return bounded(text, max);
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const part = item as Record<string, unknown>;
			return part.type === "text" && typeof part.text === "string"
				? part.text
				: "";
		})
		.filter(Boolean)
		.join("\n");
}

function messageText(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	return contentText((message as Record<string, unknown>).content);
}

function resultText(result: unknown): string {
	if (!result || typeof result !== "object")
		return stableText(result, MAX_TOOL_RESULT);
	const record = result as Record<string, unknown>;
	return contentText(record.content) || stableText(record, MAX_TOOL_RESULT);
}

function modeForInput(text: string): WorkflowMode {
	if (/^\/(?:plan-it|do-it)\b/i.test(text.trim())) return "engineer";
	return "explore";
}

function sessionHasPriorAssistant(ctx: ExtensionContext): boolean {
	return ctx.sessionManager
		.getEntries()
		.some(
			(entry) => entry.type === "message" && entry.message.role === "assistant",
		);
}

function failedResult(isError: boolean, text: string): boolean {
	return (
		isError ||
		/\b(?:command exited with code [1-9]\d*|elifecycle|failed|non-zero exit|timed out|traceback)\b/i.test(
			text,
		)
	);
}

async function resolveWorkflowReviewModel(ctx: TypedAgentRunContext) {
	return ctx.modelRegistry
		.getAvailable()
		.find(
			(model) =>
				model.provider === REVIEW_MODEL_PROVIDER &&
				model.id === REVIEW_MODEL_ID,
		);
}

export const workflowReviewAgent = defineAgent({
	id: "workflow-friction-reviewer",
	instructions:
		"Classify one sanitized Pi interaction for workflow friction and propose at most one supported durable improvement.",
	inputSchema: WorkflowReviewInputSchema,
	outputSchema: WorkflowReviewOutputSchema,
	resolveModel: resolveWorkflowReviewModel,
	prompt: ({ packet }) => buildReviewPrompt(packet),
	timeoutMs: REVIEW_TIMEOUT_MS,
});

export type WorkflowReviewRunner = Pick<typeof workflowReviewAgent, "run">;

async function readJsonLines<T>(filePath: string): Promise<T[]> {
	let text: string;
	try {
		text = await fsp.readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const records: T[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			records.push(JSON.parse(line) as T);
		} catch {
			// A malformed historical line does not hide later valid records.
		}
	}
	return records;
}

async function reviewAlreadyRecorded(interactionId: string): Promise<boolean> {
	const records = await readJsonLines<StoredReviewRecord>(reviewsPath());
	return records.some((record) => record.interactionId === interactionId);
}

async function enqueueReview(
	packet: InteractionPacket,
): Promise<"queued" | "updated" | "already_reviewed"> {
	await ensureStorage();
	await updateCaptureAnnotation(packet);
	if (await reviewAlreadyRecorded(packet.interactionId))
		return "already_reviewed";
	const pendingPath = jobPath(pendingDir(), packet.interactionId);
	const processingPath = jobPath(processingDir(), packet.interactionId);
	try {
		await fsp.access(processingPath);
		return "updated";
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	try {
		const existing = JSON.parse(
			await fsp.readFile(pendingPath, "utf8"),
		) as ReviewJob;
		existing.packet.selectionReasons = [
			...new Set([
				...existing.packet.selectionReasons,
				...packet.selectionReasons,
			]),
		].sort();
		if (packet.captureNote) existing.packet.captureNote = packet.captureNote;
		await atomicJson(pendingPath, sanitizeTaskValue(existing));
		return "updated";
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const job: ReviewJob = {
		schemaVersion: FRICTION_SCHEMA_VERSION,
		queuedAt: new Date().toISOString(),
		packet: sanitizeTaskValue(packet),
	};
	await atomicJson(pendingPath, job);
	return "queued";
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function acquireWorkerLock(): Promise<fs.promises.FileHandle | null> {
	await ensureStorage();
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const handle = await fsp.open(workerLockPath(), "wx", 0o600);
			await handle.writeFile(`${process.pid}\n`, "utf8");
			return handle;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			let owner = 0;
			try {
				owner = Number.parseInt(
					(await fsp.readFile(workerLockPath(), "utf8")).trim(),
					10,
				);
			} catch {
				owner = 0;
			}
			if (owner > 0 && processExists(owner)) return null;
			await fsp.rm(workerLockPath(), { force: true });
		}
	}
	return null;
}

function workspaceRoot(cwd: string): string {
	let current = path.resolve(cwd);
	const root = path.parse(current).root;
	while (true) {
		if (fs.existsSync(path.join(current, ".git"))) return current;
		if (current === root) return path.resolve(cwd);
		const parent = path.dirname(current);
		if (parent === current) return path.resolve(cwd);
		current = parent;
	}
}

function normalizedWorkspace(value: string): string {
	const normalized = path
		.resolve(value)
		.replaceAll("\\", "/")
		.replace(/\/+$/, "");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function learningScope(record: StoredReviewRecord): string {
	return (
		record.review?.reusableInstruction.scope ??
		(record.review?.reusableInstruction.targetSkill ? "skill" : "uncertain")
	);
}

function isLearningCandidate(record: StoredReviewRecord): boolean {
	return Boolean(
		record.status === "completed" &&
			record.review?.reusableInstruction.likely === "yes" &&
			record.review.suggestedChange?.trim(),
	);
}

function learningCandidateVisible(
	record: StoredReviewRecord,
	cwd: string,
): boolean {
	return (
		Boolean(record.repoRoot) &&
		normalizedWorkspace(record.repoRoot ?? "") ===
			normalizedWorkspace(workspaceRoot(cwd))
	);
}

async function appendFailedReview(
	job: ReviewJob,
	error: string,
): Promise<void> {
	const packet = await applyCaptureAnnotation(job.packet);
	const record: StoredReviewRecord = {
		...correlationFieldsForPacket(packet),
		schemaVersion: FRICTION_SCHEMA_VERSION,
		interactionId: packet.interactionId,
		sessionId: packet.sessionId,
		reviewedAt: new Date().toISOString(),
		startedAt: packet.startedAt,
		durationMs: packet.durationMs,
		subagentRunId: packet.subagentRunId,
		subagentStartedAt: packet.subagentStartedAt,
		mode: packet.mode,
		selectionReasons: packet.selectionReasons,
		captureNote: packet.captureNote,
		repoRoot: packet.repoRoot,
		status: "failed",
		error: bounded(sanitizeTaskValue(error), 600),
	};
	await appendJsonLine(reviewsPath(), record);
}

async function recoverInterruptedReviews(): Promise<void> {
	const files = (await fsp.readdir(processingDir())).filter((name) =>
		name.endsWith(".json"),
	);
	for (const name of files) {
		const filePath = path.join(processingDir(), name);
		try {
			const job = JSON.parse(await fsp.readFile(filePath, "utf8")) as ReviewJob;
			if (!(await reviewAlreadyRecorded(job.packet.interactionId)))
				await appendFailedReview(job, "Background review was interrupted.");
		} finally {
			await fsp.rm(filePath, { force: true });
		}
	}
}

function normalizeWorkflowReview(review: ReviewResult): ReviewResult {
	const suggestedChange = review.suggestedChange?.trim();
	if (review.reusableInstruction.likely === "yes" && !suggestedChange)
		throw new Error(
			"Workflow review marked a reusable instruction without a suggested change.",
		);
	return {
		...review,
		summary: review.summary.trim(),
		evidence: review.evidence.map((item) => item.trim()),
		reusableInstruction: {
			...review.reusableInstruction,
			reason: review.reusableInstruction.reason.trim(),
			targetSkill: review.reusableInstruction.targetSkill?.trim() || undefined,
			target: review.reusableInstruction.target
				? {
						...review.reusableInstruction.target,
						name: review.reusableInstruction.target.name.trim(),
						owner: review.reusableInstruction.target.owner?.trim() || undefined,
					}
				: undefined,
		},
		suggestedChange: suggestedChange || undefined,
	};
}

async function executeReview(
	ctx: TypedAgentRunContext,
	job: ReviewJob,
	reviewer: WorkflowReviewRunner,
): Promise<StoredReviewRecord> {
	const packet = await applyCaptureAnnotation(job.packet);
	const result = await reviewer.run({ packet }, ctx);
	const review = normalizeWorkflowReview(result.output);
	const finalPacket = await applyCaptureAnnotation(packet);
	return sanitizeTaskValue({
		...correlationFieldsForPacket(finalPacket),
		schemaVersion: FRICTION_SCHEMA_VERSION,
		interactionId: finalPacket.interactionId,
		sessionId: finalPacket.sessionId,
		reviewedAt: new Date().toISOString(),
		startedAt: finalPacket.startedAt,
		durationMs: finalPacket.durationMs,
		subagentRunId: finalPacket.subagentRunId,
		subagentStartedAt: finalPacket.subagentStartedAt,
		mode: finalPacket.mode,
		selectionReasons: finalPacket.selectionReasons,
		captureNote: finalPacket.captureNote,
		repoRoot: finalPacket.repoRoot,
		status: "completed" as const,
		review,
	});
}

let localWorkerRunning = false;

export async function processPendingReviews(
	ctx: TypedAgentRunContext,
	reviewer: WorkflowReviewRunner = workflowReviewAgent,
): Promise<void> {
	if (localWorkerRunning) return;
	localWorkerRunning = true;
	let lock: fs.promises.FileHandle | null = null;
	try {
		lock = await acquireWorkerLock();
		if (!lock) return;
		await recoverInterruptedReviews();
		for (;;) {
			const files = (await fsp.readdir(pendingDir()))
				.filter((name) => name.endsWith(".json"))
				.sort();
			const name = files[0];
			if (!name) break;
			const pendingPath = path.join(pendingDir(), name);
			const processingPath = path.join(processingDir(), name);
			try {
				await fsp.rename(pendingPath, processingPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			let job: ReviewJob | null = null;
			try {
				job = JSON.parse(
					await fsp.readFile(processingPath, "utf8"),
				) as ReviewJob;
				if (await reviewAlreadyRecorded(job.packet.interactionId)) continue;
				const record = await executeReview(ctx, job, reviewer);
				await appendJsonLine(reviewsPath(), record);
			} catch (error) {
				if (job)
					await appendFailedReview(
						job,
						error instanceof Error ? error.message : String(error),
					);
			} finally {
				await fsp.rm(processingPath, { force: true });
			}
		}
	} finally {
		if (lock) {
			await lock.close();
			await fsp.rm(workerLockPath(), { force: true });
		}
		localWorkerRunning = false;
	}
}

function startBackgroundWorker(
	ctx: TypedAgentRunContext,
	reviewer: WorkflowReviewRunner,
): void {
	void processPendingReviews(ctx, reviewer).catch(() => {
		// Background review must not interrupt the active Pi workflow.
	});
}

function packetFromInteraction(
	active: ActiveInteraction,
	settledAt: number,
	selectionReasons: string[],
): InteractionPacket {
	return sanitizeTaskValue({
		...active.correlation,
		schemaVersion: FRICTION_SCHEMA_VERSION,
		interactionId: active.interactionId,
		sessionId: active.sessionId,
		repoRoot: active.repoRoot,
		mode: active.mode,
		startedAt: new Date(active.startedAt).toISOString(),
		settledAt: new Date(settledAt).toISOString(),
		durationMs: Math.max(
			0,
			Math.round(performance.now() - active.startedMonotonic),
		),
		subagentRunId: active.subagentRunId,
		subagentStartedAt: active.subagentStartedAt,
		selectionReasons,
		userText: bounded(active.userTexts.join("\n\n"), MAX_USER_TEXT),
		assistantTurns: active.assistantTexts.slice(-MAX_ASSISTANT_TURNS),
		assistantText: active.assistantTexts.at(-1) ?? "",
		tools: active.tools.slice(-MAX_TOOL_TRACES),
	});
}

export default function workflowFrictionExtension(
	pi: ExtensionAPI,
	options: { reviewer?: WorkflowReviewRunner } = {},
) {
	const reviewer = options.reviewer ?? workflowReviewAgent;
	let pendingInput: PendingInput | null = null;
	let active: ActiveInteraction | null = null;
	let latestCompleted: InteractionPacket | null = null;
	let currentSessionId = "unknown";

	onSessionStart(pi, import.meta.url, async (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		if (currentSessionId !== sessionId) {
			resetOrchestrationInteraction(currentSessionId);
		}
		currentSessionId = sessionId;
		startBackgroundWorker(ctx, reviewer);
	});

	pi.on("session_shutdown", async () => {
		resetOrchestrationInteraction(currentSessionId);
		active = null;
		pendingInput = null;
	});

	pi.on("input", async (event) => {
		if (event.source === "extension") return { action: "continue" as const };
		if (active) {
			active.userTexts.push(bounded(event.text, MAX_USER_TEXT));
			return { action: "continue" as const };
		}
		pendingInput = {
			text: event.text,
			submittedAt: Date.now(),
			mode: modeForInput(event.text),
		};
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		if (currentSessionId !== sessionId) {
			resetOrchestrationInteraction(currentSessionId);
			active = null;
			currentSessionId = sessionId;
		}
		if (active) return undefined;
		const now = Date.now();
		const workflowHint = consumeWorkflowSubmission(now);
		const submission = workflowHint ?? pendingInput;
		pendingInput = null;
		const subagentRunId = process.env.PI_SUBAGENT_RUN_ID?.trim() || undefined;
		const subagentStartedAt = process.env.PI_SUBAGENT_STARTED_AT?.trim();
		const parsedSubagentStart = subagentStartedAt
			? Date.parse(subagentStartedAt)
			: Number.NaN;
		const startedAt = Number.isFinite(parsedSubagentStart)
			? parsedSubagentStart
			: (submission?.submittedAt ?? now);
		const interactionId = createInteractionId();
		active = {
			interactionId,
			correlation: workflowCorrelationFields({
				interactionId,
				sessionId,
				subagentRunId,
			}),
			sessionId,
			repoRoot: workspaceRoot(ctx.cwd),
			hasPriorAssistant: sessionHasPriorAssistant(ctx),
			mode: submission?.mode ?? "unknown",
			startedAt,
			startedMonotonic: performance.now() - Math.max(0, now - startedAt),
			subagentRunId,
			subagentStartedAt: Number.isFinite(parsedSubagentStart)
				? new Date(parsedSubagentStart).toISOString()
				: undefined,
			userTexts: [bounded(submission?.text ?? event.prompt, MAX_USER_TEXT)],
			assistantTexts: [],
			tools: [],
			activeTools: new Map(),
			mutationGeneration: 0,
		};
		activateOrchestrationInteraction({
			interactionId: active.interactionId,
			sessionId: active.sessionId,
		});
		return undefined;
	});

	pi.on("message_end", async (event) => {
		if (!active || event.message.role !== "assistant") return;
		noteParentAssistantUsage({
			provider: event.message.provider,
			model: event.message.model,
			usage: event.message.usage,
		});
		const text = messageText(event.message);
		if (!text) return;
		active.assistantTexts.push(bounded(text, MAX_ASSISTANT_TURN));
		if (active.assistantTexts.length > MAX_ASSISTANT_TURNS)
			active.assistantTexts.shift();
	});

	pi.on("tool_execution_start", async (event) => {
		if (!active) return;
		active.activeTools.set(event.toolCallId, {
			toolName: event.toolName,
			argsText: stableText(sanitizeTaskValue(event.args), MAX_TOOL_ARGS),
			mutationGeneration: active.mutationGeneration,
		});
	});

	pi.on("tool_execution_end", async (event) => {
		if (!active) return;
		const started = active.activeTools.get(event.toolCallId);
		active.activeTools.delete(event.toolCallId);
		const output = bounded(
			sanitizeTaskValue(resultText(event.result)),
			MAX_TOOL_RESULT,
		);
		const trace: ToolTrace = {
			toolName: started?.toolName ?? event.toolName,
			argsText: started?.argsText ?? "",
			resultText: output,
			isError: failedResult(event.isError, output),
			mutationGeneration:
				started?.mutationGeneration ?? active.mutationGeneration,
		};
		active.tools.push(trace);
		if (!trace.isError && MUTATION_TOOLS.has(trace.toolName))
			active.mutationGeneration += 1;
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!active) return;
		const completed = active;
		active = null;
		const settledAt = Date.now();
		const provisional = packetFromInteraction(completed, settledAt, []);
		const triggers = detectFrictionTriggers(
			provisional.userText,
			completed.tools,
		);
		if (!completed.hasPriorAssistant) {
			const correctionIndex = triggers.indexOf("user_correction");
			if (correctionIndex >= 0) triggers.splice(correctionIndex, 1);
		}
		if (
			provisional.subagentRunId &&
			provisional.durationMs >= REVIEW_MIN_DURATION_MS
		)
			triggers.push("subagent_duration_over_2m");
		const reasons = selectInteractionForReview({
			interactionId: provisional.interactionId,
			durationMs: provisional.durationMs,
			triggers,
		});
		latestCompleted = { ...provisional, selectionReasons: reasons };
		const metadata = interactionMetadataFromPacket({
			...latestCompleted,
			tools: completed.tools,
		});
		void appendJsonLine(interactionsPath(), metadata).catch(() => {
			// Metadata persistence must not delay or interrupt control return.
		});
		const orchestration = settleOrchestrationInteraction(
			completed.interactionId,
		);
		if (!process.env.PI_SUBAGENT_RUN_ID && orchestration) {
			const event = buildOrchestrationInteractionEvent({
				interactionId: orchestration.interactionId,
				orchestrationIds: orchestration.orchestrationIds,
				parentUsageByModel: orchestration.parentUsageByModel,
				durationMs: provisional.durationMs,
				direct: orchestration.orchestrationIds.length === 0,
				session: orchestration.sessionId,
				correlation: correlationFieldsForPacket(provisional),
			});
			if (event) recordEvent(event);
		}
		if (reasons.length === 0) return;
		const packet = latestCompleted;
		void enqueueReview(packet)
			.then(() => startBackgroundWorker(ctx, reviewer))
			.catch(() => {
				// Selection persistence must not delay or interrupt control return.
			});
	});

}
