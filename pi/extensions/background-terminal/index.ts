import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { activateTools, deactivateTools } from "../../lib/tool-activation.js";
import {
	getBackgroundTerminalManager,
	type BackgroundTerminalSnapshot,
} from "./manager.js";
import {
	formatBackgroundTerminalActivity,
	openBackgroundTerminalDashboard,
} from "./ui.js";

const COMPLETION_MAX_BYTES = 32 * 1024;
const BACKGROUND_CONTROL_TOOL_NAMES = [
	"bg_status",
	"bg_list",
	"bg_kill",
] as const;

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
	let widgetContext:
		| Parameters<Parameters<ExtensionAPI["on"]>[1]>[1]
		| undefined;
	let unsubscribeManager: (() => void) | undefined;
	let unsubscribeSettled: (() => void) | undefined;
	const pending = new Map<string, BackgroundTerminalSnapshot>();
	let deliveryScheduled = false;

	const updateWidget = () => {
		if (!widgetContext) return;
		const activity = formatBackgroundTerminalActivity(manager.list());
		widgetContext.ui.setWidget("background-terminals", activity ? [activity] : undefined);
	};

	const flushPending = () => {
		deliveryScheduled = false;
		if (!sessionOpen) return;
		for (const [id, snapshot] of pending) {
			if (!manager.hasPendingCompletion(id)) {
				pending.delete(id);
				continue;
			}
			try {
				pi.sendMessage(
					{
						customType: "background-terminal-result",
						content: `Background terminal ${id} ${snapshot.status}.\n\n${formatTerminal(snapshot)}`,
						display: true,
						details: {
							id,
							status: snapshot.status,
							exitCode: snapshot.exitCode,
						},
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);
				manager.consumeCompletion(id);
				pending.delete(id);
			} catch {
				// Keep the result pending and retry after the next settled agent turn.
			}
		}
	};

	const scheduleDelivery = () => {
		if (deliveryScheduled) return;
		deliveryScheduled = true;
		queueMicrotask(flushPending);
	};

	pi.registerTool({
		name: "bg_start",
		label: "Start Background Terminal",
		description:
			"Start a managed Bash command asynchronously. The command passes through damage-control before execution.",
		promptGuidelines: [
			"Use bg_start for long-lived servers, watchers, and concurrent shell work, not as a substitute for ordinary awaited bash commands.",
			"Background terminal commands use Bash syntax on macOS and Windows and are evaluated by damage-control before execution; do not append &, nohup, or disown because bg_start already runs asynchronously.",
			"Do not poll bg_status in a loop. Completion is delivered automatically; use bg_status or /ps only when current output is needed.",
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
			const snapshot = manager.start({
				command: params.command,
				title: params.title,
				cwd: resolveWorkingDirectory(ctx.cwd, params.working_dir),
			});
			activateTools(pi, BACKGROUND_CONTROL_TOOL_NAMES);
			return textResult(
				`Started ${snapshot.id} (pid ${snapshot.pid ?? "unknown"}): ${snapshot.title}\nCompletion will be delivered automatically. Use /ps for live output or bg_kill to stop it.`,
				{ id: snapshot.id, pid: snapshot.pid, status: snapshot.status },
			);
		},
	});

	pi.registerTool({
		name: "bg_status",
		label: "Background Terminal Status",
		description: "Inspect the latest bounded output for one background terminal.",
		parameters: Type.Object({
			id: Type.String({ description: "Background terminal ID, for example bg-1" }),
		}),
		execute: async (_toolCallId, params) => {
			const snapshot = manager.get(params.id);
			if (!snapshot) {
				return textResult(`Background terminal not found: ${params.id}`, {
					id: params.id,
					found: false,
				});
			}
			return textResult(formatTerminal(snapshot), {
				id: snapshot.id,
				status: snapshot.status,
				exitCode: snapshot.exitCode,
			});
		},
	});

	pi.registerTool({
		name: "bg_list",
		label: "List Background Terminals",
		description: "List managed background terminals and their current states.",
		parameters: Type.Object({}),
		execute: async () => {
			const snapshots = manager.list();
			if (snapshots.length === 0) return textResult("No background terminals are tracked.");
			return textResult(
				snapshots
					.map(
						(item) =>
							`${item.id}\t${item.status}\tpid=${item.pid ?? "?"}\t${item.title}`,
					)
					.join("\n"),
				{ count: snapshots.length },
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

	pi.registerCommand("ps", {
		description: "Open the managed background terminal dashboard",
		handler: async (_args, ctx) => {
			await openBackgroundTerminalDashboard(ctx, manager);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		sessionOpen = true;
		widgetContext = ctx;
		unsubscribeManager?.();
		unsubscribeSettled?.();
		unsubscribeManager = manager.subscribe(updateWidget);
		unsubscribeSettled = manager.onSettled((snapshot, consumed) => {
			if (consumed || !sessionOpen) return;
			pending.set(snapshot.id, snapshot);
			scheduleDelivery();
		});
		for (const snapshot of manager.pendingCompletions()) {
			pending.set(snapshot.id, snapshot);
		}
		if (manager.list().length > 0) {
			activateTools(pi, BACKGROUND_CONTROL_TOOL_NAMES);
		} else {
			deactivateTools(pi, BACKGROUND_CONTROL_TOOL_NAMES);
		}
		updateWidget();
		if (pending.size > 0) scheduleDelivery();
	});
	pi.on("agent_settled", () => {
		if (pending.size > 0) scheduleDelivery();
	});
	pi.on("session_shutdown", async (event) => {
		sessionOpen = false;
		pending.clear();
		unsubscribeManager?.();
		unsubscribeManager = undefined;
		unsubscribeSettled?.();
		unsubscribeSettled = undefined;
		widgetContext?.ui.setWidget("background-terminals", undefined);
		widgetContext = undefined;
		if (event.reason === "quit") await manager.dispose();
	});
}
