import type {
	ContextUsage,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { uiNotify } from "../lib/extension-utils.js";
import { readMergedSettings } from "../lib/settings-loader.js";

const DEFAULT_RESERVE_TOKENS = 16_384;
const CONTINUATION_TYPE = "active-turn-compaction.continue";

export interface ActiveTurnCompactionPolicy {
	enabled: boolean;
	reserveTokens: number;
}

export interface ActiveTurnCompactionDependencies {
	loadPolicy: (
		cwd: string,
		projectTrusted: boolean,
	) => ActiveTurnCompactionPolicy;
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
	const reserveTokens = compaction.reserveTokens;
	return {
		enabled: compaction.enabled !== false,
		reserveTokens:
			typeof reserveTokens === "number" &&
			Number.isFinite(reserveTokens) &&
			reserveTokens >= 0
				? reserveTokens
				: DEFAULT_RESERVE_TOKENS,
	};
}

export function shouldCompactDuringActiveTurn(
	usage: ContextUsage | null | undefined,
	policy: ActiveTurnCompactionPolicy,
): boolean {
	return Boolean(
		policy.enabled &&
			usage &&
			usage.tokens !== null &&
			usage.contextWindow > 0 &&
			usage.tokens > usage.contextWindow - policy.reserveTokens,
	);
}

export function registerActiveTurnCompaction(
	pi: ExtensionAPI,
	dependencies: Partial<ActiveTurnCompactionDependencies> = {},
): void {
	const loadPolicy = dependencies.loadPolicy ?? loadActiveTurnCompactionPolicy;
	let policy: ActiveTurnCompactionPolicy = {
		enabled: true,
		reserveTokens: DEFAULT_RESERVE_TOKENS,
	};
	let generation = 0;
	let compactionPending = false;
	let attemptedAboveThreshold = false;
	let failureCircuitOpen = false;

	pi.on("session_start", (_event, ctx) => {
		generation += 1;
		policy = loadPolicy(ctx.cwd, ctx.isProjectTrusted());
		compactionPending = false;
		attemptedAboveThreshold = false;
		failureCircuitOpen = false;
	});

	pi.on("session_shutdown", () => {
		generation += 1;
		compactionPending = false;
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

		ctx.compact({
			onComplete: () => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				uiNotify(ctx, "success", "Compaction completed; continuing the request.", {
					prefix: "auto-compact",
				});
				resumeRequest();
			},
			onError: (error) => {
				if (generation !== triggerGeneration) return;
				compactionPending = false;
				uiNotify(ctx, "error", `Compaction failed: ${error.message}`, {
					prefix: "auto-compact",
				});
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
