import { onSessionStart } from "../lib/session-start-metrics.js";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { listTasks } from "../lib/task-registry.js";
import { isTaskStoreUnavailable } from "../lib/task-store.js";
import {
	filterCurrentSessionActiveTasks,
	formatTaskStatus,
	summarizeTaskCounts,
} from "./operator-status.js";
import { subagentRunManager } from "./subagent/run-manager.js";

const METADATA_SOURCE = "pi:metadata";
const METADATA_VALUE_MAX_LENGTH = 80;
const METADATA_TIMEOUT_MS = 5_000;
const TOKEN_ORDER = ["model", "context", "subagents", "tasks"] as const;

type MetadataToken = (typeof TOKEN_ORDER)[number];
type MetadataPatch = Partial<Record<MetadataToken, string | undefined>>;

export function isHerdrMetadataEnvironment(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return (
		env.HERDR_ENV === "1" &&
		Boolean(env.HERDR_PANE_ID?.trim()) &&
		Boolean(env.HERDR_SOCKET_PATH?.trim())
	);
}

export function normalizeHerdrMetadataValue(
	value: string | undefined,
): string | undefined {
	if (value === undefined) return undefined;
	const normalized = Array.from(value, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint < 32 || codePoint === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized) return undefined;
	return Array.from(normalized).slice(0, METADATA_VALUE_MAX_LENGTH).join("");
}

function formatModel(ctx: ExtensionContext): string | undefined {
	return normalizeHerdrMetadataValue(ctx.model?.id || ctx.model?.name);
}

function formatContext(ctx: ExtensionContext): string | undefined {
	const percent = ctx.getContextUsage?.()?.percent;
	if (percent === null || percent === undefined || !Number.isFinite(percent))
		return undefined;
	return `ctx ${Math.round(percent)}%`;
}

function formatSubagents(): string | undefined {
	const running = subagentRunManager
		.list()
		.filter((snapshot) => snapshot.status === "running").length;
	return running > 0 ? `subagents ${running}` : undefined;
}

function formatTasks(sessionId: string): string | undefined {
	try {
		const counts = summarizeTaskCounts(
			filterCurrentSessionActiveTasks(listTasks(), sessionId),
		);
		return formatTaskStatus(counts) ?? undefined;
	} catch (error) {
		if (isTaskStoreUnavailable(error)) return undefined;
		throw error;
	}
}

function contextPatch(ctx: ExtensionContext): MetadataPatch {
	return {
		model: formatModel(ctx),
		context: formatContext(ctx),
	};
}

export default function (pi: ExtensionAPI) {
	if (!isHerdrMetadataEnvironment()) return;

	const paneId = process.env.HERDR_PANE_ID!.trim();
	const executable = process.env.HERDR_BIN_PATH?.trim() || "herdr";
	const desired = new Map<MetadataToken, string | undefined>();
	let reportSeq = Date.now() * 1_000;
	let writeChain = Promise.resolve();
	let sessionId: string | undefined;
	let unsubscribeSubagents: (() => void) | undefined;

	function publish(
			patch: MetadataPatch | (() => MetadataPatch),
			force = false,
		): Promise<void> {
		const operation = writeChain.then(async () => {
			const resolvedPatch = typeof patch === "function" ? patch() : patch;
			const changed: Array<[MetadataToken, string | undefined]> = [];
			for (const token of TOKEN_ORDER) {
				if (!(token in resolvedPatch)) continue;
				const value = normalizeHerdrMetadataValue(resolvedPatch[token]);
				if (!force && desired.has(token) && desired.get(token) === value)
					continue;
				desired.set(token, value);
				changed.push([token, value]);
			}
			if (changed.length === 0) return;

			reportSeq += 1;
			const args = [
				"pane",
				"report-metadata",
				paneId,
				"--source",
				METADATA_SOURCE,
				"--seq",
				String(reportSeq),
			];
			for (const [token, value] of changed) {
				if (value === undefined) args.push("--clear-token", token);
				else args.push("--token", `${token}=${value}`);
			}

			const result = await pi.exec(executable, args, {
				timeout: METADATA_TIMEOUT_MS,
			});
			if (result.killed)
				throw new Error("Herdr metadata report was terminated.");
			if (result.code !== 0) {
				const detail = (result.stderr || result.stdout).trim();
				throw new Error(
					detail || `Herdr metadata report failed with exit code ${result.code}.`,
				);
			}
		});
		writeChain = operation.catch(() => {});
		return operation;
	}

	function publishSubagents(): Promise<void> {
		return publish({ subagents: formatSubagents() });
	}

	function publishContextAndTasks(ctx: ExtensionContext): Promise<void> {
		return publish({
			...contextPatch(ctx),
			tasks: sessionId ? formatTasks(sessionId) : undefined,
		});
	}

	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		sessionId = ctx.sessionManager.getSessionId();
		const startupSessionId = sessionId;
		unsubscribeSubagents?.();
		unsubscribeSubagents = subagentRunManager.subscribe(() => {
			void publishSubagents().catch((error) => {
				console.error(
					`Herdr metadata update failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
		});
		void publish(
			() => ({
				...contextPatch(ctx),
				subagents: formatSubagents(),
				tasks: formatTasks(startupSessionId),
			}),
			true,
		).catch((error) => {
			console.error(
				`Herdr metadata update failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		});
	});

	pi.on("model_select", async (_event, ctx) => {
		if (!sessionId) return;
		await publish(contextPatch(ctx));
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!sessionId) return;
		await publishContextAndTasks(ctx);
	});

	pi.on("tool_result", async (_event, ctx) => {
		if (!sessionId) return;
		await publishContextAndTasks(ctx);
	});

	pi.on("session_shutdown", async () => {
		unsubscribeSubagents?.();
		unsubscribeSubagents = undefined;
		sessionId = undefined;
		await writeChain;
	});
}
