import { onSessionStart } from "../lib/session-start-metrics.js";
import {
	findCutPoint,
	sessionEntryToContextMessages,
	type ContextUsage,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { reportActionableExtensionFailure } from "../lib/extension-diagnostics.js";
import { readMergedSettings } from "../lib/settings-loader.js";

const DEFAULT_RESERVE_TOKENS = 16_384;
const DEFAULT_KEEP_RECENT_TOKENS = 20_000;
const CONTINUATION_TYPE = "active-turn-compaction.continue";
const COMPACTION_HANDOFF_INSTRUCTIONS = `Preserve a durable handoff for the active request. The compacted summary plus retained messages own the conversational frontier. Include:
- requested outcome and settled observable completion evidence
- the condition under which that evidence fails
- latest user correction affecting scope or completion; omit superseded intent and let the newer retained correction take precedence
- response owed to the user
- pending question that must be answered or settled
- pending operator decisions, kept distinct from pending questions
- canonical plan or goal artifact path when present
- per-task live attempt counts and caps
- hard stop conditions that forbid another attempt
- explicitly supplied active root task details as authoritative supplemental durable requirements, constraints, dependencies, and acceptance checks; their Instructions, goal coverage, and boundaries remain authoritative; task state does not replace the current request
- completed checks and first unmet completion check
- changed files
- validation run and results
- blockers
- exact next action
Keep the handoff bounded and omit unrelated history. Do not reconstruct the conversation from task state, create replacement tasks, or write conversation history into task notes.`;
const CONTINUATION_INSTRUCTIONS =
	"Continue from the compacted summary and retained messages. They are authoritative for the conversational frontier, including the latest user correction, response owed, pending question, and current request; a newer retained correction takes precedence over older summary or task information. An explicitly supplied active root task is authoritative for its Instructions, goal coverage, dependencies, boundaries, and acceptance checks, but supplemental to the current request. Do not reconstruct the conversation or current request from task state. Do not create replacement tasks during recovery or write conversation history into task Instructions. Do not treat compaction as completion.";

export interface ActiveTurnCompactionPolicy {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
	softLimitTokens?: number;
	softLimitMaxContextWindowTokens?: number;
}

export interface ActiveTurnCompactionDependencies {
	loadPolicy: (
		cwd: string,
		projectTrusted: boolean,
	) => ActiveTurnCompactionPolicy;
	canCompact: (entries: SessionEntry[], keepRecentTokens: number) => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadActiveTurnCompactionPolicy(
	cwd: string,
	projectTrusted: boolean,
): ActiveTurnCompactionPolicy {
	const settings = readMergedSettings({
		projectRoot: cwd,
		skipProject: !projectTrusted,
		skipLocal: !projectTrusted,
	});
	const compaction = isRecord(settings.compaction) ? settings.compaction : {};
	const activeTurnCompaction = isRecord(settings.activeTurnCompaction)
		? settings.activeTurnCompaction
		: {};
	const reserveTokens = compaction.reserveTokens;
	const keepRecentTokens = compaction.keepRecentTokens;
	const softLimitTokens = activeTurnCompaction.softLimitTokens;
	const softLimitMaxContextWindowTokens =
		activeTurnCompaction.softLimitMaxContextWindowTokens;
	return {
		enabled: compaction.enabled !== false,
		reserveTokens:
			typeof reserveTokens === "number" &&
			Number.isFinite(reserveTokens) &&
			reserveTokens >= 0
				? reserveTokens
				: DEFAULT_RESERVE_TOKENS,
		keepRecentTokens:
			typeof keepRecentTokens === "number" &&
			Number.isFinite(keepRecentTokens) &&
			keepRecentTokens >= 0
				? keepRecentTokens
				: DEFAULT_KEEP_RECENT_TOKENS,
		softLimitTokens:
			typeof softLimitTokens === "number" &&
			Number.isFinite(softLimitTokens) &&
			softLimitTokens > 0
				? softLimitTokens
				: undefined,
		softLimitMaxContextWindowTokens:
			typeof softLimitMaxContextWindowTokens === "number" &&
			Number.isFinite(softLimitMaxContextWindowTokens) &&
			softLimitMaxContextWindowTokens > 0
				? softLimitMaxContextWindowTokens
				: undefined,
	};
}

export function hasCompactableContent(
	entries: SessionEntry[],
	keepRecentTokens: number,
): boolean {
	if (entries.length === 0 || entries[entries.length - 1]?.type === "compaction")
		return false;

	let boundaryStart = 0;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "compaction") continue;
		const firstKeptIndex = entries.findIndex(
			(candidate) => candidate.id === entry.firstKeptEntryId,
		);
		boundaryStart = firstKeptIndex >= 0 ? firstKeptIndex : index + 1;
		break;
	}

	const cutPoint = findCutPoint(
		entries,
		boundaryStart,
		entries.length,
		keepRecentTokens,
	);
	if (!entries[cutPoint.firstKeptEntryIndex]?.id) return false;

	const historyEnd = cutPoint.isSplitTurn
		? cutPoint.turnStartIndex
		: cutPoint.firstKeptEntryIndex;
	const hasContextMessages = (start: number, end: number): boolean => {
		for (let index = start; index < end; index += 1) {
			const entry = entries[index];
			if (entry && sessionEntryToContextMessages(entry).length > 0) return true;
		}
		return false;
	};
	return (
		hasContextMessages(boundaryStart, historyEnd) ||
		(cutPoint.isSplitTurn &&
			hasContextMessages(
				cutPoint.turnStartIndex,
				cutPoint.firstKeptEntryIndex,
			))
	);
}

export function shouldCompactDuringActiveTurn(
	usage: ContextUsage | null | undefined,
	policy: ActiveTurnCompactionPolicy,
): boolean {
	if (
		!policy.enabled ||
		!usage ||
		usage.tokens === null ||
		usage.contextWindow <= 0
	)
		return false;
	const hardLimit = usage.contextWindow - policy.reserveTokens;
	let triggerLimit = hardLimit;
	if (
		policy.softLimitTokens !== undefined &&
		(policy.softLimitMaxContextWindowTokens === undefined ||
			usage.contextWindow <= policy.softLimitMaxContextWindowTokens)
	) {
		triggerLimit = Math.min(hardLimit, policy.softLimitTokens);
	}
	return usage.tokens > triggerLimit;
}

export function registerActiveTurnCompaction(
	pi: ExtensionAPI,
	dependencies: Partial<ActiveTurnCompactionDependencies> = {},
): void {
	const loadPolicy = dependencies.loadPolicy ?? loadActiveTurnCompactionPolicy;
	const canCompact = dependencies.canCompact ?? hasCompactableContent;
	let policy: ActiveTurnCompactionPolicy = {
		enabled: true,
		reserveTokens: DEFAULT_RESERVE_TOKENS,
		keepRecentTokens: DEFAULT_KEEP_RECENT_TOKENS,
	};
	let generation = 0;
	let compactionPending = false;
	let compactionAbortArtifactPending = false;
	let manualCompactionStarted = false;
	let pendingGeneration = 0;
	let attemptedAboveThreshold = false;
	let failureCircuitOpen = false;

	const resumeRequest = (ctx?: ExtensionContext) => {
		if (ctx?.hasPendingMessages()) return;
		pi.sendMessage(
			{
				customType: CONTINUATION_TYPE,
				content: CONTINUATION_INSTRUCTIONS,
				display: false,
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	};

	const startManualCompaction = (ctx: ExtensionContext) => {
		if (
			!compactionPending ||
			manualCompactionStarted ||
			generation !== pendingGeneration
		)
			return;

		manualCompactionStarted = true;
		const triggerGeneration = pendingGeneration;
		ctx.compact({
			customInstructions: COMPACTION_HANDOFF_INSTRUCTIONS,
			onComplete: () => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				compactionAbortArtifactPending = false;
				manualCompactionStarted = false;
				resumeRequest(ctx);
			},
			onError: (error) => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				compactionAbortArtifactPending = false;
				manualCompactionStarted = false;
				if (
					error.name !== "AbortError" &&
					error.message !== "Compaction cancelled"
				) {
					const reportFailure = !failureCircuitOpen;
					failureCircuitOpen = true;
					if (reportFailure)
						reportActionableExtensionFailure(pi, ctx, {
							extension: "active-turn-compaction",
							failure: error.message,
							impact: "Automatic threshold compaction is disabled for the remainder of this session.",
							nextAction: "Continue with the retained context and avoid assuming compaction succeeded.",
						}, { deliverAs: "followUp" });
					resumeRequest(ctx);
				}
			},
		});
	};

	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		generation += 1;
		try {
			policy = loadPolicy(ctx.cwd, ctx.isProjectTrusted());
		} catch (error) {
			const message = `Active-turn compaction policy failed to load: ${error instanceof Error ? error.message : String(error)}`;
			throw new Error(message, { cause: error });
		}
		compactionPending = false;
		compactionAbortArtifactPending = false;
		manualCompactionStarted = false;
		pendingGeneration = generation;
		attemptedAboveThreshold = false;
		failureCircuitOpen = false;
	});

	pi.on("session_shutdown", () => {
		generation += 1;
		compactionPending = false;
		compactionAbortArtifactPending = false;
		manualCompactionStarted = false;
	});

	pi.on("session_before_compact", (event) => {
		if (event.reason === "threshold" && failureCircuitOpen)
			return { cancel: true };
		return undefined;
	});

	pi.on("session_compact", (event, ctx) => {
		failureCircuitOpen = false;
		attemptedAboveThreshold = false;
		if (
			!compactionPending ||
			manualCompactionStarted ||
			generation !== pendingGeneration
		)
			return;

		compactionPending = false;
		compactionAbortArtifactPending = false;
		if (event.reason === "overflow" && event.willRetry) return;
		resumeRequest(ctx);
	});

	pi.on("session_compact_failed", (event, ctx) => {
		if (event.reason !== "threshold" || event.aborted) return;
		if (!failureCircuitOpen) {
			reportActionableExtensionFailure(pi, ctx, {
				extension: "active-turn-compaction",
				failure: event.errorMessage ?? "Threshold compaction failed.",
				impact: "Automatic threshold compaction is disabled for the remainder of this session.",
				nextAction: "Continue with the retained context and avoid assuming compaction succeeded.",
			});
		}
		failureCircuitOpen = true;
		attemptedAboveThreshold = true;
	});

	pi.on("agent_settled", (_event, ctx) => {
		startManualCompaction(ctx);
	});

	pi.on("message_end", (event) => {
		const message = event.message;
		if (
			!compactionPending ||
			!compactionAbortArtifactPending ||
			message.role !== "assistant" ||
			message.stopReason !== "error" ||
			message.errorMessage !== "This operation was aborted" ||
			message.content.length > 0
		) {
			return;
		}
		compactionAbortArtifactPending = false;
		const { errorMessage: _errorMessage, ...rest } = message;
		return { message: { ...rest, stopReason: "stop" as const } };
	});

	pi.on("turn_end", (event, ctx) => {
		const usage = ctx.getContextUsage();
		if (!shouldCompactDuringActiveTurn(usage, policy)) {
			attemptedAboveThreshold = false;
			return;
		}
		if (
			event.toolResults.length === 0 ||
			ctx.hasPendingMessages() ||
			compactionPending ||
			attemptedAboveThreshold ||
			failureCircuitOpen
		) {
			return;
		}
		if (
			!canCompact(
				ctx.sessionManager.getBranch(),
				policy.keepRecentTokens,
			)
		)
			return;

		compactionPending = true;
		manualCompactionStarted = false;
		pendingGeneration = generation;
		attemptedAboveThreshold = true;
		compactionAbortArtifactPending = true;
		ctx.abort();
	});
}

export default function activeTurnCompaction(pi: ExtensionAPI): void {
	registerActiveTurnCompaction(pi);
}
