import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { sanitizeTaskValue } from "../lib/task-security.js";
import {
	buildReviewPrompt,
	buildWorkflowReviewPrompt,
	consumeWorkflowSubmission,
	createInteractionId,
	detectFrictionTriggers,
	FRICTION_SCHEMA_VERSION,
	type InteractionMetadataRecord,
	type InteractionPacket,
	interactionMetadataFromPacket,
	noteWorkflowSubmission,
	parseReviewResult,
	REVIEW_LOOKBACK_DAYS,
	REVIEW_MIN_DURATION_MS,
	type StoredReviewRecord,
	selectInteractionForReview,
	summarizeInteractionMetadata,
	type ToolTrace,
	type WorkflowMode,
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
const REVIEW_MODEL_EFFORT = "low";
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

function storageRoot(): string {
	return path.join(getAgentDir(), "workflow-friction");
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

function failedResult(isError: boolean, text: string): boolean {
	return (
		isError ||
		/\b(?:command exited with code [1-9]\d*|elifecycle|failed|non-zero exit|timed out|traceback)\b/i.test(
			text,
		)
	);
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript))
		return { command: process.execPath, args: [currentScript, ...args] };
	const execName = path.basename(process.execPath).toLowerCase();
	if (!/^(?:node|bun)(?:\.exe)?$/.test(execName))
		return { command: process.execPath, args };
	return { command: "pi", args };
}

export function buildReviewerArgs(promptFile: string): string[] {
	return [
		"--provider",
		REVIEW_MODEL_PROVIDER,
		"--model",
		REVIEW_MODEL_ID,
		"--thinking",
		REVIEW_MODEL_EFFORT,
		"--no-tools",
		"--no-extensions",
		"--no-skills",
		"--no-context-files",
		"--no-prompt-templates",
		"--no-themes",
		"--no-session",
		"--no-approve",
		`@${promptFile}`,
		"--print",
		"Review the attached interaction and return only the requested JSON.",
	];
}

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
			await appendFailedReview(job, "Background review was interrupted.");
		} finally {
			await fsp.rm(filePath, { force: true });
		}
	}
}

async function executeReview(
	pi: ExtensionAPI,
	cwd: string,
	job: ReviewJob,
): Promise<StoredReviewRecord> {
	const tempDir = await fsp.mkdtemp(
		path.join(os.tmpdir(), "pi-friction-review-"),
	);
	const promptFile = path.join(tempDir, "prompt.md");
	try {
		const packet = await applyCaptureAnnotation(job.packet);
		await fsp.writeFile(promptFile, buildReviewPrompt(packet), {
			encoding: "utf8",
			mode: 0o600,
		});
		const invocation = getPiInvocation(buildReviewerArgs(promptFile));
		const result = await pi.exec(invocation.command, invocation.args, {
			cwd,
			timeout: REVIEW_TIMEOUT_MS,
		});
		if (result.code !== 0)
			throw new Error(
				bounded(
					result.stderr || result.stdout || "Background reviewer failed.",
					600,
				),
			);
		const review = parseReviewResult(result.stdout);
		if (!review) throw new Error("Background reviewer returned invalid JSON.");
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
			status: "completed" as const,
			review,
		});
	} finally {
		await fsp.rm(tempDir, { recursive: true, force: true });
	}
}

let localWorkerRunning = false;

async function processPendingReviews(
	pi: ExtensionAPI,
	cwd: string,
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
				const record = await executeReview(pi, cwd, job);
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

function startBackgroundWorker(pi: ExtensionAPI, cwd: string): void {
	void processPendingReviews(pi, cwd).catch(() => {
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

export default function workflowFrictionExtension(pi: ExtensionAPI) {
	let pendingInput: PendingInput | null = null;
	let active: ActiveInteraction | null = null;
	let latestCompleted: InteractionPacket | null = null;
	let currentSessionId = "unknown";

	pi.on("session_start", async (_event, ctx) => {
		currentSessionId = ctx.sessionManager.getSessionId();
		startBackgroundWorker(pi, ctx.cwd);
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
			sessionId: ctx.sessionManager.getSessionId(),
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
		return undefined;
	});

	pi.on("message_end", async (event) => {
		if (!active || event.message.role !== "assistant") return;
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
		if (reasons.length === 0) return;
		const packet = latestCompleted;
		void enqueueReview(packet)
			.then(() => startBackgroundWorker(pi, ctx.cwd))
			.catch(() => {
				// Selection persistence must not delay or interrupt control return.
			});
	});

	pi.registerCommand("capture", {
		description:
			"Queue the latest completed interaction for background workflow review",
		handler: async (args: string, ctx: ExtensionContext) => {
			if (!latestCompleted) {
				ctx.ui.notify(
					"No completed interaction is available to capture.",
					"warning",
				);
				return;
			}
			const note = args.trim();
			const packet: InteractionPacket = {
				...latestCompleted,
				selectionReasons: [
					...new Set([...latestCompleted.selectionReasons, "manual_capture"]),
				].sort(),
				captureNote: note ? bounded(note, 1_000) : undefined,
			};
			const outcome = await enqueueReview(packet);
			ctx.ui.notify(
				outcome === "already_reviewed"
					? "Latest interaction was already reviewed."
					: "Latest interaction captured for background review.",
				"info",
			);
			startBackgroundWorker(pi, ctx.cwd);
		},
	});

	pi.registerCommand("workflow-review", {
		description: "Aggregate the previous 15 days of workflow-friction reviews",
		handler: async (args: string, ctx: ExtensionContext) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /workflow-review", "warning");
				return;
			}
			const records = await recentReviewRecords();
			if (records.length === 0) {
				ctx.ui.notify(
					"No workflow-friction reviews were recorded in the previous 15 days.",
					"info",
				);
				return;
			}
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
			noteWorkflowSubmission("/workflow-review", "explore");
			pi.sendMessage(
				{
					customType: "workflow-friction.reviewPrompt",
					content: buildWorkflowReviewPrompt(
						records,
						await experimentRecords(),
						summarizeInteractionMetadata(metadata),
					),
					display: false,
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		},
	});

	pi.registerTool({
		name: "workflow_friction_mark_change",
		label: "Record Workflow Experiment",
		description:
			"Record an approved and applied workflow change for later before-and-after review. Use only after explicit user approval.",
		promptSnippet:
			"Record an approved workflow change after it has been applied.",
		promptGuidelines: [
			"Call only after the user explicitly approves a workflow change and the change is applied.",
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
