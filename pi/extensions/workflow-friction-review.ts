import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { recordEvent } from "../lib/metrics.js";
import { buildOrchestrationInteractionEvent } from "../lib/orchestration-telemetry.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import { activateTools, deactivateTools } from "../lib/tool-activation.js";
import { sanitizeTaskValue } from "../lib/task-security.js";
import { defineAgent, type TypedAgentRunContext } from "../lib/typed-agent.js";
import { sendHiddenWorkflowPrompt } from "../lib/workflow-prompt.js";
import {
	activateOrchestrationInteraction,
	buildReviewPrompt,
	consumeWorkflowSubmission,
	createInteractionId,
	detectFrictionTriggers,
	FRICTION_SCHEMA_VERSION,
	type ImprovementTarget,
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
	workflowFrictionStorageRoot,
} from "../lib/workflow-friction.js";
import { collectSkillStats } from "./skill-stats.js";

const REVIEW_TIMEOUT_MS = 120_000;
const MAX_USER_TEXT = 16_000;
const MAX_ASSISTANT_TURN = 8_000;
const MAX_ASSISTANT_TURNS = 12;
const MAX_TOOL_TRACES = 64;
const MAX_TOOL_ARGS = 1_000;
const MAX_TOOL_RESULT = 2_000;
const REVIEW_MODEL_PROVIDER = "openai-codex";
const REVIEW_MODEL_ID = "gpt-5.6-terra";
const LEARNING_DECISION_LOCK_ATTEMPTS = 80;
const LEARNING_DECISION_LOCK_RETRY_MS = 25;
const IMPROVEMENT_REPORT_SCRIPT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../scripts/improvement-report.py",
);

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
								Type.Literal("command"),
								Type.Literal("extension"),
								Type.Literal("tool"),
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
	return value.length <= max ? value : `${value.slice(0, max)}\n[truncated]`;
}

function parseImprovementDecisionCommand(
	args: string,
): { selection: ImprovementDecisionSelection } | { error: string } {
	const trimmed = args.trim();
	if (/^decide\s+apply$/i.test(trimmed))
		return {
			selection: { choice: "apply", text: `/improve ${trimmed}` },
		};
	const match = /^decide\s+(edit|skip)(?:\s+([\s\S]*))?$/i.exec(trimmed);
	if (!match)
		return {
			error:
				"Usage: /improve decide apply | /improve decide edit <change> | /improve decide skip <reason>",
		};
	const detail = match[2]?.trim();
	if (!detail)
		return {
			error: `/improve decide ${match[1]?.toLowerCase()} requires nonempty text.`,
		};
	return {
		selection: {
			choice: match[1]?.toLowerCase() === "edit" ? "edit" : "skip",
			text: bounded(`/improve ${trimmed}`, 1_000),
			detail: bounded(detail, 1_000),
		},
	};
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
	if (/^\/(?:plan-it|review-it|do-it)\b/i.test(text.trim())) return "engineer";
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

export async function readCurrentLearningDecisions(): Promise<
	LearningDecisionRecord[]
> {
	const latest = new Map<string, LearningDecisionRecord>();
	for (const record of await readJsonLines<LearningDecisionRecord>(
		learningDecisionsPath(),
	))
		if (
			record?.schemaVersion === 1 &&
			typeof record.candidateId === "string" &&
			(record.decision === "applied" || record.decision === "skipped")
		)
			latest.set(record.candidateId, record);
	return [...latest.values()].sort(
		(a, b) =>
			a.decidedAt.localeCompare(b.decidedAt) ||
			a.candidateId.localeCompare(b.candidateId),
	);
}

async function withLearningDecisionLock<T>(
	operation: () => Promise<T>,
): Promise<T> {
	await ensureStorage();
	const lockPath = learningDecisionLockPath();
	let handle: fs.promises.FileHandle | null = null;
	for (
		let attempt = 0;
		attempt < LEARNING_DECISION_LOCK_ATTEMPTS;
		attempt += 1
	) {
		try {
			handle = await fsp.open(lockPath, "wx", 0o600);
			await handle.writeFile(`${process.pid}\n`, "utf8");
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			let owner = 0;
			try {
				owner = Number.parseInt(
					(await fsp.readFile(lockPath, "utf8")).trim(),
					10,
				);
			} catch {
				owner = 0;
			}
			if (owner <= 0 || !processExists(owner)) {
				await fsp.rm(lockPath, { force: true });
				continue;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, LEARNING_DECISION_LOCK_RETRY_MS),
			);
		}
	}
	if (!handle) throw new Error("Learning decision store is busy");
	try {
		return await operation();
	} finally {
		await handle.close();
		await fsp.rm(lockPath, { force: true });
	}
}

async function recordLearningDecision(
	decision: LearningDecisionRecord,
	experiment?: ExperimentRecord,
): Promise<void> {
	await withLearningDecisionLock(async () => {
		if (
			(await readCurrentLearningDecisions()).some(
				(item) => item.candidateId === decision.candidateId,
			)
		)
			throw new Error("Learning candidate is already resolved");
		if (experiment) {
			const experiments = await readJsonLines<ExperimentRecord>(
				experimentsPath(),
			);
			if (
				!experiments.some(
					(item) => item.experimentId === experiment.experimentId,
				)
			)
				await appendJsonLine(experimentsPath(), sanitizeTaskValue(experiment));
		}
		await appendJsonLine(learningDecisionsPath(), sanitizeTaskValue(decision));
	});
}

export type ImprovementUsageState = "observed" | "zero" | "unknown";

export interface ImprovementCandidateUsage {
	target?: ImprovementTarget;
	state: ImprovementUsageState;
	source: "skill-stats" | "extension-stats" | "none";
	calls30d?: number;
	manualReadCandidates?: number;
	diagnostic?: string;
}

function normalizedTarget(
	record: StoredReviewRecord,
): ImprovementTarget | undefined {
	const target = record.review?.reusableInstruction.target;
	if (target) return target;
	const targetSkill = record.review?.reusableInstruction.targetSkill;
	return targetSkill ? { kind: "skill", name: targetSkill } : undefined;
}

function usageStateRank(state: ImprovementUsageState): number {
	if (state === "observed") return 2;
	if (state === "unknown") return 1;
	return 0;
}

function safetyCorrectnessRank(record: StoredReviewRecord): number {
	return record.review?.impact === "safety" ||
		record.review?.impact === "correctness"
		? 1
		: 0;
}

export function rankImprovementCandidates(
	candidates: readonly StoredReviewRecord[],
	usage: ReadonlyMap<string, ImprovementCandidateUsage>,
): StoredReviewRecord[] {
	return [...candidates].sort((left, right) => {
		const impactDifference =
			safetyCorrectnessRank(right) - safetyCorrectnessRank(left);
		if (impactDifference !== 0) return impactDifference;
		const leftUsage = usage.get(left.interactionId) ?? {
			state: "unknown" as const,
			source: "none" as const,
		};
		const rightUsage = usage.get(right.interactionId) ?? {
			state: "unknown" as const,
			source: "none" as const,
		};
		const stateDifference =
			usageStateRank(rightUsage.state) - usageStateRank(leftUsage.state);
		if (stateDifference !== 0) return stateDifference;
		const callsDifference =
			(rightUsage.calls30d ?? -1) - (leftUsage.calls30d ?? -1);
		if (callsDifference !== 0) return callsDifference;
		const confidenceDifference =
			(right.review?.confidence ?? 0) - (left.review?.confidence ?? 0);
		if (confidenceDifference !== 0) return confidenceDifference;
		return (
			left.reviewedAt.localeCompare(right.reviewedAt) ||
			left.interactionId.localeCompare(right.interactionId)
		);
	});
}

function mapContainsTarget(
	values: ReadonlyMap<string, number>,
	name: string,
	owner?: string,
): boolean {
	const normalizedName = name.toLowerCase();
	const normalizedOwner = owner?.toLowerCase();
	for (const key of values.keys()) {
		const slash = key.indexOf("/");
		const keyOwner = slash >= 0 ? key.slice(0, slash) : "";
		const keyName = slash >= 0 ? key.slice(slash + 1) : key;
		if (keyName.toLowerCase() !== normalizedName) continue;
		if (!normalizedOwner || keyOwner.toLowerCase() === normalizedOwner)
			return true;
	}
	return false;
}

function mapValue(
	values: ReadonlyMap<string, number>,
	name: string,
	owner?: string,
): number {
	const normalizedName = name.toLowerCase();
	const normalizedOwner = owner?.toLowerCase();
	let total = 0;
	for (const [key, count] of values) {
		const slash = key.indexOf("/");
		const keyOwner = slash >= 0 ? key.slice(0, slash) : "";
		const keyName = slash >= 0 ? key.slice(slash + 1) : key;
		if (keyName.toLowerCase() !== normalizedName) continue;
		if (normalizedOwner && keyOwner.toLowerCase() !== normalizedOwner) continue;
		total += count;
	}
	return total;
}

function rankingReason(
	record: StoredReviewRecord,
	usage: ImprovementCandidateUsage,
): string {
	if (safetyCorrectnessRank(record) > 0)
		return `${record.review?.impact} impact overrides usage ROI`;
	if (usage.state === "observed")
		return `highest observed 30-day usage ROI (${usage.calls30d ?? 0} calls)`;
	if (usage.state === "zero")
		return "verified zero 30-day usage; consider simplification or retirement";
	return `usage unknown${usage.diagnostic ? `: ${usage.diagnostic}` : ""}`;
}

function improvementCandidateIdBody(candidateId: string): string {
	return candidateId.startsWith("interaction-")
		? candidateId.slice("interaction-".length)
		: candidateId;
}

function improvementCandidateReference(
	candidate: StoredReviewRecord,
	candidates: readonly StoredReviewRecord[],
): string {
	const body = improvementCandidateIdBody(candidate.interactionId);
	for (
		let length = Math.min(8, body.length);
		length <= body.length;
		length += 1
	) {
		const prefix = body.slice(0, length).toLowerCase();
		const matches = candidates.filter((item) =>
			improvementCandidateIdBody(item.interactionId)
				.toLowerCase()
				.startsWith(prefix),
		);
		if (matches.length === 1) return body.slice(0, length);
	}
	return candidate.interactionId;
}

function formatImprovementCandidateList(
	candidates: readonly StoredReviewRecord[],
	usageByCandidate: ReadonlyMap<string, ImprovementCandidateUsage>,
): string {
	const rows = candidates.map((candidate, index) => {
		const review = candidate.review;
		const usage = usageByCandidate.get(candidate.interactionId) ?? {
			state: "unknown" as const,
			source: "none" as const,
			diagnostic: "target unresolved",
		};
		const target = normalizedTarget(candidate);
		const targetLabel = target
			? `${target.kind}:${target.owner ? `${target.owner}/` : ""}${target.name}`
			: "target:unresolved";
		return `${index + 1}. ${improvementCandidateReference(candidate, candidates)} [${review?.impact ?? "unspecified"}] ${targetLabel}\n   ${bounded(review?.suggestedChange?.trim() ?? "", 160)}\n   ${rankingReason(candidate, usage)}`;
	});
	return `Available improvement candidates (${candidates.length}):\n${rows.join("\n")}\n\nSelect with /improve select <number-or-id>.`;
}

function formatImprovementCandidateSelection(
	candidate: StoredReviewRecord,
	candidates: readonly StoredReviewRecord[],
	ordinal: number,
	total: number,
): string {
	const review = candidate.review;
	const target = normalizedTarget(candidate);
	const targetLabel = target
		? `${target.kind}:${target.owner ? `${target.owner}/` : ""}${target.name}`
		: "target:unresolved";
	return `Selected improvement candidate ${ordinal} of ${total}: ${improvementCandidateReference(candidate, candidates)} [${review?.impact ?? "unspecified"}] ${targetLabel}\n${bounded(review?.suggestedChange?.trim() ?? "", 160)}`;
}

function showImprovementCommandOutput(
	pi: ExtensionAPI,
	args: string,
	content: string,
): void {
	const invocation = args.trim() ? `/improve ${args.trim()}` : "/improve";
	pi.sendMessage(
		{
			customType: "workflow-friction.improve-command",
			content: `> ${invocation}\n\n${content}`,
			display: true,
		},
		{ triggerTurn: false },
	);
}

function improvementDecisionFollowUpPrompt(
	candidateId: string,
	selection: ImprovementDecisionSelection,
): string {
	const detail = selection.detail
		? `\nCaptured detail: ${selection.detail}`
		: "";
	return `Execute the captured /improve decision immediately without another approval request.

Candidate ID: ${candidateId}
Captured command: ${selection.text}
Choice: ${selection.choice}${detail}

For apply or edit, apply the selected change, validate it through the user-facing workflow, preserve rollback instructions, then call learning_candidate_decide. For skip, call learning_candidate_decide without editing. The tool records the captured command directly.`;
}

function improveHelpText(): string {
	return [
		"Usage:",
		"  /improve                          Discuss the highest-ranked unresolved candidate",
		"  /improve list                     List ranked unresolved candidates",
		"  /improve report                   Generate the evidence-backed report",
		"  /improve select <number-or-id>    Discuss one candidate from the list",
		"  /improve decide apply             Apply the selected proposal",
		"  /improve decide edit <change>     Apply an edited proposal",
		"  /improve decide skip <reason>     Skip the selected proposal",
		"  /improve help                     Show this help",
		"During discussion, ask questions normally. Only /improve decide changes authorization state.",
	].join("\n");
}

export async function collectCandidateUsage(
	candidates: readonly StoredReviewRecord[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<Map<string, ImprovementCandidateUsage>> {
	const usage = new Map<string, ImprovementCandidateUsage>();
	const targets = candidates.map((candidate) => ({
		candidate,
		target: normalizedTarget(candidate),
	}));
	for (const { candidate, target } of targets)
		usage.set(candidate.interactionId, {
			target,
			state: "unknown",
			source: "none",
			diagnostic: target ? "telemetry unavailable" : "target unresolved",
		});

	if (targets.some(({ target }) => target?.kind === "skill")) {
		try {
			const stats = await collectSkillStats("30", {
				cwd: ctx.cwd,
				sessionRoot: ctx.sessionManager.getSessionDir(),
			});
			if (stats.result)
				for (const { candidate, target } of targets) {
					if (target?.kind !== "skill") continue;
					if (!stats.result.skillMetadata.has(target.name.toLowerCase())) {
						usage.set(candidate.interactionId, {
							target,
							state: "unknown",
							source: "skill-stats",
							diagnostic: "target not discovered",
						});
						continue;
					}
					const calls30d = mapValue(
						stats.result.usage.get("30") ?? new Map(),
						target.name,
					);
					usage.set(candidate.interactionId, {
						target,
						state: calls30d > 0 ? "observed" : "zero",
						source: "skill-stats",
						calls30d,
						manualReadCandidates: mapValue(
							stats.result.candidates,
							target.name,
						),
					});
				}
		} catch (error) {
			const diagnostic = bounded(
				error instanceof Error ? error.message : String(error),
				160,
			);
			for (const { candidate, target } of targets)
				if (target?.kind === "skill")
					usage.set(candidate.interactionId, {
						target,
						state: "unknown",
						source: "skill-stats",
						diagnostic,
					});
		}
	}

	if (targets.some(({ target }) => target && target.kind !== "skill")) {
		try {
			const { collectExtensionUsageSnapshot } = await import(
				"./extension-stats.js"
			);
			const stats = await collectExtensionUsageSnapshot(
				pi,
				ctx.cwd,
				ctx.sessionManager.getSessionDir(),
			);
			for (const { candidate, target } of targets) {
				if (!target || target.kind === "skill") continue;
				const values =
					target.kind === "extension"
						? stats.extensions
						: target.kind === "command"
							? stats.commands
							: stats.tools;
				if (!mapContainsTarget(values, target.name, target.owner)) {
					usage.set(candidate.interactionId, {
						target,
						state: "unknown",
						source: "extension-stats",
						diagnostic: "target not discovered",
					});
					continue;
				}
				const calls30d = mapValue(values, target.name, target.owner);
				usage.set(candidate.interactionId, {
					target,
					state: calls30d > 0 ? "observed" : "zero",
					source: "extension-stats",
					calls30d,
				});
			}
		} catch (error) {
			const diagnostic = bounded(
				error instanceof Error ? error.message : String(error),
				160,
			);
			for (const { candidate, target } of targets)
				if (target && target.kind !== "skill")
					usage.set(candidate.interactionId, {
						target,
						state: "unknown",
						source: "extension-stats",
						diagnostic,
					});
		}
	}
	return usage;
}

interface ImprovementContext {
	reviewCount: number;
	pendingCandidateCount: number;
	interactionSummary: ReturnType<typeof summarizeInteractionMetadata>;
	priorExperimentCount: number;
	candidateUsage: ImprovementCandidateUsage;
	rankingReason: string;
}

function buildImprovementDiscussionPrompt(
	record: StoredReviewRecord,
	context: ImprovementContext,
): string {
	const review = record.review;
	if (!review) throw new Error("Improvement candidate review is missing");
	return `Discuss exactly one supported self-improvement candidate with the user.

Candidate ID: ${record.interactionId}
Proposed change: ${review.suggestedChange}
Scope hint: ${learningScope(record)}
Impact: ${review.impact ?? "unspecified"}
Target: ${context.candidateUsage.target ? JSON.stringify(context.candidateUsage.target) : "unresolved"}
Ranking reason: ${context.rankingReason}
Reason: ${review.reusableInstruction.reason}
Evidence:
${review.evidence.map((item) => `- ${item}`).join("\n")}

Cross-session context from the previous ${REVIEW_LOOKBACK_DAYS} days:
${JSON.stringify(context)}

Use the full 1-3-1 format in normal conversation:
- Problem: explain the observed recurring risk or correction and its evidence.
- Goal: state the future behavior the change should produce.
- Option 1: Apply the proposed change as written.
- Option 2: Edit the change or target before applying it.
- Option 3: Skip it as non-durable or incorrect.
- Recommendation: choose one option and explain why.

Questions and comments continue the discussion and must not select or resolve the candidate. Normal conversational input, including the words Apply, Edit, Skip, or Option, never authorizes a choice. Wait for exactly one explicit command: /improve decide apply, /improve decide edit <requested change>, or /improve decide skip <reason>. Once the command is captured, execute that choice immediately without another approval request.

For Apply or Edit:
- Inspect existing AGENTS.md files and relevant skills before editing.
- Check for duplicate or contradictory guidance.
- Use the narrowest existing tracked surface.
- Prefer a test, hook, validator, or code fix when deterministic enforcement is required.
- Do not create a new skill from one interaction.
- Validate the changed surface through the user-facing Pi workflow.
- Call learning_candidate_decide with decision applied, the final approved text, target paths, validation evidence, and rollback instructions. The tool records the captured command text directly.

For Skip, call learning_candidate_decide with decision skipped. The tool records the captured command and reason directly.`;
}

async function appendFailedReview(
	job: ReviewJob,
	error: string,
): Promise<void> {
	const packet = await applyCaptureAnnotation(job.packet);
	const record: StoredReviewRecord = {
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

async function recentReviewRecords(): Promise<StoredReviewRecord[]> {
	const cutoff = Date.now() - REVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
	const records = (await readJsonLines<StoredReviewRecord>(reviewsPath()))
		.filter((record) => Date.parse(record.reviewedAt) >= cutoff)
		.slice(-300);
	return Promise.all(
		records.map(async (record) => {
			const annotation = await readCaptureAnnotation(record.interactionId);
			if (!annotation) return record;
			return {
				...record,
				selectionReasons: [
					...new Set([
						...record.selectionReasons,
						...annotation.selectionReasons,
					]),
				].sort(),
				captureNote: annotation.captureNote ?? record.captureNote,
			};
		}),
	);
}

async function learningReviewRecords(): Promise<StoredReviewRecord[]> {
	return (await readJsonLines<StoredReviewRecord>(reviewsPath())).filter(
		(record) => isLearningCandidate(record),
	);
}

async function recentInteractionMetadata(): Promise<
	InteractionMetadataRecord[]
> {
	const cutoff = Date.now() - REVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
	return (
		await readJsonLines<InteractionMetadataRecord>(interactionsPath())
	).filter((record) => Date.parse(record.settledAt) >= cutoff);
}

async function experimentRecords(): Promise<Record<string, unknown>[]> {
	return (
		await readJsonLines<Record<string, unknown>>(experimentsPath())
	).slice(-100);
}

export default function workflowFrictionExtension(
	pi: ExtensionAPI,
	options: { reviewer?: WorkflowReviewRunner } = {},
) {
	wrapCommandRegistration(pi, { excludeCommands: ["improve"] });
	const reviewer = options.reviewer ?? workflowReviewAgent;
	let pendingInput: PendingInput | null = null;
	let active: ActiveInteraction | null = null;
	let latestCompleted: InteractionPacket | null = null;
	let currentSessionId = "unknown";
	let pendingLearningDiscussion: PendingLearningDiscussion | null = null;
	let improvementListSnapshot: string[] | null = null;

	pi.on("session_start", async (_event, ctx) => {
		deactivateTools(pi, [
			"learning_candidate_decide",
			"workflow_friction_mark_change",
		]);
		const sessionId = ctx.sessionManager.getSessionId();
		if (currentSessionId !== sessionId) {
			resetOrchestrationInteraction(currentSessionId);
			improvementListSnapshot = null;
			pendingLearningDiscussion = null;
		}
		currentSessionId = sessionId;
		startBackgroundWorker(ctx, reviewer);
	});

	pi.on("session_shutdown", async () => {
		resetOrchestrationInteraction(currentSessionId);
		active = null;
		pendingInput = null;
		pendingLearningDiscussion = null;
		improvementListSnapshot = null;
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
		if (
			pendingLearningDiscussion ||
			/(?:\/improve\b|learning_candidate_decide)/i.test(event.prompt)
		)
			activateTools(pi, ["learning_candidate_decide"]);
		if (
			/(?:workflow_friction_mark_change|experiment tracking|track (?:this )?workflow change)/i.test(
				event.prompt,
			)
		)
			activateTools(pi, ["workflow_friction_mark_change"]);
		const sessionId = ctx.sessionManager.getSessionId();
		if (currentSessionId !== sessionId) {
			resetOrchestrationInteraction(currentSessionId);
			active = null;
			improvementListSnapshot = null;
			pendingLearningDiscussion = null;
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
		active = {
			interactionId: createInteractionId(),
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

	pi.registerCommand("improve", {
		description:
			"Generate a report or list, select, and discuss improvement candidates",
		handler: async (args: string, ctx: ExtensionContext) => {
			activateTools(pi, ["learning_candidate_decide"]);
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const action = parts[0]?.toLowerCase();
			if (action === "help") {
				showImprovementCommandOutput(pi, args, improveHelpText());
				return;
			}
			if (action === "report") {
				if (parts.length !== 1) {
					showImprovementCommandOutput(pi, args, "Usage: /improve report");
					return;
				}
				const result = await pi.exec(
					"python",
					[IMPROVEMENT_REPORT_SCRIPT, "--repo", ctx.cwd],
					{ cwd: ctx.cwd, timeout: 300_000 },
				);
				if (result.code !== 0) {
					const error = bounded(
						result.stderr.trim() || result.stdout.trim() || "unknown error",
						1_000,
					);
					showImprovementCommandOutput(
						pi,
						args,
						`Improvement report failed: ${error}`,
					);
					return;
				}
				const reportPath = result.stdout.trim().split(/\r?\n/).at(-1);
				showImprovementCommandOutput(
					pi,
					args,
					reportPath
						? `Improvement report: ${reportPath}`
						: "Improvement report completed without a reported path.",
				);
				return;
			}
			if (
				action &&
				action !== "list" &&
				action !== "select" &&
				action !== "decide"
			) {
				showImprovementCommandOutput(pi, args, improveHelpText());
				return;
			}
			if (action === "decide") {
				const parsed = parseImprovementDecisionCommand(args);
				if ("error" in parsed) {
					showImprovementCommandOutput(pi, args, parsed.error);
					return;
				}
				if (pendingLearningDiscussion?.phase !== "discussing") {
					showImprovementCommandOutput(
						pi,
						args,
						"No active improvement candidate is awaiting a decision. Run /improve or /improve select <number-or-id> first.",
					);
					return;
				}
				pendingLearningDiscussion = {
					...pendingLearningDiscussion,
					phase: "selected",
					selection: parsed.selection,
				};
				showImprovementCommandOutput(
					pi,
					args,
					`Captured ${parsed.selection.choice} decision for ${pendingLearningDiscussion.candidateId}. Executing now.`,
				);
				noteWorkflowSubmission(parsed.selection.text, "explore");
				sendHiddenWorkflowPrompt(
					pi,
					improvementDecisionFollowUpPrompt(
						pendingLearningDiscussion.candidateId,
						parsed.selection,
					),
					{ customType: "workflow-friction.improve-decision" },
				);
				return;
			}
			if (action === "select" && parts.length !== 2) {
				showImprovementCommandOutput(
					pi,
					args,
					"Usage: /improve select <number-or-id>",
				);
				return;
			}
			const resolved = new Set(
				(await readCurrentLearningDecisions()).map(
					(decision) => decision.candidateId,
				),
			);
			const eligibleCandidates = (await learningReviewRecords()).filter(
				(record) =>
					isLearningCandidate(record) &&
					!resolved.has(record.interactionId) &&
					learningCandidateVisible(record, ctx.cwd),
			);
			const selectionToken = action === "select" ? (parts[1] ?? "") : "";
			const numericSelection = /^\d+$/.test(selectionToken);
			let snapshotCandidateId: string | undefined;
			if (numericSelection) {
				if (!improvementListSnapshot) {
					showImprovementCommandOutput(
						pi,
						args,
						"No displayed improvement list is available in this session. Run /improve list before selecting by number.",
					);
					return;
				}
				const ordinal = Number(selectionToken);
				snapshotCandidateId =
					Number.isSafeInteger(ordinal) && ordinal >= 1
						? improvementListSnapshot[ordinal - 1]
						: undefined;
				if (!snapshotCandidateId) {
					showImprovementCommandOutput(
						pi,
						args,
						`No candidate was displayed as number ${selectionToken}. Run /improve list to refresh the snapshot.`,
					);
					return;
				}
				if (
					!eligibleCandidates.some(
						(candidate) => candidate.interactionId === snapshotCandidateId,
					)
				) {
					showImprovementCommandOutput(
						pi,
						args,
						`Improvement candidate ${snapshotCandidateId} from displayed number ${selectionToken} is no longer eligible. Run /improve list to refresh the snapshot.`,
					);
					return;
				}
			}
			if (eligibleCandidates.length === 0) {
				showImprovementCommandOutput(
					pi,
					args,
					"No supported improvement candidates exist for this workspace.",
				);
				return;
			}
			const usageByCandidate = await collectCandidateUsage(
				eligibleCandidates,
				pi,
				ctx,
			);
			const candidates = rankImprovementCandidates(
				eligibleCandidates,
				usageByCandidate,
			);
			if (action === "list") {
				improvementListSnapshot = candidates.map(
					(candidate) => candidate.interactionId,
				);
				showImprovementCommandOutput(
					pi,
					args,
					formatImprovementCandidateList(candidates, usageByCandidate),
				);
				return;
			}
			let candidate: StoredReviewRecord | undefined = candidates[0];
			if (action === "select") {
				const selection = selectionToken.toLowerCase();
				if (numericSelection) {
					candidate = candidates.find(
						(item) => item.interactionId === snapshotCandidateId,
					);
				} else {
					const matches = candidates.filter((item) => {
						const fullId = item.interactionId.toLowerCase();
						const body = improvementCandidateIdBody(
							item.interactionId,
						).toLowerCase();
						return fullId === selection || body.startsWith(selection);
					});
					if (matches.length === 0) {
						showImprovementCommandOutput(
							pi,
							args,
							`No unresolved improvement candidate matches ${parts[1]}.`,
						);
						return;
					}
					if (matches.length > 1) {
						showImprovementCommandOutput(
							pi,
							args,
							`Improvement candidate ID ${parts[1]} is ambiguous. Use a longer prefix from /improve list.`,
						);
						return;
					}
					candidate = matches[0];
				}
			}
			if (!candidate) return;
			if (action === "select") {
				const ordinal = numericSelection
					? Number(selectionToken)
					: candidates.indexOf(candidate) + 1;
				const total = numericSelection
					? (improvementListSnapshot?.length ?? 0)
					: candidates.length;
				showImprovementCommandOutput(
					pi,
					args,
					formatImprovementCandidateSelection(
						candidate,
						candidates,
						ordinal,
						total,
					),
				);
			}
			const records = await recentReviewRecords();
			const selectedByReview = new Map(
				records.map((record) => [
					record.interactionId,
					record.selectionReasons,
				]),
			);
			const metadata = (await recentInteractionMetadata()).map((record) => {
				const reviewReasons = selectedByReview.get(record.interactionId);
				if (!reviewReasons) return record;
				return {
					...record,
					selected: true,
					selectionReasons: [
						...new Set([...record.selectionReasons, ...reviewReasons]),
					].sort(),
				};
			});
			const candidateUsage = usageByCandidate.get(candidate.interactionId) ?? {
				state: "unknown" as const,
				source: "none" as const,
				diagnostic: "target unresolved",
			};
			pendingLearningDiscussion = {
				candidateId: candidate.interactionId,
				phase: "discussing",
			};
			noteWorkflowSubmission("/improve", "explore");
			sendHiddenWorkflowPrompt(
				pi,
				buildImprovementDiscussionPrompt(candidate, {
					reviewCount: records.length,
					pendingCandidateCount: candidates.length,
					interactionSummary: summarizeInteractionMetadata(metadata),
					priorExperimentCount: (await experimentRecords()).length,
					candidateUsage,
					rankingReason: rankingReason(candidate, candidateUsage),
				}),
				{ customType: "workflow-friction.improve" },
			);
		},
	});

	pi.registerTool({
		name: "learning_candidate_decide",
		label: "Record Improvement Decision",
		description:
			"Record the captured command decision after discussing one /improve candidate.",
		promptSnippet:
			"Record an applied or skipped improvement candidate after /improve decide.",
		promptGuidelines: [
			"Call learning_candidate_decide only after /improve decide captures a choice for the candidate shown by /improve.",
			"For applied improvement candidates, call learning_candidate_decide only after the approved change is applied and validated.",
		],
		parameters: Type.Object({
			candidateId: Type.String(),
			decision: Type.Union([Type.Literal("applied"), Type.Literal("skipped")]),
			approvedText: Type.Optional(Type.String({ maxLength: 600 })),
			targetPaths: Type.Array(Type.String(), { maxItems: 10 }),
			validation: Type.Optional(Type.String({ maxLength: 2_000 })),
			rollback: Type.Optional(Type.String({ maxLength: 1_000 })),
			reason: Type.Optional(Type.String({ maxLength: 1_000 })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const values = params as {
				candidateId: string;
				decision: "applied" | "skipped";
				approvedText?: string;
				targetPaths: string[];
				validation?: string;
				rollback?: string;
				reason?: string;
			};
			const selection = pendingLearningDiscussion?.selection;
			if (
				pendingLearningDiscussion?.candidateId !== values.candidateId ||
				pendingLearningDiscussion.phase !== "selected" ||
				!selection
			)
				throw new Error(
					"Improvement candidate requires an explicit /improve decide command",
				);
			const expectedDecision =
				selection.choice === "skip" ? "skipped" : "applied";
			if (values.decision !== expectedDecision)
				throw new Error(
					`Improvement selection ${selection.choice} cannot be recorded as ${values.decision}`,
				);
			const candidate = (await learningReviewRecords()).find(
				(record) =>
					record.interactionId === values.candidateId &&
					isLearningCandidate(record) &&
					learningCandidateVisible(record, ctx.cwd),
			);
			if (!candidate?.review)
				throw new Error(
					"Improvement candidate was not found or is no longer eligible",
				);
			const now = new Date().toISOString();
			const targetPaths = [
				...new Set(
					values.targetPaths
						.map((item) => bounded(item.trim(), 300))
						.filter(Boolean),
				),
			];
			const approvedText = bounded(values.approvedText?.trim() ?? "", 600);
			const validation = bounded(values.validation?.trim() ?? "", 2_000);
			const rollback = bounded(values.rollback?.trim() ?? "", 1_000);
			const reason = bounded(
				selection.choice === "skip"
					? (selection.detail ?? "")
					: (values.reason?.trim() ?? ""),
				1_000,
			);
			if (
				values.decision === "applied" &&
				(!approvedText || targetPaths.length === 0 || !validation || !rollback)
			)
				throw new Error(
					"Applied candidates require approved text, target paths, validation evidence, and rollback instructions",
				);
			if (values.decision === "skipped" && !reason)
				throw new Error("Skipped candidates require a reason");

			const experimentId = `experiment-${values.candidateId}`;
			const decision: LearningDecisionRecord = sanitizeTaskValue({
				schemaVersion: 1,
				candidateId: values.candidateId,
				decidedAt: now,
				decision: values.decision,
				decisionText: selection.text,
				approvedText: approvedText || undefined,
				targetPaths: targetPaths.length > 0 ? targetPaths : undefined,
				validation: validation || undefined,
				rollback: rollback || undefined,
				reason: reason || undefined,
				experimentId: values.decision === "applied" ? experimentId : undefined,
			});
			const experiment: ExperimentRecord | undefined =
				values.decision === "applied"
					? sanitizeTaskValue({
							schemaVersion: FRICTION_SCHEMA_VERSION,
							experimentId,
							recordedAt: now,
							sessionId: currentSessionId,
							pattern: bounded(
								candidate.review.reusableInstruction.reason,
								300,
							),
							treatment: approvedText,
							surfaces: targetPaths,
						})
					: undefined;
			await recordLearningDecision(decision, experiment);
			pendingLearningDiscussion = null;
			return {
				content: [
					{
						type: "text" as const,
						text: `Improvement candidate ${decision.candidateId} marked ${decision.decision}.`,
					},
				],
				details: decision,
			};
		},
	});

	pi.registerTool({
		name: "workflow_friction_mark_change",
		label: "Record Workflow Experiment",
		description:
			"Record an applied workflow change for later before-and-after review only when the user explicitly requests experiment tracking.",
		promptSnippet:
			"Record an applied workflow change only after an explicit tracking request.",
		promptGuidelines: [
			"Call only when the user explicitly requests experiment tracking and the workflow change has been applied; approval of ordinary work is insufficient.",
		],
		parameters: Type.Object({
			pattern: Type.String({
				description: "Measured friction pattern the change intends to improve",
			}),
			treatment: Type.String({
				description: "Concise description of the applied conceptual change",
			}),
			surfaces: Type.Array(Type.String(), {
				description:
					"Instruction, skill, prompt, hook, or code surfaces changed",
				maxItems: 10,
			}),
		}),
		async execute(_toolCallId, params) {
			const values = params as {
				pattern: string;
				treatment: string;
				surfaces: string[];
			};
			const record: ExperimentRecord = sanitizeTaskValue({
				schemaVersion: FRICTION_SCHEMA_VERSION,
				experimentId: `experiment-${randomUUID()}`,
				recordedAt: new Date().toISOString(),
				sessionId: currentSessionId,
				pattern: bounded(values.pattern.trim(), 300),
				treatment: bounded(values.treatment.trim(), 600),
				surfaces: values.surfaces
					.map((surface) => bounded(surface.trim(), 200))
					.filter(Boolean),
			});
			await appendJsonLine(experimentsPath(), record);
			return {
				content: [
					{
						type: "text" as const,
						text: `Recorded workflow experiment ${record.experimentId}.`,
					},
				],
				details: record,
			};
		},
	});
}
