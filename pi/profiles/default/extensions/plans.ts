import { existsSync, mkdirSync, renameSync } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { copyToClipboard, type ExtensionAPI, type ExtensionCommandContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { containedRealPath, discoverPlans, parsePlan, type PlanRecord } from "../lib/plans.ts";
import { createHerdrPiTab } from "./session-launch.ts";

const planActions = [
	{ key: "o", action: "open", label: "Open in VS Code", hint: "VS Code" },
	{ key: "c", action: "copy", label: "Copy command", hint: "Copy command" },
	{ key: "r", action: "run-here", label: "Run here", hint: "Run here" },
	{ key: "d", action: "do-it", label: "Run in new tab", hint: "Run in new tab" },
	{ key: "a", action: "archive", label: "Archive", hint: "Archive" },
] as const;
type Action = typeof planActions[number]["action"] | "close";
interface Selection { action: Action; index: number }

function clean(value: string): string { return stripTerminalSequences(value).replace(/\s+/g, " ").trim(); }
function fit(value: string, width: number): string {
	const text = truncateToWidth(value, Math.max(0, width));
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}
function progress(plan: PlanRecord): string { return plan.tasks.total ? `${plan.tasks.checked}/${plan.tasks.total}` : "none"; }

export function planSelector(plans: PlanRecord[], initial: number, onDone: (value: Selection) => void, options: { details?: boolean } = {}) {
	return (tui: { requestRender(): void; terminal?: { rows: number } }, theme: Pick<Theme, "fg" | "bg" | "bold">) => {
		let selected = Math.min(Math.max(initial, 0), Math.max(plans.length - 1, 0));
		let details = options.details ?? false;
		let scroll = 0;
		let maxScroll = 0;
		let start = 0;
		let usable = true;
		return {
			render(width: number): string[] {
				const rows = tui.terminal?.rows ?? 35;
				// Match the overlay height limit so Pi never clips the controls or selection.
				const height = Math.max(1, Math.min(28, Math.floor(rows * 0.8), rows - 2));
				usable = width >= 24 && height >= 14;
				if (!usable) return ["Plans · q close", "Enlarge terminal to browse."].slice(0, height).map(text => fit(text, width));
				const inner = width - 4;
				const border = (left: string, right: string) => theme.fg("borderAccent", left + "─".repeat(width - 2) + right);
				const row = (text: string, active = false) => theme.fg("borderAccent", "│")
					+ theme.bg(active ? "selectedBg" : "customMessageBg", ` ${fit(text, inner)} `)
					+ theme.fg("borderAccent", "│");
				const muted = (text: string) => theme.fg("muted", text);
				const current = plans[selected];
				const output = [border("╭", "╮"), row(theme.bold(theme.fg("accent",
					`Plans · ${details && current ? "Details" : "Browse"} · ${current ? `${selected + 1}/${plans.length}` : "0 plans"}`))), border("├", "┤")];
				if (!current) {
					output.push(...wrapTextWithAnsi("No open plans found under .specs/.", inner).map(text => row(muted(text))), row(""), row(muted("Esc/q Close")), border("╰", "╯"));
					return output;
				}
				if (details) {
					const content = [theme.bold(clean(current.title)), "",
						`Status: ${clean(current.status ?? "unknown")} · Tasks: ${progress(current)}`, "",
						clean(current.description), "", `Path: ${clean(current.relativePath)}`,
						`Modified: ${current.modified.toISOString().slice(0, 10)}`];
					if (current.firstUnchecked) content.push(`Next: ${clean(current.firstUnchecked)}`);
					if (current.handoff) content.push(`Handoff: ${clean(current.handoff)}`);
					if (current.warnings.length) content.push(theme.fg("warning", `Warning: ${clean(current.warnings.join("; "))}`));
					const wrapped = content.flatMap(text => wrapTextWithAnsi(text, inner));
					const help = wrapTextWithAnsi("↑↓ Scroll · Esc Back · q Close", inner);
					const capacity = Math.min(wrapped.length, Math.max(1, height - 6 - planActions.length - help.length));
					maxScroll = Math.max(0, wrapped.length - capacity);
					scroll = Math.min(scroll, maxScroll);
					for (let index = 0; index < capacity; index++) output.push(row(wrapped[scroll + index] ?? ""));
					output.push(row(muted(maxScroll ? `Lines ${scroll + 1}-${Math.min(scroll + capacity, wrapped.length)}/${wrapped.length}` : "")), border("├", "┤"));
					output.push(...planActions.map(action => row(`${action.key}  ${action.label}`)));
					output.push(...help.map(text => row(theme.fg("text", text))));
				} else {
					const columns = inner >= 56;
					const statusWidth = Math.min(16, Math.max(8, ...plans.map(plan => visibleWidth(clean(plan.status ?? "unknown")))));
					const taskWidth = Math.min(11, Math.max(5, ...plans.map(plan => visibleWidth(progress(plan)))));
					const stubWidth = inner - statusWidth - taskWidth - 6;
					const cells = (stub: string, status: string, tasks: string) => `${fit(stub, stubWidth)}  ${fit(status, statusWidth)}  ${fit(tasks, taskWidth)}`;
					const help = ["↑↓ Select · Enter Details · Esc/q Close", `Actions: ${planActions.map(action => `${action.key} ${action.hint}`).join(" · ")}`]
						.flatMap(text => wrapTextWithAnsi(text, inner));
					const metadata = columns ? [] : [`Status: ${clean(current.status ?? "unknown")}`, `Tasks: ${progress(current)}`];
					// Very short, narrow panels retain all shortcuts before optional metadata.
					metadata.splice(Math.max(0, height - 6 - (columns ? 1 : 0) - help.length));
					// Reserve controls and one selectable row before allocating preview space.
					const available = height - 5 - (columns ? 1 : 0) - help.length - metadata.length;
					const preview = [theme.bold(clean(current.title)), muted(`.specs/${clean(current.stub)}/`), muted(clean(current.description))];
					if (available < 4) preview.pop();
					if (available < 3) preview.shift();
					if (available < 2) preview.pop();
					const capacity = Math.min(plans.length, Math.max(1, available - preview.length));
					start = Math.max(0, Math.min(start, selected, plans.length - capacity));
					if (selected >= start + capacity) start = selected - capacity + 1;
					if (columns) output.push(row(muted(`  ${cells("Spec stub", "Status", "Tasks")}`)));
					for (let offset = 0; offset < capacity; offset++) {
						const index = start + offset;
						const plan = plans[index];
						if (!plan) { output.push(row("")); continue; }
						const active = index === selected;
						const text = `${active ? "▶" : " "} ${columns ? cells(clean(plan.stub), clean(plan.status ?? "unknown"), progress(plan)) : clean(plan.stub)}`;
						output.push(row(active ? theme.bold(theme.fg("accent", text)) : text, active));
					}
					output.push(border("├", "┤"));
					output.push(...metadata.map(text => row(muted(text))));
					output.push(...preview.map(text => row(text)));
					output.push(...help.map(text => row(theme.fg("text", text))));
				}
				output.push(border("╰", "╯"));
				return output;
			},
			invalidate() {},
			handleInput(data: string) {
				const action = planActions.find(action => action.key === data);
				if (data === "q") return onDone({ action: "close", index: selected });
				if (matchesKey(data, Key.escape)) {
					if (!details) return onDone({ action: "close", index: selected });
					details = false;
				} else if (!plans.length || !usable) return;
				else if (action) return onDone({ action: action.action, index: selected });
				else if (details) {
					if (matchesKey(data, Key.up)) scroll = Math.max(0, scroll - 1);
					else if (matchesKey(data, Key.down)) scroll = Math.min(maxScroll, scroll + 1);
				} else if (matchesKey(data, Key.up)) selected = Math.max(0, selected - 1);
				else if (matchesKey(data, Key.down)) selected = Math.min(plans.length - 1, selected + 1);
				else if (matchesKey(data, Key.enter)) { details = true; scroll = 0; }
				tui.requestRender();
			},
		};
	};
}

export function openPlanInCode(plan: PlanRecord, cwd: string): void {
	const result = spawnSync("code", ["-g", plan.path], { cwd, shell: false, stdio: "ignore", windowsHide: true });
	if (result.error) throw result.error;
	if (typeof result.status === "number" && result.status !== 0) throw new Error(`code exited ${result.status}`);
}

export function archivePlan(plan: PlanRecord, root: string): string {
	const fresh = parsePlan(plan.path, plan.stub, root);
	if (fresh.status !== "completed") throw new Error("Plan status must be completed.");
	if (!fresh.completed || !/^\d{4}-\d{2}-\d{2}$/.test(fresh.completed) || Number.isNaN(Date.parse(`${fresh.completed}T00:00:00Z`))) throw new Error("Plan must have a valid completion date.");
	if (fresh.tasks.total - fresh.tasks.checked > 0) throw new Error("Plan still has unchecked tasks.");
	const specs = path.join(root, ".specs");
	const source = path.dirname(plan.path);
	if (!containedRealPath(source, specs) || path.basename(source) !== plan.stub || path.dirname(source) !== specs) throw new Error("Plan source escapes .specs.");
	const archive = path.join(specs, "archive");
	mkdirSync(archive, { recursive: true });
	const destination = path.join(archive, plan.stub);
	if (existsSync(destination)) throw new Error(`Archive destination already exists: ${path.relative(root, destination)}`);
	renameSync(source, destination);
	return destination;
}

export async function executePlans(ctx: ExtensionCommandContext, pi: Pick<ExtensionAPI, "sendUserMessage">): Promise<void> {
	if (ctx.mode !== "tui") throw new Error("/plans requires interactive Pi terminal mode.");
	const root = path.resolve(ctx.cwd ?? process.cwd());
	let selected = 0;
	let detailStub: string | undefined;
	while (true) {
		const discovery = discoverPlans(root);
		for (const error of discovery.errors) ctx.ui.notify(error, "warning");
		const detailIndex = discovery.plans.findIndex(plan => plan.stub === detailStub);
		if (detailIndex >= 0) selected = detailIndex;
		const result = await ctx.ui.custom<Selection>((tui, theme, _keybindings, done) => planSelector(discovery.plans, selected, done, { details: detailIndex >= 0 })(tui, theme), {
			overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "80%", margin: 1 },
		});
		if (!result || result.action === "close") return;
		selected = result.index;
		const plan = discovery.plans[selected];
		if (!plan) continue;
		detailStub = plan.stub;
		try {
			if (result.action === "open") openPlanInCode(plan, root);
			else if (result.action === "copy") {
				await copyToClipboard(`/do-it ${plan.relativePath}`);
				ctx.ui.notify(`Copied /do-it command for ${plan.stub}.`, "info");
			} else if (result.action === "run-here") {
				pi.sendUserMessage(`/do-it ${plan.relativePath}`, { expandPromptTemplates: true, deliverAs: "followUp" });
				return;
			} else if (result.action === "do-it") {
				if (process.env.HERDR_ENV !== "1") throw new Error("Plan execution from /plans requires a Herdr-managed Pi session.");
				createHerdrPiTab(root, `do-it · ${plan.stub}`.slice(0, 80), undefined, plan.relativePath);
				ctx.ui.notify(`Opened /do-it for ${plan.stub} in a Herdr Pi tab.`, "info");
			} else {
				const destination = path.join(root, ".specs", "archive", plan.stub);
				const confirmed = await ctx.ui.confirm("Archive completed plan?", `${plan.relativePath}\n→ ${path.relative(root, destination).replace(/\\/g, "/")}`);
				if (confirmed) { archivePlan(plan, root); detailStub = undefined; ctx.ui.notify(`Archived ${plan.stub}.`, "info"); }
			}
		} catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
	}
}

export default function plansCommand(pi: ExtensionAPI): void {
	pi.registerCommand("plans", { description: "Browse open implementation plans", handler: async (args, ctx) => {
		if (args.trim()) throw new Error("Usage: /plans");
		await executePlans(ctx, pi);
	} });
}
