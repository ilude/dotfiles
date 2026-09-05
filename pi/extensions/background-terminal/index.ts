import { onSessionStart } from "../../lib/session-start-metrics.js";
import { registerSlashCommand } from "../../lib/slash-command-echo.js";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	getBackgroundTerminalManager,
	type BackgroundTerminalSnapshot,
} from "./manager.js";
import { openBackgroundTerminalDashboard } from "./ui.js";
import { formatTranscriptTiming } from "../../lib/tool-timing.js";
import { reportActionableExtensionFailure } from "../../lib/extension-diagnostics.js";
import {
	captureDeliveryOrigin,
	deliveryId,
	deliveryOriginMatches,
	receiptFailureLabel,
	requireReceiptDelivery,
	isExpectedDeliveryCancellation,
	sendWithReceipt,
	type DeliveryOrigin,
} from "../../lib/background-delivery.js";

const COMPLETION_MAX_BYTES = 32 * 1024;
function truncateUtf8Tail(text: string, maxBytes: number): string {
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const midpoint = Math.floor((low + high) / 2);
		if (Buffer.byteLength(text.slice(midpoint), "utf8") <= maxBytes) {
			high = midpoint;
		} else {
			low = midpoint + 1;
		}
	}
	let start = low;
	const first = text.charCodeAt(start);
	if (first >= 0xdc00 && first <= 0xdfff) start += 1;
	return text.slice(start);
}

function formatTerminal(snapshot: BackgroundTerminalSnapshot): string {
	const lines = [
		`${snapshot.id} ${snapshot.status}: ${snapshot.title}`,
		`cwd: ${snapshot.cwd}`,
		`pid: ${snapshot.pid ?? "unknown"}`,
		`exit: ${snapshot.exitCode ?? "-"}${snapshot.signal ? ` (${snapshot.signal})` : ""}`,
	];
	if (snapshot.error) lines.push(`error: ${snapshot.error}`);
	if (snapshot.stdout) lines.push(`stdout:\n${snapshot.stdout}`);
	if (snapshot.stderr) lines.push(`stderr:\n${snapshot.stderr}`);
	if (!snapshot.stdout && !snapshot.stderr) lines.push("(no output)");
	if (snapshot.stdoutTruncated || snapshot.stderrTruncated) {
		lines.push(
			`output capped in memory; logs: ${snapshot.stdoutPath ?? "unavailable"}, ${snapshot.stderrPath ?? "unavailable"}`,
		);
	}
	const timing = formatTranscriptTiming(
		snapshot.startedAt,
		snapshot.endedAt === undefined ? undefined : snapshot.endedAt - snapshot.startedAt,
	);
	if (timing) lines.push(timing);
	const text = lines.join("\n");
	if (Buffer.byteLength(text, "utf8") <= COMPLETION_MAX_BYTES) return text;
	return `[... earlier output omitted ...]\n${truncateUtf8Tail(text, COMPLETION_MAX_BYTES - 35)}`;
}

function resolveWorkingDirectory(cwd: string, input?: string): string {
	const directory = input?.trim();
	const resolved = directory
		? isAbsolute(directory)
			? directory
			: resolve(cwd, directory)
		: cwd;
	if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
		throw new Error(`Working directory does not exist: ${resolved}`);
	}
	return resolved;
}

function textResult(text: string, details?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

export default function backgroundTerminalExtension(pi: ExtensionAPI): void {
	const manager = getBackgroundTerminalManager();
	let sessionOpen = false;
	let unsubscribeSettled: (() => void) | undefined;
	const pending = new Map<string, BackgroundTerminalSnapshot>();
	let deliveryScheduled = false;
	let deliveryInFlight = false;
	let deliveryDrainRequested = false;
	let deliveryGeneration = 0;
	let receiptSender: ReturnType<typeof requireReceiptDelivery> | undefined;
	let activeOrigin: DeliveryOrigin | undefined;

	let currentContext: ExtensionContext | undefined;

	const hasReadyPendingDelivery = (): boolean => {
		if (!sessionOpen || !activeOrigin || !currentContext) return false;
		for (const [id, queued] of pending) {
			const snapshot = manager.get(id) ?? queued;
			const state = manager.deliveryState(id);
			if (
				manager.hasPendingCompletion(id) &&
				snapshot.origin &&
				state?.phase === "pending" &&
				state.retryGate === "none" &&
				deliveryOriginMatches(snapshot.origin, activeOrigin)
			)
				return true;
		}
		return false;
	};

	const scheduleDelivery = () => {
		if (deliveryInFlight) {
			deliveryDrainRequested = true;
			return;
		}
		if (deliveryScheduled) return;
		deliveryScheduled = true;
		queueMicrotask(() => void flushPending());
	};

	const flushPending = async () => {
		if (deliveryInFlight) {
			deliveryDrainRequested = true;
			return;
		}
		deliveryScheduled = false;
		if (!sessionOpen || !activeOrigin || !currentContext) return;
		const context = currentContext;
		const generation = deliveryGeneration;
		deliveryInFlight = true;
		try {
			for (const [id, queued] of pending) {
				if (!sessionOpen || generation !== deliveryGeneration) break;
				const snapshot = manager.get(id) ?? queued;
				if (!manager.hasPendingCompletion(id)) {
					pending.delete(id);
					continue;
				}
				if (!snapshot.origin) {
					if (
						generation === deliveryGeneration &&
						sessionOpen &&
						currentContext === context &&
						manager.markDeliveryFailureReported(id)
					)
						reportActionableExtensionFailure(pi, context, {
							extension: "background-terminal",
							failure: "A legacy background terminal completion has no reliable parent origin.",
							impact: "The completion is retained but cannot be routed safely.",
							nextAction: "Inspect the original session and workspace; do not infer origin from worker metadata.",
						}, { level: "warning" });
					continue;
				}
				if (!deliveryOriginMatches(snapshot.origin, activeOrigin)) continue;
				const completion = manager.beginCompletionDelivery(id);
				if (!completion) continue;
				const message = {
					customType: "background-terminal-result",
					content: `Background terminal ${id} ${completion.status}.\n\n${formatTerminal(completion)}`,
					display: true,
					details: {
						id,
						status: completion.status,
						exitCode: completion.exitCode,
						startedAt: completion.startedAt,
						endedAt: completion.endedAt,
					},
				};
				try {
					const receipt = await sendWithReceipt(
						receiptSender ?? requireReceiptDelivery(pi),
						message,
						snapshot.origin,
						deliveryId("background-terminal", id),
					);
					manager.finishCompletionDelivery(id, snapshot.origin, receipt);
					const current =
						generation === deliveryGeneration &&
						sessionOpen &&
						currentContext === context &&
						activeOrigin !== undefined &&
						deliveryOriginMatches(snapshot.origin, activeOrigin);
					if (
						(receipt.status === "rejected" || receipt.status === "uncertain") &&
						current &&
						manager.markDeliveryFailureReported(id)
					)
						reportActionableExtensionFailure(pi, context, {
							extension: "background-terminal",
							failure: `Background terminal completion ${receiptFailureLabel(receipt) ?? "was not inserted"}.`,
							impact: "The completion remains retained and automatic delivery is paused according to the receipt state.",
							nextAction: "Inspect the original session and provide later interactive input before retrying, unless the receipt is uncertain.",
						});
					if (receipt.status === "inserted") pending.delete(id);
				} catch (error) {
					const cancellation = isExpectedDeliveryCancellation(error);
					manager.finishCompletionDelivery(id, snapshot.origin, cancellation
						? {
								status: "discarded",
							deliveryId: deliveryId("background-terminal", id),
							sessionId: snapshot.origin.parentSessionId,
							reason: "aborted",
						}
						: {
								status: "uncertain",
								deliveryId: deliveryId("background-terminal", id),
								sessionId: snapshot.origin.parentSessionId,
							error: new Error("Acknowledged delivery did not settle."),
							});
					if (
						!cancellation &&
						generation === deliveryGeneration &&
						sessionOpen &&
						currentContext === context &&
						activeOrigin !== undefined &&
						deliveryOriginMatches(snapshot.origin, activeOrigin) &&
						manager.markDeliveryFailureReported(id)
					)
						reportActionableExtensionFailure(pi, context, {
							extension: "background-terminal",
							failure: "Acknowledged background terminal completion delivery became uncertain.",
							impact: "The completion is retained without blind retry.",
							nextAction: "Inspect the original session and completion state.",
						});
				}
			}
		} finally {
			deliveryInFlight = false;
			deliveryDrainRequested = false;
			if (hasReadyPendingDelivery()) scheduleDelivery();
		}
	};

	pi.registerTool({
		name: "bg_start",
		label: "Start Background Terminal",
		description:
			"Start a managed Bash command asynchronously. The command passes through damage-control before execution.",
		promptGuidelines: [
			"Use bg_start for long-lived servers, watchers, and concurrent shell work, not as a substitute for ordinary awaited bash commands.",
			"Background terminal commands use Bash syntax on macOS and Windows and are evaluated by damage-control before execution; do not append &, nohup, or disown because bg_start already runs asynchronously.",
			"Do not poll for completion. Completion is delivered automatically. /ps is operator-facing and is not a model tool.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Bash command to run" }),
			title: Type.Optional(
				Type.String({ description: "Short dashboard label", maxLength: 120 }),
			),
			working_dir: Type.Optional(
				Type.String({ description: "Working directory; defaults to current cwd" }),
			),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const origin = captureDeliveryOrigin({
				cwd: ctx.cwd,
				sessionId: ctx.sessionManager?.getSessionId?.(),
			});
			const sender = requireReceiptDelivery(pi);
			const snapshot = manager.start({
				command: params.command,
				title: params.title,
				cwd: resolveWorkingDirectory(ctx.cwd, params.working_dir),
				origin,
			});
			receiptSender = sender;
			const timing = formatTranscriptTiming(snapshot.startedAt, undefined);
			return textResult(
				`Started ${snapshot.id} (pid ${snapshot.pid ?? "unknown"}): ${snapshot.title}\nCompletion will be delivered automatically. Use /ps for live output or bg_kill to stop it.${timing ? `\n${timing}` : ""}`,
				{ id: snapshot.id, pid: snapshot.pid, status: snapshot.status, startedAt: snapshot.startedAt },
			);
		},
	});


	pi.registerTool({
		name: "bg_kill",
		label: "Kill Background Terminals",
		description:
			"Terminate one or more managed background terminals and wait for settlement.",
		parameters: Type.Object({
			ids: Type.Array(Type.String(), { minItems: 1, maxItems: 16 }),
		}),
		execute: async (_toolCallId, params) => {
			const results = await manager.kill(params.ids, true);
			return textResult(
				results
					.map((result) => {
						if (!result.found) return `${result.id}: not found`;
						if (!result.wasRunning) {
							return `${result.id}: already ${result.snapshot?.status ?? "settled"}`;
						}
						if (result.snapshot?.status === "running") {
							return `${result.id}: still running - ${result.snapshot.error ?? "termination was not confirmed"}`;
						}
						return `${result.id}: ${result.snapshot?.status ?? "killed"}`;
					})
					.join("\n"),
				{ ids: results.map((result) => result.id) },
			);
		},
	});

	registerSlashCommand(pi)("ps", {
		description: "Open the managed background terminal dashboard",
		handler: async (_args, ctx) => {
			await openBackgroundTerminalDashboard(ctx, manager);
		},
	});

	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		deliveryGeneration++;
		sessionOpen = true;
		currentContext = ctx;
		try {
			activeOrigin = captureDeliveryOrigin({
				cwd: ctx.cwd,
				sessionId: ctx.sessionManager?.getSessionId?.(),
			});
		} catch (error) {
			activeOrigin = undefined;
			reportActionableExtensionFailure(pi, ctx, {
				extension: "background-terminal",
				failure: `Could not capture the parent delivery origin: ${error instanceof Error ? error.message : String(error)}`,
				impact: "Background terminal completions are retained but delivery is disabled for this session.",
				nextAction: "Resume with an existing session ID and an accessible current workspace.",
			}, { level: "warning" });
		}
		unsubscribeSettled?.();
		unsubscribeSettled = manager.onSettled((snapshot, consumed) => {
			if (consumed || !sessionOpen) return;
			pending.set(snapshot.id, snapshot);
			scheduleDelivery();
		});
		for (const snapshot of manager.pendingCompletions()) {
			pending.set(snapshot.id, snapshot);
		}
		if (activeOrigin) manager.resumeCompletionDeliveries("session-start", activeOrigin);
		if (pending.size > 0) scheduleDelivery();
	});
	pi.on("agent_settled", () => {
		if (pending.size > 0) scheduleDelivery();
	});
	pi.on("input", (event, ctx) => {
		if (event.source !== "interactive") return;
		try {
			activeOrigin = captureDeliveryOrigin({
				cwd: ctx.cwd,
				sessionId: ctx.sessionManager?.getSessionId?.(),
			});
		} catch {
			activeOrigin = undefined;
		}
		if (activeOrigin) manager.resumeCompletionDeliveries("interactive", activeOrigin);
		scheduleDelivery();
	});
	pi.on("session_shutdown", async (event) => {
		deliveryGeneration++;
		sessionOpen = false;
		activeOrigin = undefined;
		currentContext = undefined;
		pending.clear();
		unsubscribeSettled?.();
		unsubscribeSettled = undefined;
		if (event.reason === "quit") await manager.dispose();
	});
}
