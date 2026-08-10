import {
	findCutPoint,
	sessionEntryToContextMessages,
	type ContextUsage,
	type ExtensionAPI,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import { readMergedSettings } from "../lib/settings-loader.js";

const DEFAULT_RESERVE_TOKENS = 16_384;
const DEFAULT_KEEP_RECENT_TOKENS = 20_000;
const CONTINUATION_TYPE = "active-turn-compaction.continue";

export interface ActiveTurnCompactionPolicy {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
	softLimitTokens?: number;
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
	const triggerLimit =
		policy.softLimitTokens === undefined
			? hardLimit
			: Math.min(hardLimit, policy.softLimitTokens);
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
	let attemptedAboveThreshold = false;
	let failureCircuitOpen = false;

	pi.on("session_start", (_event, ctx) => {
		generation += 1;
		policy = loadPolicy(ctx.cwd, ctx.isProjectTrusted());
		compactionPending = false;
		compactionAbortArtifactPending = false;
		attemptedAboveThreshold = false;
		failureCircuitOpen = false;
	});

	pi.on("session_shutdown", () => {
		generation += 1;
		compactionPending = false;
		compactionAbortArtifactPending = false;
	});

	pi.on("session_before_compact", (event) => {
		if (failureCircuitOpen && event.reason === "threshold")
			return { cancel: true };
		return undefined;
	});

	pi.on("session_compact", () => {
		failureCircuitOpen = false;
		attemptedAboveThreshold = false;
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
		attemptedAboveThreshold = true;
		const triggerGeneration = generation;
		uiNotify(
			ctx,
			"info",
			"Compacting context before continuing the active request.",
			{ prefix: "auto-compact" },
		);

		const resumeRequest = () => {
			pi.sendMessage(
				{
					customType: CONTINUATION_TYPE,
					content:
						"Continue working on the current user request from the compaction summary. Do not treat compaction as completion.",
					display: false,
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		};

		compactionAbortArtifactPending = true;
		ctx.compact({
			onComplete: () => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				compactionAbortArtifactPending = false;
				uiNotify(ctx, "success", "Compaction completed; continuing the request.", {
					prefix: "auto-compact",
				});
				resumeRequest();
			},
			onError: (error) => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				compactionAbortArtifactPending = false;
				if (error.name !== "AbortError" && error.message !== "Compaction cancelled") {
					failureCircuitOpen = true;
					resumeRequest();
				}
			},
		});
	});
}

export default function activeTurnCompaction(pi: ExtensionAPI): void {
	registerActiveTurnCompaction(pi);
}
