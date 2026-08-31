import type {
	ExtensionCommandContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SubagentControlFacade } from "./control.js";
import type {
	SubagentRunManager,
	SubagentRunSnapshot,
	SubagentRunStatus,
} from "./run-manager.js";

export interface SubagentDashboardSelection {
	id?: string;
	index: number;
}

export function formatSubagentActivityStatus(
	runs: ReadonlyArray<Pick<SubagentRunSnapshot, "status">>,
): string | undefined {
	if (runs.length === 0) return undefined;
	const running = runs.filter((run) => run.status === "running").length;
	const failed = runs.filter((run) => run.status === "failed").length;
	const parts = [
		running > 0 ? `${running} running` : "",
		failed > 0 ? `${failed} failed` : "",
	].filter(Boolean);
	return parts.length > 0 ? `subagents ${parts.join(", ")}` : undefined;
}

export function reconcileSubagentDashboardSelection(
	selection: SubagentDashboardSelection,
	runs: ReadonlyArray<Pick<SubagentRunSnapshot, "runId">>,
): void {
	const stableIndex = selection.id
		? runs.findIndex((run) => run.runId === selection.id)
		: -1;
	selection.index =
		stableIndex >= 0
			? stableIndex
			: Math.min(
					Math.max(0, selection.index),
					Math.max(0, runs.length - 1),
				);
	selection.id = runs[selection.index]?.runId;
}

function hierarchyPrefix(run: SubagentRunSnapshot): string {
	if (!run.treeId) return "";
	const indentation = "  ".repeat(Math.max(0, (run.depth ?? 1) - 1));
	return `${indentation}${run.role ?? "worker"} `;
}

function treeMetadata(run: SubagentRunSnapshot): string | undefined {
	if (!run.treeId) return undefined;
	const parts = [
		`tree ${run.treeId}`,
		run.parentRunId ? `parent ${run.parentRunId}` : "",
		run.depth === undefined ? "" : `depth ${run.depth}`,
		run.role ?? "",
		run.workflowPhase ? `phase ${run.workflowPhase}` : "",
		run.taskKey ? `key ${run.taskKey}` : "",
		run.attempt === undefined ? "" : `attempt ${run.attempt}`,
		run.retryOrigin ? `retry ${run.retryOrigin}` : "",
		run.coordinatorTaskId ? `Team Lead ${run.coordinatorTaskId}` : "",
	].filter(Boolean);
	return parts.join(" | ");
}

function elapsed(run: SubagentRunSnapshot): string {
	const end = run.settledAt ?? Date.now();
	const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return minutes > 0
		? `${minutes}m${String(remainder).padStart(2, "0")}s`
		: `${seconds}s`;
}

function localClock(timestamp: number): string {
	const date = new Date(timestamp);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

function localDateTime(timestamp: number): string {
	const date = new Date(timestamp);
	const day = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
	return `${day} ${localClock(timestamp)}`;
}

function activityTimestamp(timestamp: number | undefined): string {
	return timestamp === undefined ? "[time unavailable]" : `[${localClock(timestamp)}]`;
}

function tokenLabel(tokens: number): string {
	if (tokens < 1000) return `${tokens} tok`;
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k tok`;
	return `${(tokens / 1_000_000).toFixed(1)}m tok`;
}

function statusLabel(status: SubagentRunStatus): string {
	switch (status) {
		case "running":
			return "RUN";
		case "completed":
			return "DONE";
		case "failed":
			return "FAIL";
		case "cancelled":
			return "CANCEL";
	}
}

function statusColor(status: SubagentRunStatus): "warning" | "success" | "error" | "muted" {
	switch (status) {
		case "running":
			return "warning";
		case "completed":
			return "success";
		case "failed":
			return "error";
		case "cancelled":
			return "muted";
	}
}

function terminalSafe(value: string): string {
	let result = "";
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code === 0x1b) {
			const introducer = value.charCodeAt(index + 1);
			if (introducer === 0x5d) {
				index += 2;
				while (index < value.length) {
					const current = value.charCodeAt(index);
					if (current === 0x07 || current === 0x9c) break;
					if (
						current === 0x1b &&
						value.charCodeAt(index + 1) === 0x5c
					) {
						index++;
						break;
					}
					index++;
				}
				continue;
			}
			if (introducer === 0x5b) {
				index += 2;
				while (index < value.length) {
					const current = value.charCodeAt(index);
					if (current >= 0x40 && current <= 0x7e) break;
					index++;
				}
				continue;
			}
			index++;
			continue;
		}
		if (code === 0x9b) {
			while (index + 1 < value.length) {
				const current = value.charCodeAt(index + 1);
				index++;
				if (current >= 0x40 && current <= 0x7e) break;
			}
			continue;
		}
		if (
			(code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
			(code >= 0x7f && code <= 0x9f)
		)
			continue;
		result += value[index];
	}
	return result;
}

function oneLine(value: string): string {
	return terminalSafe(value).replace(/\s+/g, " ").trim();
}

function pad(text: string, width: number): string {
	const bounded = truncateToWidth(text, Math.max(0, width));
	return bounded + " ".repeat(Math.max(0, width - visibleWidth(bounded)));
}

function configuredKeys(
	keybindings: KeybindingsManager,
	binding: Parameters<KeybindingsManager["getKeys"]>[0],
): string {
	return keybindings.getKeys(binding).join("/") || "unbound";
}

export async function openSubagentDashboard(
	ctx: ExtensionCommandContext,
	manager: SubagentRunManager,
	filter: (run: SubagentRunSnapshot) => boolean = () => true,
	control?: SubagentControlFacade,
): Promise<void> {
	const selection: SubagentDashboardSelection = { index: 0 };
	while (true) {
		if (manager.list().filter(filter).length === 0) {
			ctx.ui.notify("No subagent runs are tracked in this process.", "info");
			return;
		}
		const selected = await ctx.ui.custom<string | null>(
			(tui, theme, keybindings, done) =>
				new SubagentDashboard(
					tui,
					theme,
					keybindings,
					manager,
					filter,
					selection,
					done,
					control,
				),
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "100%",
					maxHeight: "100%",
				},
			},
		);
		if (!selected) return;
		if (!manager.get(selected)) continue;
		await openSubagentDetail(ctx, manager, selected, control);
	}
}

async function openSubagentDetail(
	ctx: ExtensionCommandContext,
	manager: SubagentRunManager,
	runId: string,
	control?: SubagentControlFacade,
): Promise<void> {
	await ctx.ui.custom<null>(
		(tui, theme, keybindings, done) =>
			new SubagentDetail(tui, theme, keybindings, manager, runId, done, control),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "100%",
				maxHeight: "100%",
			},
		},
	);
}

class SubagentDashboard implements Component {
	private closed = false;
	private controlError?: string;
	private renderTimer?: ReturnType<typeof setTimeout>;
	private readonly ticker: ReturnType<typeof setInterval>;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly manager: SubagentRunManager,
		private readonly filter: (run: SubagentRunSnapshot) => boolean,
		private readonly selection: SubagentDashboardSelection,
		private readonly done: (value: string | null) => void,
		private readonly control?: SubagentControlFacade,
	) {
		this.ticker = setInterval(() => this.tui.requestRender(), 1000);
		this.unsubscribe = manager.subscribe(() => this.scheduleRender());
	}

	dispose(): void {
		this.cleanup();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const runs = this.manager.list().filter(this.filter);
		reconcileSubagentDashboardSelection(this.selection, runs);
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.close(null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.close(runs[this.selection.index]?.runId ?? null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up") || data === "k") {
			if (runs.length > 0) {
				this.selection.index =
					(this.selection.index - 1 + runs.length) % runs.length;
				this.selection.id = runs[this.selection.index]?.runId;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down") || data === "j") {
			if (runs.length > 0) {
				this.selection.index = (this.selection.index + 1) % runs.length;
				this.selection.id = runs[this.selection.index]?.runId;
				this.tui.requestRender();
			}
			return;
		}
		if (data === "x") {
			const run = runs[this.selection.index];
			if (run?.status !== "running") return;
			if (this.control)
				void this.control
					.execute({
						action: "cancel",
						selector: { type: "process", processId: run.runId },
					})
					.catch((error) => {
						this.controlError = error instanceof Error ? error.message : String(error);
						this.tui.requestRender();
					});
			else this.manager.cancelTree(run.runId);
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const runs = this.manager.list().filter(this.filter);
		reconcileSubagentDashboardSelection(this.selection, runs);
		const rows = this.tui.terminal.rows || 30;
		const bodyHeight = Math.max(5, rows - 6);
		const lines = [
			truncateToWidth(
				this.theme.fg("accent", this.theme.bold("Subagent runs")) +
					this.theme.fg("muted", ` (${runs.length} tracked)`),
				safeWidth,
			),
			this.theme.fg("border", "-".repeat(safeWidth)),
		];
		if (this.controlError)
			lines.push(
				truncateToWidth(this.theme.fg("error", this.controlError), safeWidth),
			);
		let start = 0;
		if (runs.length > bodyHeight) {
			start = Math.min(
				Math.max(0, this.selection.index - Math.floor(bodyHeight / 2)),
				runs.length - bodyHeight,
			);
		}
		const visible = runs.slice(start, start + bodyHeight);
		for (let offset = 0; offset < bodyHeight; offset++) {
			const run = visible[offset];
			if (!run) {
				lines.push("");
				continue;
			}
			const index = start + offset;
			const selected = index === this.selection.index;
			const marker = selected ? ">" : " ";
			const status = this.theme.fg(
				statusColor(run.status),
				statusLabel(run.status).padEnd(6),
			);
			const identity = `${hierarchyPrefix(run)}${oneLine(run.agent)} ${run.runId} ${oneLine(run.task)}`;
			const ownership =
				run.owner === "task" && run.taskId
					? `task ${run.taskId}`
					: "direct";
			const usage =
				run.usage.contextPeakTokens > 0
					? ` | ${tokenLabel(run.usage.contextPeakTokens)}`
					: "";
			const outcomes = `process=${run.processOutcome ?? "pending"} | deliverable=${run.deliverableOutcome ?? "pending"}`;
			const right = `pi | ${oneLine(run.model ?? "default")} | ${run.mode} | ${ownership} | ${outcomes}${usage} | start ${localClock(run.startedAt)} local | ${elapsed(run)}`;
			const rightWidth = visibleWidth(right);
			const leftWidth = Math.max(8, safeWidth - rightWidth - 3);
			const left = truncateToWidth(
				`${marker} ${status} ${identity}`,
				leftWidth,
			);
			const gap = Math.max(1, safeWidth - visibleWidth(left) - rightWidth);
			lines.push(
				truncateToWidth(
					`${left}${" ".repeat(gap)}${this.theme.fg("dim", right)}`,
					safeWidth,
				),
			);
		}
		lines.push(this.theme.fg("border", "-".repeat(safeWidth)));
		lines.push(
			truncateToWidth(
				this.theme.fg(
					"dim",
					`${configuredKeys(this.keybindings, "tui.select.up")}/${configuredKeys(this.keybindings, "tui.select.down")}/j/k select | ${configuredKeys(this.keybindings, "tui.select.confirm")} details | x cancel | ${configuredKeys(this.keybindings, "tui.select.cancel")} close`,
				),
				safeWidth,
			),
		);
		return lines.map((line) => pad(line, safeWidth));
	}

	private scheduleRender(): void {
		if (this.renderTimer) return;
		this.renderTimer = setTimeout(() => {
			this.renderTimer = undefined;
			if (!this.closed) this.tui.requestRender();
		}, 50);
	}

	private close(result: string | null): void {
		if (!this.cleanup()) return;
		this.done(result);
	}

	private cleanup(): boolean {
		if (this.closed) return false;
		this.closed = true;
		clearInterval(this.ticker);
		this.unsubscribe();
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = undefined;
		return true;
	}
}

const TRANSCRIPT_SCROLL_STEP = 6;

class SubagentDetail implements Component {
	private closed = false;
	private controlError?: string;
	private scrollOffset = 0;
	private renderTimer?: ReturnType<typeof setTimeout>;
	private readonly ticker: ReturnType<typeof setInterval>;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly manager: SubagentRunManager,
		private readonly runId: string,
		private readonly done: (value: null) => void,
		private readonly control?: SubagentControlFacade,
	) {
		this.ticker = setInterval(() => this.tui.requestRender(), 1000);
		this.unsubscribe = manager.subscribeTo(runId, () => this.scheduleRender());
	}

	dispose(): void {
		this.cleanup();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (
			this.keybindings.matches(data, "app.interrupt") ||
			this.keybindings.matches(data, "tui.select.cancel")
		) {
			this.close();
			return;
		}
		if (data === "x") {
			if (this.control)
				void this.control
					.execute({
						action: "cancel",
						selector: { type: "process", processId: this.runId }
					})
					.catch((error) => {
						this.controlError = error instanceof Error ? error.message : String(error);
						this.tui.requestRender();
					});
			else this.manager.cancelTree(this.runId);
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorUp")) {
			this.scrollOffset += TRANSCRIPT_SCROLL_STEP;
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorDown")) {
			this.scrollOffset = Math.max(
				0,
				this.scrollOffset - TRANSCRIPT_SCROLL_STEP,
			);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.pageUp")) {
			this.scrollOffset += this.viewportHeight();
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.pageDown")) {
			this.scrollOffset = Math.max(
				0,
				this.scrollOffset - this.viewportHeight(),
			);
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const run = this.manager.get(this.runId);
		const border = this.theme.fg("border", "-".repeat(safeWidth));
		if (!run)
			return [
				border,
				truncateToWidth("Run is no longer tracked.", safeWidth),
				border,
			];
		const ownership =
			run.owner === "task" && run.taskId
				? `task ${run.taskId}`
				: "direct transient";
		const usage =
			run.usage.contextPeakTokens > 0
				? ` | ${tokenLabel(run.usage.contextPeakTokens)}`
				: "";
		const header = truncateToWidth(
			`${statusLabel(run.status)} ${oneLine(run.agent)} | pi | ${oneLine(run.model ?? "default")} | ${run.mode} | ${ownership} | process=${run.processOutcome ?? "pending"} | deliverable=${run.deliverableOutcome ?? "pending"}${usage} | ${elapsed(run)}`,
			safeWidth,
		);
		const metadata = truncateToWidth(
			`run ${run.runId} | started ${localDateTime(run.startedAt)} local | ${treeMetadata(run) ?? oneLine(run.cwd)}`,
			safeWidth,
		);
		const task = truncateToWidth(`task: ${oneLine(run.task)}`, safeWidth);
		const body = this.transcriptLines(run, safeWidth);
		const viewport = this.viewportHeight();
		const maxOffset = Math.max(0, body.length - viewport);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const end = body.length - this.scrollOffset;
		const visible = body.slice(Math.max(0, end - viewport), end);
		const lines = [
			border,
			this.theme.fg(statusColor(run.status), header),
			this.theme.fg("dim", metadata),
			this.theme.fg("muted", task),
			...(this.controlError
				? [
						truncateToWidth(
							this.theme.fg("error", this.controlError),
							safeWidth,
						),
					]
				: []),
			border,
			...visible,
		];
		while (lines.length < viewport + 5) lines.push("");
		lines.push(border);
		lines.push(
			truncateToWidth(
				this.theme.fg(
					"dim",
					`x cancel | ${configuredKeys(this.keybindings, "tui.editor.cursorUp")}/${configuredKeys(this.keybindings, "tui.editor.cursorDown")} scroll | ${configuredKeys(this.keybindings, "tui.editor.pageUp")}/${configuredKeys(this.keybindings, "tui.editor.pageDown")} page | ${configuredKeys(this.keybindings, "tui.select.cancel")} back`,
				),
				safeWidth,
			),
		);
		return lines.map((line) => pad(line, safeWidth));
	}

	private transcriptLines(
		run: SubagentRunSnapshot,
		width: number,
	): string[] {
		const lines: string[] = [];
		if (run.errorMessage) {
			lines.push(
				truncateToWidth(
					this.theme.fg("error", `error: ${oneLine(run.errorMessage)}`),
					width,
				),
			);
		}
		for (const item of run.transcript) {
			const prefix =
				item.kind === "assistant"
					? "assistant"
					: item.kind === "thinking"
						? "thinking"
						: item.kind === "tool"
							? `tool ${oneLine(item.toolName ?? "")}`
							: `result ${oneLine(item.toolName ?? "")}`;
			const sourceLines = terminalSafe(item.text).split(/\r?\n/);
			if (sourceLines.length === 0) sourceLines.push("");
			lines.push(
				truncateToWidth(
					`${this.theme.fg("muted", `${activityTimestamp(item.timestamp)} ${prefix}:`)} ${sourceLines[0]}`,
					width,
				),
			);
			for (const continuation of sourceLines.slice(1)) {
				lines.push(truncateToWidth(`  ${continuation}`, width));
			}
		}
		for (const tool of run.liveTools) {
			const activity = oneLine(tool.output || tool.input || "running");
			lines.push(
				truncateToWidth(
					this.theme.fg(
						"warning",
						`${activityTimestamp(tool.startedAt)} active ${oneLine(tool.name)}: ${activity}`,
					),
					width,
				),
			);
		}
		if (run.liveText) {
			for (const line of terminalSafe(run.liveText).split(/\r?\n/)) {
				lines.push(
					truncateToWidth(
						this.theme.fg(
							"warning",
							`${activityTimestamp(run.liveTextUpdatedAt)} live: ${line}`,
						),
						width,
					),
				);
			}
		}
		if (lines.length === 0) lines.push(this.theme.fg("dim", "(no output yet)"));
		return lines;
	}

	private viewportHeight(): number {
		return Math.max(6, (this.tui.terminal.rows || 30) - 8);
	}

	private scheduleRender(): void {
		if (this.renderTimer) return;
		this.renderTimer = setTimeout(() => {
			this.renderTimer = undefined;
			if (!this.closed) this.tui.requestRender();
		}, 50);
	}

	private close(): void {
		if (!this.cleanup()) return;
		this.done(null);
	}

	private cleanup(): boolean {
		if (this.closed) return false;
		this.closed = true;
		clearInterval(this.ticker);
		this.unsubscribe();
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = undefined;
		return true;
	}
}
