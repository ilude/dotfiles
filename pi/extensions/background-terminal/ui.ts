import type {
	ExtensionCommandContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import type {
	BackgroundTerminalManager,
	BackgroundTerminalSnapshot,
	BackgroundTerminalStatus,
} from "./manager.js";

interface DashboardSelection {
	id?: string;
	index: number;
}

export function formatBackgroundTerminalActivity(
	terminals: readonly Pick<BackgroundTerminalSnapshot, "status">[],
): string | undefined {
	if (terminals.length === 0) return undefined;
	const running = terminals.filter((item) => item.status === "running").length;
	const failed = terminals.filter((item) => item.status === "failed").length;
	const parts = [
		`${running} running`,
		failed > 0 ? `${failed} failed` : "",
	].filter(Boolean);
	return `background ${parts.join(", ")} (/ps)`;
}

export function reconcileBackgroundTerminalSelection(
	selection: DashboardSelection,
	terminals: readonly Pick<BackgroundTerminalSnapshot, "id">[],
): void {
	const stableIndex = selection.id
		? terminals.findIndex((item) => item.id === selection.id)
		: -1;
	selection.index =
		stableIndex >= 0
			? stableIndex
			: Math.min(
					Math.max(0, selection.index),
					Math.max(0, terminals.length - 1),
				);
	selection.id = terminals[selection.index]?.id;
}

function elapsed(item: BackgroundTerminalSnapshot): string {
	const end = item.endedAt ?? Date.now();
	const seconds = Math.max(0, Math.round((end - item.startedAt) / 1000));
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return minutes > 0
		? `${minutes}m${String(remainder).padStart(2, "0")}s`
		: `${seconds}s`;
}

function statusLabel(status: BackgroundTerminalStatus): string {
	switch (status) {
		case "running":
			return "RUN";
		case "completed":
			return "DONE";
		case "failed":
			return "FAIL";
		case "killed":
			return "KILL";
	}
}

function statusColor(
	status: BackgroundTerminalStatus,
): "warning" | "success" | "error" | "muted" {
	switch (status) {
		case "running":
			return "warning";
		case "completed":
			return "success";
		case "failed":
			return "error";
		case "killed":
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
					if (current === 0x1b && value.charCodeAt(index + 1) === 0x5c) {
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
		if (code === 0x0d) {
			if (value.charCodeAt(index + 1) !== 0x0a) result += "\n";
			continue;
		}
		if (
			(code < 0x20 && code !== 0x09 && code !== 0x0a) ||
			(code >= 0x7f && code <= 0x9f)
		) {
			continue;
		}
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

export async function openBackgroundTerminalDashboard(
	ctx: ExtensionCommandContext,
	manager: BackgroundTerminalManager,
): Promise<void> {
	const selection: DashboardSelection = { index: 0 };
	while (true) {
		if (manager.list().length === 0) {
			ctx.ui.notify("No background terminals are tracked.", "info");
			return;
		}
		const selected = await ctx.ui.custom<string | null>(
			(tui, theme, keybindings, done) =>
				new TerminalDashboard(
					tui,
					theme,
					keybindings,
					manager,
					selection,
					done,
				),
			{
				overlay: true,
				overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
			},
		);
		if (!selected) return;
		if (!manager.get(selected)) continue;
		await openTerminalDetail(ctx, manager, selected);
	}
}

async function openTerminalDetail(
	ctx: ExtensionCommandContext,
	manager: BackgroundTerminalManager,
	id: string,
): Promise<void> {
	await ctx.ui.custom<null>(
		(tui, theme, keybindings, done) =>
			new TerminalDetail(tui, theme, keybindings, manager, id, done),
		{
			overlay: true,
			overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
		},
	);
}

class TerminalDashboard implements Component {
	private closed = false;
	private renderTimer?: ReturnType<typeof setTimeout>;
	private readonly ticker: ReturnType<typeof setInterval>;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly manager: BackgroundTerminalManager,
		private readonly selection: DashboardSelection,
		private readonly done: (value: string | null) => void,
	) {
		this.ticker = setInterval(() => this.tui.requestRender(), 1_000);
		this.unsubscribe = manager.subscribe(() => this.scheduleRender());
	}

	dispose(): void {
		this.cleanup();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const items = this.manager.list();
		reconcileBackgroundTerminalSelection(this.selection, items);
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.close(null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.close(items[this.selection.index]?.id ?? null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up") || data === "k") {
			if (items.length > 0) {
				this.selection.index =
					(this.selection.index - 1 + items.length) % items.length;
				this.selection.id = items[this.selection.index]?.id;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down") || data === "j") {
			if (items.length > 0) {
				this.selection.index = (this.selection.index + 1) % items.length;
				this.selection.id = items[this.selection.index]?.id;
				this.tui.requestRender();
			}
			return;
		}
		if (data === "x") {
			const selected = items[this.selection.index];
			if (selected?.status === "running") {
				void this.manager.kill([selected.id], false);
			}
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const items = this.manager.list();
		reconcileBackgroundTerminalSelection(this.selection, items);
		const bodyHeight = Math.max(5, (this.tui.terminal.rows || 30) - 6);
		const lines = [
			truncateToWidth(
				this.theme.fg("accent", this.theme.bold("Background terminals")) +
					this.theme.fg("muted", ` (${items.length} tracked)`),
				safeWidth,
			),
			this.theme.fg("border", "-".repeat(safeWidth)),
		];
		let start = 0;
		if (items.length > bodyHeight) {
			start = Math.min(
				Math.max(0, this.selection.index - Math.floor(bodyHeight / 2)),
				items.length - bodyHeight,
			);
		}
		const visible = items.slice(start, start + bodyHeight);
		for (let offset = 0; offset < bodyHeight; offset++) {
			const item = visible[offset];
			if (!item) {
				lines.push("");
				continue;
			}
			const selected = start + offset === this.selection.index;
			const status = this.theme.fg(
				statusColor(item.status),
				statusLabel(item.status).padEnd(5),
			);
			const right = `${item.id} | ${elapsed(item)}`;
			const leftWidth = Math.max(8, safeWidth - visibleWidth(right) - 3);
			const left = truncateToWidth(
				`${selected ? ">" : " "} ${status} ${oneLine(item.title)}`,
				leftWidth,
			);
			const gap = Math.max(1, safeWidth - visibleWidth(left) - visibleWidth(right));
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
					`${configuredKeys(this.keybindings, "tui.select.up")}/${configuredKeys(this.keybindings, "tui.select.down")}/j/k select | ${configuredKeys(this.keybindings, "tui.select.confirm")} details | x kill | ${configuredKeys(this.keybindings, "tui.select.cancel")} close`,
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

	private close(value: string | null): void {
		if (!this.cleanup()) return;
		this.done(value);
	}

	private cleanup(): boolean {
		if (this.closed) return false;
		this.closed = true;
		clearInterval(this.ticker);
		this.unsubscribe();
		if (this.renderTimer) clearTimeout(this.renderTimer);
		return true;
	}
}

const SCROLL_STEP = 6;

class TerminalDetail implements Component {
	private closed = false;
	private stream: "stdout" | "stderr" = "stdout";
	private scrollOffset = 0;
	private renderTimer?: ReturnType<typeof setTimeout>;
	private readonly ticker: ReturnType<typeof setInterval>;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly manager: BackgroundTerminalManager,
		private readonly id: string,
		private readonly done: (value: null) => void,
	) {
		this.ticker = setInterval(() => this.tui.requestRender(), 1_000);
		this.unsubscribe = manager.subscribe(() => this.scheduleRender());
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
			const item = this.manager.get(this.id);
			if (item?.status === "running") void this.manager.kill([this.id], false);
			return;
		}
		if (data === "\t") {
			this.stream = this.stream === "stdout" ? "stderr" : "stdout";
			this.scrollOffset = 0;
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorUp")) {
			this.scrollOffset += SCROLL_STEP;
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorDown")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - SCROLL_STEP);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.pageUp")) {
			this.scrollOffset += this.viewportHeight();
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.pageDown")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - this.viewportHeight());
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const item = this.manager.get(this.id);
		const border = this.theme.fg("border", "-".repeat(safeWidth));
		if (!item) return [border, "Terminal is no longer tracked.", border];
		const header = `${statusLabel(item.status)} ${oneLine(item.title)} | ${item.id} | ${elapsed(item)}`;
		const metadata = `pid ${item.pid ?? "?"} | ${oneLine(item.cwd)} | exit ${item.exitCode ?? "-"}`;
		const command = `command: ${oneLine(item.command)}`;
		const raw = this.stream === "stdout" ? item.stdout : item.stderr;
		const truncated =
			this.stream === "stdout" ? item.stdoutTruncated : item.stderrTruncated;
		const body = terminalSafe(raw).split(/\r?\n/);
		if (body.length === 1 && !body[0]) body[0] = "(no output yet)";
		if (truncated) body.unshift("[in-memory output capped; full log path shown above]");
		const viewport = this.viewportHeight();
		const maxOffset = Math.max(0, body.length - viewport);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const end = body.length - this.scrollOffset;
		const visible = body.slice(Math.max(0, end - viewport), end);
		const path = this.stream === "stdout" ? item.stdoutPath : item.stderrPath;
		const lines = [
			border,
			this.theme.fg(statusColor(item.status), truncateToWidth(header, safeWidth)),
			this.theme.fg("dim", truncateToWidth(metadata, safeWidth)),
			this.theme.fg("muted", truncateToWidth(command, safeWidth)),
			this.theme.fg("dim", truncateToWidth(`${this.stream}: ${path ?? "unavailable"}`, safeWidth)),
			border,
			...visible.map((line) => truncateToWidth(line, safeWidth)),
		];
		while (lines.length < viewport + 6) lines.push("");
		lines.push(border);
		lines.push(
			truncateToWidth(
				this.theme.fg(
					"dim",
					`tab stdout/stderr | x kill | arrows/page scroll | ${configuredKeys(this.keybindings, "tui.select.cancel")} back`,
				),
				safeWidth,
			),
		);
		return lines.map((line) => pad(line, safeWidth));
	}

	private viewportHeight(): number {
		return Math.max(5, (this.tui.terminal.rows || 30) - 10);
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
		return true;
	}
}
