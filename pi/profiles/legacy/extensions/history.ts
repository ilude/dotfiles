import {
	copyToClipboard,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
	matchesKey,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { reportActionableExtensionFailure } from "../lib/extension-diagnostics.js";
import { registerSlashCommand } from "../lib/slash-command-echo.js";

export interface PromptHistoryItem {
	entryId: string;
	text: string;
}
export type PromptHistoryAction = "recall" | "copy" | "navigate" | "fork";
export interface PromptHistoryResult {
	action: PromptHistoryAction;
	entryId: string;
	text: string;
}
interface SessionEntryLike {
	type?: unknown;
	id?: unknown;
	message?: { role?: unknown; content?: unknown };
}

function messageText(content: unknown): string | undefined {
	if (typeof content === "string") return content.length > 0 ? content : undefined;
	if (!Array.isArray(content)) return undefined;
	const blocks = content
		.filter(
			(block): block is { type: "text"; text: string } =>
				Boolean(block) && typeof block === "object" &&
				(block as { type?: unknown }).type === "text" &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text);
	if (blocks.length === 0 || blocks.every((block) => block.length === 0)) return undefined;
	return blocks.join("\n");
}

export function extractPromptHistory(entries: readonly SessionEntryLike[]): PromptHistoryItem[] {
	const items: PromptHistoryItem[] = [];
	for (const entry of entries) {
		if (entry.type !== "message" || typeof entry.id !== "string" || entry.message?.role !== "user") continue;
		const text = messageText(entry.message.content);
		if (text !== undefined) items.push({ entryId: entry.id, text });
	}
	return items;
}

function oneLine(value: string): string {
	return stripTerminalSequences(value).replace(/\s+/g, " ").trim();
}
function pad(text: string, width: number): string {
	const bounded = truncateToWidth(text, Math.max(0, width));
	return bounded + " ".repeat(Math.max(0, width - visibleWidth(bounded)));
}
function configuredKeys(keybindings: KeybindingsManager, binding: Parameters<KeybindingsManager["getKeys"]>[0]): string {
	return keybindings.getKeys(binding).join("/") || "unbound";
}

export class PromptHistoryOverlay implements Component {
	private ordered: PromptHistoryItem[];
	private selectedId: string;
	private selectedIndex: number;
	private query = "";
	private searchActive = false;
	private expanded = false;
	private pageSize = 1;
	private closed = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		items: readonly PromptHistoryItem[],
		private readonly done: (result: PromptHistoryResult | null) => void,
	) {
		this.ordered = [...items];
		this.selectedIndex = Math.max(0, this.ordered.length - 1);
		this.selectedId = this.ordered[this.selectedIndex]?.entryId ?? "";
	}

	invalidate(): void {}
	dispose(): void { this.closed = true; }

	handleInput(data: string): void {
		this.reconcileSelection(this.visibleItems());
		if (matchesKey(data, "escape")) {
			if (this.searchActive) {
				this.searchActive = false;
				this.query = "";
				this.requestRender();
			} else this.close(null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.cancel")) { this.close(null); return; }
		if (this.keybindings.matches(data, "tui.select.up")) { this.move(-1); return; }
		if (this.keybindings.matches(data, "tui.select.down")) { this.move(1); return; }
		if (this.keybindings.matches(data, "tui.select.pageUp")) { this.move(-this.pageSize); return; }
		if (this.keybindings.matches(data, "tui.select.pageDown")) { this.move(this.pageSize); return; }
		if (this.keybindings.matches(data, "tui.select.confirm")) { this.select("navigate"); return; }
		if (this.searchActive) {
			if (matchesKey(data, "backspace")) {
				this.query = [...this.query].slice(0, -1).join("");
				this.selectedIndex = 0;
				this.requestRender();
			} else if (this.isPrintable(data)) {
				this.query += data;
				this.selectedIndex = 0;
				this.requestRender();
			}
			return;
		}
		if (data === "/") { this.searchActive = true; this.requestRender(); return; }
		if (data === "r") { this.ordered.reverse(); this.requestRender(); return; }
		if (data === "v" || matchesKey(data, "space")) { this.expanded = !this.expanded; this.requestRender(); return; }
		if (data === "e") this.select("recall");
		else if (data === "c" || data === "y") this.select("copy");
		else if (data === "b") this.select("navigate");
		else if (data === "f") this.select("fork");
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const visible = this.visibleItems();
		this.reconcileSelection(visible);
		const rows = this.tui.terminal.rows || 30;
		const detailHeight = this.expanded && visible.length > 0 ? Math.min(6, Math.max(2, Math.floor(rows / 4))) : 0;
		const bodyHeight = Math.max(1, rows - 7 - detailHeight);
		this.pageSize = bodyHeight;
		const start = Math.min(Math.max(0, this.selectedIndex - bodyHeight + 1), Math.max(0, visible.length - bodyHeight));
		const lines = [
			truncateToWidth(this.theme.fg("accent", this.theme.bold("Prompt history")) + this.theme.fg("muted", ` (${visible.length}/${this.ordered.length})`), safeWidth),
			this.theme.fg("border", "-".repeat(safeWidth)),
		];
		if (visible.length === 0) {
			lines.push(this.theme.fg("warning", this.query ? `No prompts match "${oneLine(this.query)}".` : "No textual user prompts on the active branch."));
			while (lines.length < bodyHeight + 2) lines.push("");
		} else {
			for (let offset = 0; offset < bodyHeight; offset++) {
				const item = visible[start + offset];
				if (!item) { lines.push(""); continue; }
				const selected = start + offset === this.selectedIndex;
				const preview = truncateToWidth(`${selected ? "> " : "  "}${oneLine(item.text)}`, safeWidth);
				lines.push(selected ? this.theme.bg("selectedBg", preview) : preview);
			}
		}
		if (detailHeight > 0) {
			const item = visible[this.selectedIndex];
			lines.push(this.theme.fg("border", "-".repeat(safeWidth)));
			const wrapped = wrapTextWithAnsi(stripTerminalSequences(item?.text ?? ""), Math.max(1, safeWidth)).slice(0, detailHeight);
			for (const line of wrapped) lines.push(truncateToWidth(line, safeWidth));
			for (let index = wrapped.length; index < detailHeight; index++) lines.push("");
		}
		lines.push(this.theme.fg("border", "-".repeat(safeWidth)));
		lines.push(truncateToWidth(this.searchActive
			? this.theme.fg("accent", `Search: ${this.query}`) + this.theme.fg("dim", " | type to filter | Enter navigate | Esc clear")
			: this.theme.fg("dim", `${configuredKeys(this.keybindings, "tui.select.up")}/${configuredKeys(this.keybindings, "tui.select.down")} select | ${configuredKeys(this.keybindings, "tui.select.pageUp")}/${configuredKeys(this.keybindings, "tui.select.pageDown")} page | / search | v/Space view | r reverse`), safeWidth));
		lines.push(truncateToWidth(this.theme.fg("dim", `e recall | c/y copy | ${configuredKeys(this.keybindings, "tui.select.confirm")}/b navigate | f fork | ${configuredKeys(this.keybindings, "tui.select.cancel")} close`), safeWidth));
		return lines.map((line) => pad(line, safeWidth));
	}

	private visibleItems(): PromptHistoryItem[] {
		if (!this.query) return this.ordered;
		const query = this.query.toLocaleLowerCase();
		return this.ordered.filter((item) => item.text.toLocaleLowerCase().includes(query));
	}
	private reconcileSelection(items: readonly PromptHistoryItem[]): void {
		if (items.length === 0) { this.selectedIndex = 0; return; }
		const stable = items.findIndex((item) => item.entryId === this.selectedId);
		if (stable >= 0) this.selectedIndex = stable;
		else this.selectedIndex = Math.min(Math.max(0, this.selectedIndex), items.length - 1);
	}
	private move(delta: number): void {
		const items = this.visibleItems();
		if (items.length === 0) return;
		this.reconcileSelection(items);
		this.selectedIndex = Math.min(Math.max(0, this.selectedIndex + delta), items.length - 1);
		this.selectedId = items[this.selectedIndex]?.entryId ?? this.selectedId;
		this.requestRender();
	}
	private select(action: PromptHistoryAction): void {
		const items = this.visibleItems();
		this.reconcileSelection(items);
		const item = items[this.selectedIndex];
		if (!item) return;
		this.selectedId = item.entryId;
		this.close({ action, entryId: item.entryId, text: item.text });
	}
	private close(result: PromptHistoryResult | null): void {
		if (this.closed) return;
		this.closed = true;
		this.done(result);
	}
	private requestRender(): void { if (!this.closed) this.tui.requestRender(); }
	private isPrintable(data: string): boolean { return data.length > 0 && !/[\u0000-\u001f\u007f]/u.test(data); }
}

export async function runPromptHistory(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/history is available only in interactive TUI mode.", "warning");
		return;
	}
	const items = extractPromptHistory(ctx.sessionManager.getBranch());
	if (items.length === 0) {
		ctx.ui.notify("No textual user prompts on the active branch.", "info");
		return;
	}
	const result = await ctx.ui.custom<PromptHistoryResult | null>(
		(tui, theme, keybindings, done) => new PromptHistoryOverlay(tui, theme, keybindings, items, done),
		{ overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" } },
	);
	if (!result) return;
	try {
		if (result.action === "recall") { ctx.ui.setEditorText(result.text); return; }
		if (result.action === "copy") {
			await copyToClipboard(result.text);
			ctx.ui.notify("Copied prompt.", "info");
			return;
		}
		if (result.action === "navigate") {
			const navigation = await ctx.navigateTree(result.entryId, { summarize: false });
			if (navigation.cancelled) ctx.ui.notify("Prompt navigation was cancelled.", "warning");
			return;
		}
		const fork = await ctx.fork(result.entryId);
		if (fork.cancelled) ctx.ui.notify("Prompt fork was cancelled.", "warning");
		return;
	} catch (error) {
		const message = `History action failed: ${error instanceof Error ? error.message : String(error)}`;
		reportActionableExtensionFailure(pi, ctx, {
			extension: "history",
			failure: message,
			nextAction: "Inspect the active session state and retry the history action.",
		});
	}
}

export default function (pi: ExtensionAPI): void {
	registerSlashCommand(pi)("history", {
		description: "Search and act on user prompts in the active session branch",
		handler: async (_args, ctx) => runPromptHistory(pi, ctx),
	});
}
